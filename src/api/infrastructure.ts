type ImportMetaEnvShape = ImportMeta & {
  env: Record<string, string | undefined>;
};
import {
  getApiBearerToken as getSharedApiBearerToken,
  handleUnauthorizedResponse,
} from './security';
import { isDemoModeEnabled } from './demoMode';

type RuntimeWindow = Window & {
  __APP_CONFIG__?: {
    API_URL?: string;
    API_BEARER_TOKEN?: string;
  };
};

const DEFAULT_DEPLOYMENT_API_URL = 'https://deployment.hse-llm-project-2026.ru';
const EXTERNAL_DOMAIN = 'hse-llm-project-2026.ru';
const API_BEARER_STORAGE_KEY = 'platform.apiBearerToken';
const BACKEND_UNAVAILABLE_MESSAGE =
  'Бэкенд инфраструктуры недоступен. Проверьте deployment-service и сеть.';
const BYTES_IN_GI = 1024 ** 3;

export type NodeRole = 'control-plane' | 'worker' | 'gpu-worker';
export type NodeStatus = 'Ready' | 'NotReady';
export type DeployMode = 'gpu' | 'cpu';
export type DeployableAvailabilityProfile = 'strict' | 'compatibility';

export interface GpuSnapshot {
  model: string;
  count: number;
  requestedCount: number;
  utilizationPercent: number;
}

export interface ClusterSummary {
  id: string;
  totalNodes: number;
  readyNodes: number;
  totalCpuCores: number;
  usedCpuCores: number;
  actualCpuCores: number | null;
  actualCpuPercent: number | null;
  totalRamGi: number;
  usedRamGi: number;
  actualRamGi: number | null;
  actualRamPercent: number | null;
  totalGpus: number;
  usedGpus: number;
  activeDeployments: number;
}

export interface NodeSummary {
  name: string;
  role: NodeRole;
  status: NodeStatus;
  canDeploy: string;
  cpuModel: string | null;
  cpuAllocatableCores: number;
  cpuRequestedCores: number;
  cpuUsagePercent: number;
  cpuActualCores: number | null;
  cpuActualPercent: number | null;
  ramAllocatableGi: number;
  ramRequestedGi: number;
  ramFreeGi: number;
  ramUsagePercent: number;
  ramActualGi: number | null;
  ramActualPercent: number | null;
  gpu: GpuSnapshot | null;
  runningDeployments: string[];
}

export interface NodeCondition {
  type: string;
  status: string;
}

export interface NodeDetails extends NodeSummary {
  labels: Record<string, string>;
  taints: string[];
  conditions: NodeCondition[];
  pods: string[];
}

interface BackendNodeResourceSummary {
  cpu_allocatable_millicores: number;
  cpu_requested_millicores: number;
  cpu_actual_usage_millicores?: number | null;
  memory_allocatable_bytes: number;
  memory_requested_bytes: number;
  memory_actual_usage_bytes?: number | null;
  memory_free_bytes: number;
  gpu_allocatable: number;
  gpu_requested: number;
}

interface BackendClusterSummary {
  cluster_id: string;
  nodes_total: number;
  nodes_ready: number;
  active_deployments: number;
  resources: BackendNodeResourceSummary;
}

interface BackendNodeSummary {
  name: string;
  role: string;
  status: string;
  can_deploy: string;
  cpu_product?: string | null;
  gpu_product?: string | null;
  gpu_compute_capability?: string | null;
  running_deployments: string[];
  resources: BackendNodeResourceSummary;
}

interface BackendNodeTaint {
  key: string;
  value?: string | null;
  effect?: string | null;
}

interface BackendNodeCondition {
  type: string;
  status: string;
}

interface BackendNodePod {
  namespace: string;
  name: string;
  phase: string;
}

interface BackendNodeDetails {
  name: string;
  cluster_id: string;
  role: string;
  status: string;
  can_deploy: string;
  cpu_product?: string | null;
  labels: Record<string, string>;
  taints: BackendNodeTaint[];
  conditions: BackendNodeCondition[];
  running_deployments: string[];
  resources: BackendNodeResourceSummary;
  pods: BackendNodePod[];
}

const runtimeApiUrl =
  typeof window !== 'undefined'
    ? (window as RuntimeWindow).__APP_CONFIG__?.API_URL
    : undefined;
const runtimeApiBearerToken =
  typeof window !== 'undefined'
    ? (window as RuntimeWindow).__APP_CONFIG__?.API_BEARER_TOKEN
    : undefined;

