import { API_BASE_URL } from './deployments';
import {
  getApiBearerToken as getSharedApiBearerToken,
  handleUnauthorizedResponse,
} from './security';
import { isDemoModeEnabled } from './demoMode';

const BACKEND_UNAVAILABLE_MESSAGE =
  'Бэкенд инфраструктуры недоступен. Проверьте deployment-service и сеть.';

export type InfrastructureConsumptionPoint = {
  timestampMs: number;
  cpuPercent: number | null;
  ramPercent: number | null;
  gpuPercent: number | null;
};

export type DashboardSummary = {
  source: 'prometheus+postgres+status';
  clusterId: string;
  generatedAt: string;
  latencyMs: number | null;
  latencyDeltaMs: number | null;
  throughputRps: number | null;
  throughputDeltaPercent: number | null;
  uptimePercent24h: number | null;
  uptimeStatus: 'stable' | 'degraded' | 'unknown';
  cost24hRub: number;
  costDeltaPercent: number | null;
};

type BackendEnergyHistoryPoint = {
  timestamp: string;
  power_watts: number;
  cost: number;
};

type BackendNodeMetricsPoint = {
  node_name: string;
  cpu_percent: number;
  ram_percent: number;
  gpu_percent: number;
  power_watts: number;
  status: 'online' | 'offline';
};

type BackendConsumptionPoint = {
  timestamp_ms: number;
  cpu_percent: number | null;
  ram_percent: number | null;
  gpu_percent: number | null;
};

type BackendConsumptionResponse = {
  source: 'prometheus';
  cluster_id: string;
  window_minutes: number;
  step_seconds: number;
  points: BackendConsumptionPoint[];
};

type BackendDashboardSummaryResponse = {
  source: 'prometheus+postgres+status';
  cluster_id: string;
  generated_at: string;
  latency_ms: number | null;
  latency_delta_ms: number | null;
  throughput_rps: number | null;
  throughput_delta_percent: number | null;
  uptime_percent_24h: number | null;
  uptime_status: 'stable' | 'degraded' | 'unknown';
  cost_24h_rub: number;
  cost_delta_percent: number | null;
};

type ConsumptionQuery = {
  clusterId?: string;
  windowMinutes?: number;
  stepSeconds?: number;
};

let infrastructureConsumptionEndpointState: 'unknown' | 'supported' | 'unsupported' =
  'unknown';
const DEMO_MODE = isDemoModeEnabled();

const DEMO_CLUSTER_BASES: Record<
  string,
  {
    cpu: number;
    ram: number;
    gpu: number;
    latencyMs: number;
    throughputRps: number;
    cost24hRub: number;
    uptimePercent24h: number;
  }
> = {
  'msk-1': {
    cpu: 57,
    ram: 61,
    gpu: 68,
    latencyMs: 690,
    throughputRps: 84,
    cost24hRub: 1540,
    uptimePercent24h: 99.31,
  },
  'spb-1': {
    cpu: 51,
    ram: 57,
    gpu: 54,
    latencyMs: 625,
    throughputRps: 91,
    cost24hRub: 1310,
    uptimePercent24h: 99.52,
  },
  'ekb-1': {
    cpu: 33,
    ram: 38,
    gpu: 8,
    latencyMs: 740,
    throughputRps: 46,
    cost24hRub: 620,
    uptimePercent24h: 98.93,
  },
  default: {
    cpu: 52,
    ram: 56,
    gpu: 43,
    latencyMs: 676,
    throughputRps: 78,
    cost24hRub: 1240,
    uptimePercent24h: 99.12,
  },
};

function resolveDemoClusterBase(clusterId?: string) {
  const normalized = String(clusterId || '').trim().toLowerCase();
  if (!normalized || normalized === 'all') {
    return DEMO_CLUSTER_BASES.default;
  }
  return DEMO_CLUSTER_BASES[normalized] || DEMO_CLUSTER_BASES.default;
}

