'use client';

import { InfoCircleOutlined, LoadingOutlined, ReloadOutlined, CopyOutlined } from '@ant-design/icons';
import { App, Button, Modal, Tag } from 'antd';
import { useEffect, useState } from 'react';
import { collectNetworkDiagnostics, type NetworkDiagnostics, type AddressKind } from '../networkDiagnostics';
import { copyShareCode } from '../clipboard';

const kindLabels: Record<AddressKind, string> = {
  private: '内网 / 局域网 IP', 'link-local': '链路本地 IP', loopback: '本机回环 IP',
  public: '公网地址', mdns: 'mDNS 隐藏地址', unknown: '其他地址'
};
const statusLabels = { complete: '已完成', timeout: '超时（可能不完整）', unsupported: '浏览器不支持', error: '探测失败' };

function ValueRow({ label, value }: { label: string; value: string | null | undefined }) {
  return <div className="cloud-network-row"><dt>{label}</dt><dd>{value || '未获取到'}</dd></div>;
}

export default function NetworkInfo() {
  const { message } = App.useApp();
  const [open, setOpen] = useState(false);
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<NetworkDiagnostics | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    setResult(null);
    setError('');
    void collectNetworkDiagnostics(controller.signal).then(data => {
      if (!controller.signal.aborted) setResult(data);
    }).catch(cause => {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : '探测失败，请重试');
    });
    return () => controller.abort();
  }, [revision]);

  const loading = !result && !error;
  const request = result?.request.data;
  const copy = async () => {
    if (!result) return;
    const copied = await copyShareCode(JSON.stringify(result, null, 2));
    if (copied) message.success('网络探测 JSON 已复制');
    else message.warning('复制失败，请在原始 JSON 中手动选择复制');
  };

  return <>
    <button type="button" className="app-icon-button cloud-network-trigger" aria-label="查看网络探测信息" title="网络探测信息" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)}>
      {loading ? <LoadingOutlined /> : <InfoCircleOutlined />}
    </button>
    <Modal title="网络探测信息" open={open} onCancel={() => setOpen(false)} centered width={680}
      footer={<div className="flex flex-wrap justify-end gap-2">
        <Button icon={<ReloadOutlined />} disabled={loading} onClick={() => { setResult(null); setError(''); setRevision(value => value + 1); }}>重新探测</Button>
        <Button icon={<CopyOutlined />} disabled={!result} onClick={() => void copy()}>复制 JSON</Button>
        <Button type="primary" onClick={() => setOpen(false)}>关闭</Button>
      </div>}>
      <div className="cloud-network-body" aria-live="polite" aria-busy={loading}>
        {loading && <div className="cloud-network-loading" role="status"><LoadingOutlined /> 正在收集 ICE 与请求来源，最多等待约 8 秒…</div>}
        {error && <p role="alert">{error}</p>}
        {result && <>
          <p className="cloud-network-note">采集时间：{new Date(result.collectedAt).toLocaleString()}。内网与局域网地址合并列出；无法获取的值保留为空。</p>
          <section className="cloud-network-section" aria-label="WebRTC ICE 探测结果">
            <h3>浏览器 · WebRTC ICE <Tag color={result.ice.status === 'complete' ? 'green' : 'orange'}>{statusLabels[result.ice.status]}</Tag></h3>
            <dl>
              <ValueRow label="内网 / 局域网 IP" value={result.ice.localIps.join('、')} />
              <ValueRow label="mDNS 名称" value={result.ice.mdnsNames.join('、')} />
            </dl>
            <p className="cloud-network-note">收集本机 host 候选，不请求摄像头或麦克风，不使用 STUN / TURN。若只有 .local 名称，说明浏览器隐藏了真实 IP；探测完成不代表能读取全部网卡。</p>
            {result.ice.candidates.length === 0 && <p className="cloud-network-note">没有获取到 ICE 候选地址。</p>}
            {result.ice.candidates.map((item, index) => <div className="cloud-network-candidate" key={item.candidate}>
              <div className="flex flex-wrap items-center gap-2"><strong>候选 {index + 1}</strong><Tag>{item.type}</Tag><span>{kindLabels[item.kind]}</span></div>
              <dl>
                <ValueRow label="地址" value={item.address} />
                <ValueRow label="传输协议 / 端口" value={`${item.protocol} / ${item.port ?? '未知'}`} />
                {item.relatedAddress && <ValueRow label="关联地址" value={item.relatedAddress} />}
              </dl>
            </div>)}
            {result.ice.errors.map((item, index) => <p key={index} className="cloud-network-note">{item}</p>)}
          </section>
          <section className="cloud-network-section" aria-label="HTTP 请求来源结果">
            <h3>服务端 · HTTP 请求 <Tag color={result.request.status === 'complete' ? 'green' : 'orange'}>{statusLabels[result.request.status]}</Tag></h3>
            {request ? <>
              <dl>
                <ValueRow label="请求来源 IP" value={request.requestIp} />
                <ValueRow label="来源判定依据" value={request.requestIpSource === 'socket' ? 'TCP 连接对端（socket）' : '可信代理链（X-Forwarded-For）'} />
                <ValueRow label="TCP 对端原始地址" value={request.socketAddress} />
                <ValueRow label="X-Forwarded-For" value={request.headers.xForwardedFor} />
                <ValueRow label="X-Real-IP" value={request.headers.xRealIp} />
                <ValueRow label="Forwarded" value={request.headers.forwarded} />
              </dl>
              <p className="cloud-network-note">{request.proxyTrusted ? '连接对端匹配可信代理配置；请求来源按代理链解析。' : '连接对端未配置为可信代理；请求来源采用 TCP 对端地址。'} 转发头按原值展示，可能由客户端提供。公网访问的来源通常是网络出口或代理地址。</p>
            </> : <p role="alert">{result.request.error}</p>}
          </section>
          <details className="cloud-network-section"><summary>原始 JSON（含 ICE 原始候选）</summary><pre className="cloud-network-json">{JSON.stringify(result, null, 2)}</pre></details>
        </>}
      </div>
    </Modal>
  </>;
}