const buildTimeApiUrl = (import.meta as ImportMetaEnvShape).env.VITE_API_URL;
const buildTimeApiBearerToken = (import.meta as ImportMetaEnvShape).env.VITE_API_BEARER_TOKEN;

function inferExternalDeploymentApiUrl(): string | undefined {
  if (typeof window === 'undefined') {
    return undefined;
  }
  const protocol = window.location.protocol || 'https:';
  const host = window.location.hostname || '';
  if (host.endsWith(EXTERNAL_DOMAIN)) {
    return `${protocol}//deployment.${EXTERNAL_DOMAIN}`;
  }
  return undefined;
}

const API_BASE_URL =
  runtimeApiUrl || buildTimeApiUrl || inferExternalDeploymentApiUrl() || DEFAULT_DEPLOYMENT_API_URL;
const DEMO_MODE = isDemoModeEnabled();

const DEMO_NODE_MAP: Record<string, NodeSummary[]> = {
  'msk-1': [
    {
      name: 'gpu-worker-1',
      role: 'gpu-worker',
      status: 'Ready',
      canDeploy: 'yes',
      cpuModel: 'AMD EPYC 7742',
      cpuAllocatableCores: 48,
      cpuRequestedCores: 28,
      cpuUsagePercent: 58.3,
      cpuActualCores: 25.7,
      cpuActualPercent: 53.5,
      ramAllocatableGi: 256,
      ramRequestedGi: 166,
      ramFreeGi: 90,
      ramUsagePercent: 64.8,
      ramActualGi: 150,
      ramActualPercent: 58.6,
      gpu: {
        model: 'NVIDIA A100 80GB',
        count: 4,
        requestedCount: 3,
        utilizationPercent: 75,
      },
      runningDeployments: ['dep-smollm2-msk', 'dep-smolvlm-msk'],
    },
    {
      name: 'worker-1',
      role: 'worker',
      status: 'Ready',
      canDeploy: 'yes',
      cpuModel: 'Intel Xeon Gold 6338',
      cpuAllocatableCores: 32,
      cpuRequestedCores: 14,
      cpuUsagePercent: 43.8,
      cpuActualCores: 12.9,
      cpuActualPercent: 40.3,
      ramAllocatableGi: 128,
      ramRequestedGi: 62,
      ramFreeGi: 66,
      ramUsagePercent: 48.4,
      ramActualGi: 57,
      ramActualPercent: 44.5,
      gpu: null,
      runningDeployments: ['dep-router-msk'],
    },
    {
      name: 'worker-2',
      role: 'worker',
      status: 'Ready',
      canDeploy: 'yes',
      cpuModel: 'Intel Xeon Gold 6338',
      cpuAllocatableCores: 32,
      cpuRequestedCores: 10,
      cpuUsagePercent: 31.3,
      cpuActualCores: 9.2,
      cpuActualPercent: 28.7,
      ramAllocatableGi: 128,
      ramRequestedGi: 44,
      ramFreeGi: 84,
      ramUsagePercent: 34.4,
      ramActualGi: 39,
      ramActualPercent: 30.5,
      gpu: null,
      runningDeployments: [],
    },
  ],
  'spb-1': [
    {
      name: 'gpu-worker-2',
      role: 'gpu-worker',
      status: 'Ready',
      canDeploy: 'yes',
      cpuModel: 'AMD EPYC 7643',
      cpuAllocatableCores: 48,
      cpuRequestedCores: 26,
      cpuUsagePercent: 54.1,
      cpuActualCores: 23.3,
      cpuActualPercent: 48.5,
      ramAllocatableGi: 256,
      ramRequestedGi: 154,
      ramFreeGi: 102,
      ramUsagePercent: 60.2,
      ramActualGi: 146,
      ramActualPercent: 57,
      gpu: {
        model: 'NVIDIA L40S',
        count: 4,
        requestedCount: 2,
        utilizationPercent: 50,
      },
      runningDeployments: ['dep-qwen-spb'],
    },
    {
      name: 'worker-3',
      role: 'worker',
      status: 'Ready',
      canDeploy: 'yes',
      cpuModel: 'Intel Xeon Silver 4314',
      cpuAllocatableCores: 24,
      cpuRequestedCores: 11,
      cpuUsagePercent: 45.8,
      cpuActualCores: 10.1,
      cpuActualPercent: 42.1,
      ramAllocatableGi: 96,
      ramRequestedGi: 48,
      ramFreeGi: 48,
      ramUsagePercent: 50,
      ramActualGi: 45,
      ramActualPercent: 46.9,
      gpu: null,
      runningDeployments: [],
    },
  ],
  'ekb-1': [
    {
      name: 'srv-small-1',
      role: 'worker',
      status: 'Ready',
      canDeploy: 'yes',
      cpuModel: 'AMD EPYC 7313',
      cpuAllocatableCores: 16,
      cpuRequestedCores: 6,
      cpuUsagePercent: 37.5,
      cpuActualCores: 5.4,
      cpuActualPercent: 33.8,
      ramAllocatableGi: 64,
      ramRequestedGi: 26,
      ramFreeGi: 38,
      ramUsagePercent: 40.6,
      ramActualGi: 24,
      ramActualPercent: 37.5,
      gpu: null,
      runningDeployments: ['dep-gemma-ekb'],
    },
    {
      name: 'srv-small-2',
      role: 'worker',
      status: 'Ready',
      canDeploy: 'yes',
      cpuModel: 'AMD EPYC 7313',
      cpuAllocatableCores: 16,
      cpuRequestedCores: 4,
      cpuUsagePercent: 25,
      cpuActualCores: 3.8,
      cpuActualPercent: 23.8,
      ramAllocatableGi: 64,
      ramRequestedGi: 18,
      ramFreeGi: 46,
      ramUsagePercent: 28.1,
      ramActualGi: 17,
      ramActualPercent: 26.6,
      gpu: null,
      runningDeployments: [],
    },
  ],
};

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function buildDemoClusterSummary(clusterId: string, nodes: NodeSummary[]): ClusterSummary {
  const totalCpu = nodes.reduce((acc, node) => acc + node.cpuAllocatableCores, 0);
  const usedCpu = nodes.reduce((acc, node) => acc + node.cpuRequestedCores, 0);
  const actualCpu = nodes.reduce((acc, node) => acc + (node.cpuActualCores ?? node.cpuRequestedCores), 0);
  const totalRam = nodes.reduce((acc, node) => acc + node.ramAllocatableGi, 0);
  const usedRam = nodes.reduce((acc, node) => acc + node.ramRequestedGi, 0);
  const actualRam = nodes.reduce((acc, node) => acc + (node.ramActualGi ?? node.ramRequestedGi), 0);
  const totalGpus = nodes.reduce((acc, node) => acc + Number(node.gpu?.count ?? 0), 0);
  const usedGpus = nodes.reduce((acc, node) => acc + Number(node.gpu?.requestedCount ?? 0), 0);
  const activeDeployments = new Set<string>();
  nodes.forEach((node) => node.runningDeployments.forEach((dep) => activeDeployments.add(dep)));

  return {
    id: clusterId,
    totalNodes: nodes.length,
    readyNodes: nodes.filter((node) => node.status === 'Ready').length,
    totalCpuCores: Number(totalCpu.toFixed(1)),
    usedCpuCores: Number(usedCpu.toFixed(1)),
    actualCpuCores: Number(actualCpu.toFixed(1)),
    actualCpuPercent: totalCpu > 0 ? Number(((actualCpu / totalCpu) * 100).toFixed(1)) : 0,
    totalRamGi: Number(totalRam.toFixed(1)),
    usedRamGi: Number(usedRam.toFixed(1)),
    actualRamGi: Number(actualRam.toFixed(1)),
    actualRamPercent: totalRam > 0 ? Number(((actualRam / totalRam) * 100).toFixed(1)) : 0,
    totalGpus,
    usedGpus,
    activeDeployments: activeDeployments.size,
  };
}