function buildDemoConsumptionSeries(query: ConsumptionQuery = {}): InfrastructureConsumptionPoint[] {
  const windowMinutes = Math.max(5, Math.trunc(query.windowMinutes ?? 30));
  const stepSeconds = Math.max(15, Math.trunc(query.stepSeconds ?? 30));
  const pointsCount = Math.max(2, Math.ceil((windowMinutes * 60) / stepSeconds));
  const base = resolveDemoClusterBase(query.clusterId);
  const nowMs = Date.now();

  return Array.from({ length: pointsCount }).map((_, index) => {
    const offset = pointsCount - 1 - index;
    const timestampMs = nowMs - offset * stepSeconds * 1000;
    const waveA = Math.sin(index * 0.22);
    const waveB = Math.cos(index * 0.09 + 1.1);
    const cpu = clampPercent(base.cpu + waveA * 7 + waveB * 3);
    const ram = clampPercent(base.ram + waveA * 4 + waveB * 2);
    const gpu = clampPercent(base.gpu + waveA * 9 + waveB * 4);
    return {
      timestampMs,
      cpuPercent: cpu,
      ramPercent: ram,
      gpuPercent: gpu,
    };
  });
}

function buildUrl(path: string): string {
  return `${API_BASE_URL.replace(/\/+$/, '')}${path}`;
}

function getApiBearerToken(): string | null {
  return getSharedApiBearerToken();
}

function withAuthHeaders(init?: RequestInit): RequestInit {
  const headers = new Headers(init?.headers);
  if (!headers.has('Authorization')) {
    const token = getApiBearerToken();
    if (token) {
      headers.set('Authorization', token);
    }
  }
  return {
    ...init,
    headers,
  };
}

