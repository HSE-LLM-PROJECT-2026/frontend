type ImportMetaEnvShape = ImportMeta & {
  env: Record<string, string | undefined>;
};

type RuntimeWindow = Window & {
  __APP_CONFIG__?: {
    DEMO_MODE?: boolean | string;
  };
};

const DEMO_HOSTNAMES = new Set<string>();

function toBoolean(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    return normalized === '1' || normalized === 'true' || normalized === 'yes';
  }
  return false;
}

export function isDemoModeEnabled(): boolean {
  const envFlag = (import.meta as ImportMetaEnvShape).env.VITE_DEMO_MODE;
  if (toBoolean(envFlag)) {
    return true;
  }

  if (typeof window === 'undefined') {
    return false;
  }

  const runtimeFlag = (window as RuntimeWindow).__APP_CONFIG__?.DEMO_MODE;
  if (toBoolean(runtimeFlag)) {
    return true;
  }

  const hostname = String(window.location.hostname || '').trim().toLowerCase();
  return DEMO_HOSTNAMES.has(hostname);
}