function normalizeBearerToken(raw: string | undefined): string | null {
  const token = (raw ?? '').trim();
  if (!token) {
    return null;
  }
  if (/^bearer\s+/i.test(token)) {
    return token;
  }
  return `Bearer ${token}`;
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

function buildUrl(path: string): string {
  return `${API_BASE_URL.replace(/\/+$/, '')}${path}`;
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

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(buildUrl(path), withAuthHeaders(init));
  } catch {
    throw new Error(BACKEND_UNAVAILABLE_MESSAGE);
  }

  if (!response.ok) {
    if (handleUnauthorizedResponse(response)) {
      throw new Error('Сессия истекла. Выполните вход повторно.');
    }
    throw new Error(await parseErrorMessage(response));
  }

  return (await response.json()) as T;
}

function toFixedNumber(value: number, digits = 1): number {
  return Number(value.toFixed(digits));
}

function toPercent(part: number, total: number): number {
  if (total <= 0) return 0;
  const raw = (part / total) * 100;
  return Math.max(0, Math.min(100, toFixedNumber(raw, 1)));
}

function toPercentNullable(part: number | null, total: number): number | null {
  if (part === null || total <= 0) return null;
  return toPercent(part, total);
}

function millicoresToCores(millicores: number): number {
  return toFixedNumber(millicores / 1000, 1);
}