async function parseErrorMessage(response: Response): Promise<string> {
  try {
    const body = await response.json();
    if (typeof body?.detail === 'string' && body.detail.trim()) {
      return body.detail;
    }
  } catch {
    // ignore parse errors
  }
  return `Запрос завершился с ошибкой, статус ${response.status}.`;
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function clampPercent(value: number): number {
  return Math.min(100, Math.max(0, Number(value.toFixed(2))));
}

function average(values: Array<number | null>): number | null {
  const normalized = values.filter((item): item is number => item !== null && Number.isFinite(item));
  if (normalized.length === 0) {
    return null;
  }
  return normalized.reduce((acc, item) => acc + item, 0) / normalized.length;
}

function scaleUtilization(base: number | null, ratio: number, weight: number): number | null {
  if (base === null) {
    return null;
  }
  const normalizedRatio = Math.min(1.4, Math.max(0.6, ratio));
  const adjusted = base * (1 + (normalizedRatio - 1) * weight);
  return clampPercent(adjusted);
}

async function fetchWithAuth(path: string): Promise<Response> {
  try {
    return await fetch(buildUrl(path), withAuthHeaders());
  } catch {
    throw new Error(BACKEND_UNAVAILABLE_MESSAGE);
  }
}

async function detectInfrastructureConsumptionEndpoint(): Promise<
  'unknown' | 'supported' | 'unsupported'
> {
  try {
    const response = await fetch(buildUrl('/openapi.json'), withAuthHeaders());
    if (!response.ok) {
      return 'unknown';
    }
    const payload = (await response.json()) as { paths?: Record<string, unknown> };
    const paths = payload?.paths || {};
    if (Object.prototype.hasOwnProperty.call(paths, '/infrastructure/consumption-series')) {
      return 'supported';
    }
    return 'unsupported';
  } catch {
    return 'unknown';
  }
}

async function requestJson<T>(path: string): Promise<T> {
  const response = await fetchWithAuth(path);
  if (!response.ok) {
    if (handleUnauthorizedResponse(response)) {
      throw new Error('Сессия истекла. Выполните вход повторно.');
    }
    throw new Error(await parseErrorMessage(response));
  }
  return (await response.json()) as T;
}

function buildEstimatedSeriesFromEnergyEndpoints(
  history: BackendEnergyHistoryPoint[],
  nodeMetrics: BackendNodeMetricsPoint[],
  query: ConsumptionQuery
): InfrastructureConsumptionPoint[] {
  const nowMs = Date.now();
  const windowMinutes = Math.max(5, Math.trunc(query.windowMinutes ?? 30));
  const stepSeconds = Math.max(15, Math.trunc(query.stepSeconds ?? 30));
  const windowStartMs = nowMs - windowMinutes * 60 * 1000;

  const cpuBase = average(nodeMetrics.map((item) => toFiniteNumber(item.cpu_percent)));
  const ramBase = average(nodeMetrics.map((item) => toFiniteNumber(item.ram_percent)));
  const gpuBase = average(nodeMetrics.map((item) => toFiniteNumber(item.gpu_percent)));

  const normalizedHistory = history
    .map((item) => {
      const timestampMs = Date.parse(String(item.timestamp || ''));
      const powerWatts = toFiniteNumber(item.power_watts);
      if (!Number.isFinite(timestampMs)) {
        return null;
      }
      return {
        timestampMs,
        powerWatts: powerWatts === null ? 0 : Math.max(0, powerWatts),
      };
    })
    .filter((item): item is { timestampMs: number; powerWatts: number } => item !== null)
    .sort((a, b) => a.timestampMs - b.timestampMs);

  const inWindow = normalizedHistory.filter((item) => item.timestampMs >= windowStartMs);
  const source =
    inWindow.length > 0
      ? inWindow
      : normalizedHistory.slice(-Math.max(2, Math.ceil((windowMinutes * 60) / stepSeconds)));

  const referencePower =
    average(source.map((item) => (item.powerWatts > 0 ? item.powerWatts : null))) ?? null;

  if (source.length === 0) {
    const pointsCount = Math.max(2, Math.ceil((windowMinutes * 60) / stepSeconds));
    return Array.from({ length: pointsCount }).map((_, index) => ({
      timestampMs: nowMs - (pointsCount - 1 - index) * stepSeconds * 1000,
      cpuPercent: cpuBase,
      ramPercent: ramBase,
      gpuPercent: gpuBase,
    }));
  }

  return source.map((item) => {
    const ratio =
      referencePower && referencePower > 0 && item.powerWatts > 0
        ? item.powerWatts / referencePower
        : 1;
    return {
      timestampMs: item.timestampMs,
      cpuPercent: scaleUtilization(cpuBase, ratio, 0.75),
      ramPercent: scaleUtilization(ramBase, ratio, 0.45),
      gpuPercent: scaleUtilization(gpuBase, ratio, 0.9),
    };
  });
}

async function getInfrastructureConsumptionSeriesFallback(
  query: ConsumptionQuery
): Promise<InfrastructureConsumptionPoint[]> {
  const windowMinutes = Math.max(5, Math.trunc(query.windowMinutes ?? 30));
  const period = windowMinutes > 24 * 60 ? '7d' : '24h';
  const [history, nodeMetrics] = await Promise.all([
    requestJson<BackendEnergyHistoryPoint[]>(`/energy/history?period=${period}`),
    requestJson<BackendNodeMetricsPoint[]>('/energy/nodes').catch(
      () => [] as BackendNodeMetricsPoint[]
    ),
  ]);
  return buildEstimatedSeriesFromEnergyEndpoints(history, nodeMetrics, query);
}

export async function getInfrastructureConsumptionSeries(
  query: ConsumptionQuery = {}
): Promise<InfrastructureConsumptionPoint[]> {
  if (DEMO_MODE) {
    return buildDemoConsumptionSeries(query);
  }

  if (infrastructureConsumptionEndpointState === 'unknown') {
    const detectedState = await detectInfrastructureConsumptionEndpoint();
    if (detectedState === 'supported' || detectedState === 'unsupported') {
      infrastructureConsumptionEndpointState = detectedState;
    }
  }

  if (infrastructureConsumptionEndpointState === 'unsupported') {
    return getInfrastructureConsumptionSeriesFallback(query);
  }

  const params = new URLSearchParams();
  const clusterId = (query.clusterId || 'default').trim();
  params.set('cluster_id', !clusterId || clusterId === 'all' ? 'default' : clusterId);
  params.set('window_minutes', String(query.windowMinutes ?? 30));
  params.set('step_seconds', String(query.stepSeconds ?? 30));

  const response = await fetchWithAuth(
    `/infrastructure/consumption-series?${params.toString()}`
  );

  if (response.status === 404) {
    infrastructureConsumptionEndpointState = 'unsupported';
    return getInfrastructureConsumptionSeriesFallback(query);
  }

  if (!response.ok) {
    if (handleUnauthorizedResponse(response)) {
      throw new Error('Сессия истекла. Выполните вход повторно.');
    }
    throw new Error(await parseErrorMessage(response));
  }

  const payload = (await response.json()) as BackendConsumptionResponse;
  infrastructureConsumptionEndpointState = 'supported';
  const points = Array.isArray(payload?.points) ? payload.points : [];
  return points.map((point) => ({
    timestampMs: Number(point.timestamp_ms),
    cpuPercent: typeof point.cpu_percent === 'number' ? point.cpu_percent : null,
    ramPercent: typeof point.ram_percent === 'number' ? point.ram_percent : null,
    gpuPercent: typeof point.gpu_percent === 'number' ? point.gpu_percent : null,
  }));
}

export async function getDashboardSummary(
  query: { clusterId?: string } = {}
): Promise<DashboardSummary> {
  if (DEMO_MODE) {
    const base = resolveDemoClusterBase(query.clusterId);
    const now = new Date();
    return {
      source: 'prometheus+postgres+status',
      clusterId: String(query.clusterId || 'default'),
      generatedAt: now.toISOString(),
      latencyMs: Number((base.latencyMs + Math.sin(now.getTime() / 1000_000) * 14).toFixed(1)),
      latencyDeltaMs: Number((Math.cos(now.getTime() / 2_000_000) * 22).toFixed(1)),
      throughputRps: Number((base.throughputRps + Math.sin(now.getTime() / 700_000) * 8).toFixed(2)),
      throughputDeltaPercent: Number((Math.sin(now.getTime() / 900_000) * 7.5).toFixed(2)),
      uptimePercent24h: Number(base.uptimePercent24h.toFixed(3)),
      uptimeStatus: base.uptimePercent24h >= 99.2 ? 'stable' : 'degraded',
      cost24hRub: Number((base.cost24hRub + Math.cos(now.getTime() / 1_500_000) * 90).toFixed(2)),
      costDeltaPercent: Number((Math.sin(now.getTime() / 1_800_000) * 5.8).toFixed(2)),
    };
  }

  const params = new URLSearchParams();
  const clusterId = (query.clusterId || 'default').trim();
  params.set('cluster_id', !clusterId || clusterId === 'all' ? 'default' : clusterId);

  const response = await fetchWithAuth(`/dashboard/summary?${params.toString()}`);
  if (!response.ok) {
    if (handleUnauthorizedResponse(response)) {
      throw new Error('Сессия истекла. Выполните вход повторно.');
    }
    throw new Error(await parseErrorMessage(response));
  }

  const payload = (await response.json()) as BackendDashboardSummaryResponse;
  return {
    source: 'prometheus+postgres+status',
    clusterId: String(payload.cluster_id || 'default'),
    generatedAt: String(payload.generated_at || ''),
    latencyMs: typeof payload.latency_ms === 'number' ? payload.latency_ms : null,
    latencyDeltaMs:
      typeof payload.latency_delta_ms === 'number' ? payload.latency_delta_ms : null,
    throughputRps: typeof payload.throughput_rps === 'number' ? payload.throughput_rps : null,
    throughputDeltaPercent:
      typeof payload.throughput_delta_percent === 'number'
        ? payload.throughput_delta_percent
        : null,
    uptimePercent24h:
      typeof payload.uptime_percent_24h === 'number' ? payload.uptime_percent_24h : null,
    uptimeStatus: payload.uptime_status || 'unknown',
    cost24hRub: typeof payload.cost_24h_rub === 'number' ? payload.cost_24h_rub : 0,
    costDeltaPercent:
      typeof payload.cost_delta_percent === 'number' ? payload.cost_delta_percent : null,
  };
}
