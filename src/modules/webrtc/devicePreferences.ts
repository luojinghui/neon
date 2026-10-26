import type { CallMode } from './types';

export const CALL_DEVICE_PREFERENCES_KEY = 'soul-call-device-preferences-v1';
export type CallDevicePreferences = { microphoneEnabled: boolean; cameraEnabled: boolean };
type SavedPreferences = Partial<CallDevicePreferences>;
type PreferenceStorage = Pick<Storage, 'getItem' | 'setItem'>;

function browserStorage(): PreferenceStorage | undefined {
  try { return typeof localStorage === 'undefined' ? undefined : localStorage; }
  catch { return undefined; }
}

function read(storage: PreferenceStorage | undefined): SavedPreferences {
  try {
    const value: unknown = JSON.parse(storage?.getItem(CALL_DEVICE_PREFERENCES_KEY) || '{}');
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    const saved = value as Record<string, unknown>;
    return {
      ...(typeof saved.microphoneEnabled === 'boolean' ? { microphoneEnabled: saved.microphoneEnabled } : {}),
      ...(typeof saved.cameraEnabled === 'boolean' ? { cameraEnabled: saved.cameraEnabled } : {})
    };
  } catch { return {}; }
}

/** A voice entry never acquires a camera, even if video was enabled last time. */
export function preferredCallDevices(mode: CallMode, storage = browserStorage()): CallDevicePreferences {
  const saved = read(storage);
  return { microphoneEnabled: saved.microphoneEnabled ?? true, cameraEnabled: mode === 'video' && (saved.cameraEnabled ?? true) };
}

/** Persist deliberate device choices, not hangup, permission failures or track endings. */
export function rememberCallDevice(kind: 'audio' | 'video', enabled: boolean, storage = browserStorage()): void {
  try {
    storage?.setItem(CALL_DEVICE_PREFERENCES_KEY, JSON.stringify({ ...read(storage), [kind === 'audio' ? 'microphoneEnabled' : 'cameraEnabled']: enabled }));
  } catch { /* Calls remain usable when browser storage is unavailable. */ }
}