function bytesToGi(bytes: number): number {
  return toFixedNumber(bytes / BYTES_IN_GI, 1);
}

function mapNodeRole(rawRole: string): NodeRole {
  const role = String(rawRole || '').toLowerCase();
  if (role.includes('control')) return 'control-plane';
  if (role.includes('gpu')) return 'gpu-worker';
  return 'worker';
}

function mapNodeStatus(rawStatus: string): NodeStatus {
  return rawStatus === 'Ready' ? 'Ready' : 'NotReady';
}

function mapGpuSnapshot(resources: BackendNodeResourceSummary, gpuProduct?: string | null): GpuSnapshot | null {
  if (resources.gpu_allocatable <= 0) {
    return null;
  }

  const model = String(gpuProduct || '').trim() || 'GPU';
  const count = resources.gpu_allocatable;
  const requestedCount = Math.max(0, resources.gpu_requested);
  const utilizationPercent = toPercent(resources.gpu_requested, resources.gpu_allocatable);

  return {
    model,
    count,
    requestedCount,
    utilizationPercent,
  };
}

function mapClusterSummary(item: BackendClusterSummary): ClusterSummary {
  const resources = item.resources;
  const actualCpuMillicores =
    typeof resources.cpu_actual_usage_millicores === 'number'
      ? resources.cpu_actual_usage_millicores
      : null;
  const actualMemoryBytes =
    typeof resources.memory_actual_usage_bytes === 'number'
      ? resources.memory_actual_usage_bytes
      : null;
  return {
    id: item.cluster_id,
    totalNodes: item.nodes_total,
    readyNodes: item.nodes_ready,
    totalCpuCores: millicoresToCores(resources.cpu_allocatable_millicores),
    usedCpuCores: millicoresToCores(resources.cpu_requested_millicores),
    actualCpuCores: actualCpuMillicores === null ? null : millicoresToCores(actualCpuMillicores),
    actualCpuPercent: toPercentNullable(
      actualCpuMillicores,
      resources.cpu_allocatable_millicores
    ),
    totalRamGi: bytesToGi(resources.memory_allocatable_bytes),
    usedRamGi: bytesToGi(resources.memory_requested_bytes),
    actualRamGi: actualMemoryBytes === null ? null : bytesToGi(actualMemoryBytes),
    actualRamPercent: toPercentNullable(
      actualMemoryBytes,
      resources.memory_allocatable_bytes
    ),
    totalGpus: resources.gpu_allocatable,
    usedGpus: resources.gpu_requested,
    activeDeployments: item.active_deployments,
  };
}

function mapNodeSummary(item: BackendNodeSummary): NodeSummary {
  const resources = item.resources;
  const actualCpuMillicores =
    typeof resources.cpu_actual_usage_millicores === 'number'
      ? resources.cpu_actual_usage_millicores
      : null;
  const actualMemoryBytes =
    typeof resources.memory_actual_usage_bytes === 'number'
      ? resources.memory_actual_usage_bytes
      : null;
  return {
    name: item.name,
    role: mapNodeRole(item.role),
    status: mapNodeStatus(item.status),
    canDeploy: item.can_deploy,
    cpuModel: String(item.cpu_product || '').trim() || null,
    cpuAllocatableCores: millicoresToCores(resources.cpu_allocatable_millicores),
    cpuRequestedCores: millicoresToCores(resources.cpu_requested_millicores),
    cpuUsagePercent: toPercent(
      resources.cpu_requested_millicores,
      resources.cpu_allocatable_millicores
    ),
    cpuActualCores: actualCpuMillicores === null ? null : millicoresToCores(actualCpuMillicores),
    cpuActualPercent: toPercentNullable(
      actualCpuMillicores,
      resources.cpu_allocatable_millicores
    ),
    ramAllocatableGi: bytesToGi(resources.memory_allocatable_bytes),
    ramRequestedGi: bytesToGi(resources.memory_requested_bytes),
    ramFreeGi: bytesToGi(resources.memory_free_bytes),
    ramUsagePercent: toPercent(
      resources.memory_requested_bytes,
      resources.memory_allocatable_bytes
    ),
    ramActualGi: actualMemoryBytes === null ? null : bytesToGi(actualMemoryBytes),
    ramActualPercent: toPercentNullable(
      actualMemoryBytes,
      resources.memory_allocatable_bytes
    ),
    gpu: mapGpuSnapshot(resources, item.gpu_product),
    runningDeployments: item.running_deployments,
  };
}

