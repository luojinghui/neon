export type ProbeStatus = 'complete' | 'timeout' | 'unsupported' | 'error';
export type AddressKind = 'private' | 'link-local' | 'loopback' | 'public' | 'mdns' | 'unknown';

export interface IceAddress {
  address: string;
  kind: AddressKind;
  type: string;
  protocol: string;
  port: number | null;
  relatedAddress: string | null;
  candidate: string;
}

export interface IceProbe {
  status: ProbeStatus;
  stunServer: string;
  candidates: IceAddress[];
  mappedIps: string[];
  localIps: string[];
  mdnsNames: string[];
  errors: string[];
}

export interface RequestSource {
  requestIp: string | null;
  requestIpSource: 'socket' | 'x-forwarded-for';
  socketIp: string | null;
  socketAddress: string;
  proxyTrusted: boolean;
  headers: { xForwardedFor: string; xRealIp: string; forwarded: string };
  observedAt: string;
}

export interface NetworkDiagnostics {
  collectedAt: string;
  ice: IceProbe;
  request: { status: 'complete' | 'timeout' | 'error'; data: RequestSource | null; error: string | null };
}

const PROBE_TIMEOUT_MS = 8000;
const STUN_SERVER = 'stun:8.137.55.241:3478';

export function classifyAddress(address: string): AddressKind {
  const value = address.toLowerCase();
  if (value.endsWith('.local') || value.endsWith('.local.')) return 'mdns';
  const ipv4 = value.replace(/^::ffff:(?=\d+\.)/, '');
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(ipv4)) {
    const parts = ipv4.split('.').map(Number);
    if (parts.some(part => part > 255)) return 'unknown';
    const [a, b] = parts;
    if (a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)) return 'private';
    if (a === 169 && b === 254) return 'link-local';
    if (a === 127) return 'loopback';
    if (a === 0 || a >= 224 || (a === 100 && b >= 64 && b <= 127)) return 'unknown';
    return 'public';
  }
  try {
    const host = new URL(`http://[${value}]/`).hostname.slice(1, -1);
    if (host === '::1') return 'loopback';
    if (/^f[cd]/.test(host)) return 'private';
    if (/^fe[89ab]/.test(host)) return 'link-local';
    if (/^[23]/.test(host)) return 'public';
  } catch { /* Not an IPv6 literal. */ }
  return 'unknown';
}

export function readIceAddress(candidate: RTCIceCandidate): IceAddress | null {
  const raw = candidate.candidate || '';
  if (!raw) return null;
  // Keep a fallback for implementations missing the parsed candidate properties.
  const tokens = raw.trim().split(/\s+/);
  const address = candidate.address || tokens[4];
  if (!address) return null;
  const typeIndex = tokens.indexOf('typ');
  const relatedIndex = tokens.indexOf('raddr');
  return {
    address,
    kind: classifyAddress(address),
    type: candidate.type || (typeIndex >= 0 ? tokens[typeIndex + 1] : '') || 'unknown',
    protocol: candidate.protocol || tokens[2]?.toLowerCase() || 'unknown',
    port: candidate.port ?? (Number(tokens[5]) || null),
    relatedAddress: candidate.relatedAddress || (relatedIndex >= 0 ? tokens[relatedIndex + 1] : null),
    candidate: raw
  };
}

export function collectIce(signal: AbortSignal, timeoutMs = PROBE_TIMEOUT_MS): Promise<IceProbe> {
  return new Promise((resolve, reject) => {
    const candidates: IceAddress[] = [];
    const errors: string[] = [];
    let peer: RTCPeerConnection | undefined;
    let channel: RTCDataChannel | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let done = false;

    const cleanup = () => {
      clearTimeout(timer);
      signal.removeEventListener('abort', abort);
      if (peer) {
        peer.onicecandidate = null;
        peer.onicegatheringstatechange = null;
        peer.onicecandidateerror = null;
      }
      channel?.close();
      peer?.close();
    };
    const finish = (status: ProbeStatus) => {
      if (done) return;
      done = true;
      cleanup();
      resolve({
        status,
        stunServer: STUN_SERVER,
        candidates,
        mappedIps: [...new Set(candidates.filter(item => item.type === 'srflx' && !['mdns', 'unknown'].includes(item.kind)).map(item => item.address))],
        localIps: [...new Set(candidates.filter(item => item.type === 'host' && ['private', 'link-local'].includes(item.kind)).map(item => item.address))],
        mdnsNames: [...new Set(candidates.filter(item => item.kind === 'mdns').map(item => item.address))],
        errors
      });
    };
    const abort = () => {
      if (done) return;
      done = true;
      cleanup();
      reject(new DOMException('探测已取消', 'AbortError'));
    };

    if (signal.aborted) { abort(); return; }
    signal.addEventListener('abort', abort, { once: true });
    if (typeof RTCPeerConnection === 'undefined') { finish('unsupported'); return; }

    try {
      // Gather local candidates and the address observed by our STUN server without media access.
      peer = new RTCPeerConnection({ iceServers: [{ urls: STUN_SERVER }], iceTransportPolicy: 'all' });
      peer.onicecandidate = ({ candidate }) => {
        if (!candidate) { finish('complete'); return; }
        const item = readIceAddress(candidate);
        if (item && !candidates.some(existing => existing.candidate === item.candidate)) candidates.push(item);
      };
      peer.onicegatheringstatechange = () => {
        if (peer?.iceGatheringState === 'complete') finish('complete');
      };
      peer.onicecandidateerror = event => {
        errors.push(`ICE ${event.errorCode}: ${event.errorText || '候选地址收集失败'}`);
      };
      timer = setTimeout(() => finish('timeout'), timeoutMs);
      channel = peer.createDataChannel('cloud-network-diagnostics');
      const connection = peer;
      void connection.createOffer().then(offer => {
        if (!done) return connection.setLocalDescription(offer);
      }).catch(error => {
        if (done) return;
        errors.push(error instanceof Error ? error.message : String(error));
        finish('error');
      });
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
      finish('error');
    }
  });
}

export async function collectRequestSource(signal: AbortSignal, timeoutMs = PROBE_TIMEOUT_MS): Promise<NetworkDiagnostics['request']> {
  const controller = new AbortController();
  let timedOut = false;
  const abort = () => controller.abort();
  if (signal.aborted) throw new DOMException('探测已取消', 'AbortError');
  signal.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
  try {
    const response = await fetch('/api/cloud/network-info', { signal: controller.signal, cache: 'no-store' });
    if (!response.ok) throw new Error(`请求失败（HTTP ${response.status}）`);
    const data: RequestSource = await response.json();
    if (!data || !data.headers || !['socket', 'x-forwarded-for'].includes(data.requestIpSource)) throw new Error('请求来源接口返回格式异常');
    return { status: 'complete', data, error: null };
  } catch (error) {
    if (signal.aborted) throw new DOMException('探测已取消', 'AbortError');
    return { status: timedOut ? 'timeout' : 'error', data: null, error: timedOut ? '请求来源探测超时' : error instanceof Error ? error.message : String(error) };
  } finally {
    clearTimeout(timer);
    signal.removeEventListener('abort', abort);
  }
}

export async function collectNetworkDiagnostics(signal: AbortSignal): Promise<NetworkDiagnostics> {
  const [ice, request] = await Promise.all([collectIce(signal), collectRequestSource(signal)]);
  return { collectedAt: new Date().toISOString(), ice, request };
}