function mapTaint(taint: BackendNodeTaint): string {
  const valuePart = taint.value ? `=${taint.value}` : '';
  const effectPart = taint.effect ? `:${taint.effect}` : '';
  return `${taint.key}${valuePart}${effectPart}`;
}

function mapConditions(raw: BackendNodeCondition[]): NodeCondition[] {
  const preferredTypes = new Set(['MemoryPressure', 'DiskPressure', 'PIDPressure']);
  const preferred = raw.filter((item) => preferredTypes.has(item.type));
  const source = preferred.length > 0 ? preferred : raw.slice(0, 3);

  return source.map((item) => ({
    type: item.type,
    status: item.status || 'Unknown',
  }));
}

function mapNodeDetails(item: BackendNodeDetails): NodeDetails {
  const summary = mapNodeSummary({
    name: item.name,
    role: item.role,
    status: item.status,
    can_deploy: item.can_deploy,
    cpu_product: item.cpu_product,
    gpu_product: null,
    gpu_compute_capability: null,
    running_deployments: item.running_deployments,
    resources: item.resources,
  });

  return {
    ...summary,
    labels: item.labels,
    taints: item.taints.map(mapTaint),
    conditions: mapConditions(item.conditions),
    pods: item.pods.map((pod) => `${pod.namespace}/${pod.name} (${pod.phase})`),
  };
}

export async function getClusters(): Promise<ClusterSummary[]> {
  if (DEMO_MODE) {
    const summaries = Object.entries(DEMO_NODE_MAP).map(([clusterId, nodes]) =>
      buildDemoClusterSummary(clusterId, nodes)
    );
    return deepClone(summaries);
  }
  const data = await requestJson<BackendClusterSummary[]>('/clusters');
  return data.map(mapClusterSummary);
}

export async function getClusterNodes(clusterId: string): Promise<NodeSummary[]> {
  if (DEMO_MODE) {
    return deepClone(DEMO_NODE_MAP[clusterId] || []);
  }
  const data = await requestJson<BackendNodeSummary[]>(
    `/clusters/${encodeURIComponent(clusterId)}/nodes`
  );
  return data.map(mapNodeSummary);
}

export async function getClusterDeployableNodes(
  clusterId: string,
  modelName: string,
  mode: DeployMode,
  availability: DeployableAvailabilityProfile = 'strict'
): Promise<NodeSummary[]> {
  if (DEMO_MODE) {
    const nodes = DEMO_NODE_MAP[clusterId] || [];
    const filtered = nodes.filter((node) => {
      if (node.status !== 'Ready') return false;
      if (!String(node.canDeploy || '').toLowerCase().includes('yes')) return false;
      if (mode === 'gpu') {
        return Number(node.gpu?.count ?? 0) > 0;
      }
      return true;
    });
    const _unused = { modelName, availability };
    void _unused;
    return deepClone(filtered);
  }
  const params = new URLSearchParams({
    model_name: modelName,
    mode,
    availability,
  });
  const data = await requestJson<BackendNodeSummary[]>(
    `/clusters/${encodeURIComponent(clusterId)}/deployable-nodes?${params.toString()}`
  );
  return data.map(mapNodeSummary);
}

export async function getClusterNodeDetails(
  clusterId: string,
  nodeName: string
): Promise<NodeDetails> {
  if (DEMO_MODE) {
    const node = (DEMO_NODE_MAP[clusterId] || []).find((item) => item.name === nodeName);
    if (!node) {
      throw new Error(`Node '${nodeName}' not found in cluster '${clusterId}'.`);
    }
    const details: NodeDetails = {
      ...node,
      labels: {
        'kubernetes.io/hostname': node.name,
        'topology.kubernetes.io/region': clusterId.startsWith('msk')
          ? 'ru-central-1'
          : clusterId.startsWith('spb')
          ? 'ru-northwest-1'
          : 'ru-ural-1',
        'node.kubernetes.io/instance-type':
          node.gpu && node.gpu.count > 0 ? 'gpu-optimized' : 'general-purpose',
      },
      taints:
        node.gpu && node.gpu.count > 0
          ? ['nvidia.com/gpu=true:NoSchedule']
          : [],
      conditions: [
        { type: 'Ready', status: 'True' },
        { type: 'MemoryPressure', status: 'False' },
        { type: 'DiskPressure', status: 'False' },
      ],
      pods: node.runningDeployments.map((deploymentId) => `llm-system/${deploymentId}-pod (Running)`),
    };
    return deepClone(details);
  }
  const data = await requestJson<BackendNodeDetails>(
    `/clusters/${encodeURIComponent(clusterId)}/nodes/${encodeURIComponent(nodeName)}`
  );
  return mapNodeDetails(data);
}
