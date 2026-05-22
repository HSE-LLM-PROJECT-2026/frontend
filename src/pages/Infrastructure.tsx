import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  getClusterDeployableNodes,
  type ClusterSummary,
  type DeployMode,
  type NodeSummary,
} from '../api/infrastructure';
import { type DeploymentResponse } from '../api/deployments';
import {
  buildRealtimeSocketUrl,
  parseRealtimeSocketMessage,
} from '../api/realtime';
import { ALLOWED_DEPLOY_MODELS } from '../config/modelCatalog';

type DeployHerePayload = {
  clusterId: string;
  nodeName: string;
  mode: 'gpu' | 'cpu';
};

type Deployability = {
  label: string;
  details: string;
  canDeploy: boolean;
  tone:
    | 'green'
    | 'red'
    | 'yellow'
    | 'blue'
    | 'gray';
};

type NodeLlmPlacement = {
  id: string;
  crdName: string;
  modelName: string;
  mode: 'gpu' | 'cpu' | null;
  phase: string;
  modelReady: boolean;
  team: string | null;
  product: string | null;
};

type NodeTableRow = {
  node: NodeSummary;
  placements: NodeLlmPlacement[];
  deployability: Deployability;
  usedCpu: number;
  usedRam: number;
};

type VllmFilterMode = DeployMode | 'all';

type InfrastructureConsumptionPoint = {
  timestampMs: number;
  cpuPercent: number | null;
  ramPercent: number | null;
  gpuPercent: number | null;
};

const VLLM_MODEL_OPTIONS = ALLOWED_DEPLOY_MODELS;

const BYTES_IN_GI = 1024 ** 3;
const CONSUMPTION_RETENTION_MS = 30 * 60 * 1000;
const CONSUMPTION_BUCKET_MS = 10 * 1000;

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  return value as Record<string, unknown>;
}

function toFiniteNumber(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  return fallback;
}

function toNullableFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  return null;
}

function toFixedNumber(value: number, digits = 1): number {
  return Number(value.toFixed(digits));
}

function toPercent(part: number, total: number): number {
  if (total <= 0) return 0;
  const raw = (part / total) * 100;
  return Math.max(0, Math.min(100, toFixedNumber(raw, 1)));
}

function millicoresToCores(millicores: unknown): number {
  return toFixedNumber(toFiniteNumber(millicores) / 1000, 1);
}

function bytesToGi(bytes: unknown): number {
  return toFixedNumber(toFiniteNumber(bytes) / BYTES_IN_GI, 1);
}

function normalizeNodeRole(value: unknown): NodeSummary['role'] {
  const raw = String(value || '').toLowerCase();
  if (raw.includes('control')) return 'control-plane';
  if (raw.includes('gpu')) return 'gpu-worker';
  return 'worker';
}

function normalizeNodeStatus(value: unknown): NodeSummary['status'] {
  return String(value || '') === 'Ready' ? 'Ready' : 'NotReady';
}

function normalizeClusterSnapshot(raw: unknown): ClusterSummary | null {
  const item = asRecord(raw);
  if (!item) return null;

  const directId = String(item.id || '').trim();
  if (directId) {
    return {
      id: directId,
      totalNodes: toFiniteNumber(item.totalNodes),
      readyNodes: toFiniteNumber(item.readyNodes),
      totalCpuCores: toFiniteNumber(item.totalCpuCores),
      usedCpuCores: toFiniteNumber(item.usedCpuCores),
      actualCpuCores: toNullableFiniteNumber(item.actualCpuCores),
      actualCpuPercent: toNullableFiniteNumber(item.actualCpuPercent),
      totalRamGi: toFiniteNumber(item.totalRamGi),
      usedRamGi: toFiniteNumber(item.usedRamGi),
      actualRamGi: toNullableFiniteNumber(item.actualRamGi),
      actualRamPercent: toNullableFiniteNumber(item.actualRamPercent),
      totalGpus: toFiniteNumber(item.totalGpus),
      usedGpus: toFiniteNumber(item.usedGpus),
      activeDeployments: toFiniteNumber(item.activeDeployments),
    };
  }

  const backendId = String(item.cluster_id || '').trim();
  const resources = asRecord(item.resources);
  if (!backendId || !resources) {
    return null;
  }

  const cpuAllocatableMillicores = toFiniteNumber(resources.cpu_allocatable_millicores);
  const cpuRequestedMillicores = toFiniteNumber(resources.cpu_requested_millicores);
  const cpuActualMillicores = toNullableFiniteNumber(resources.cpu_actual_usage_millicores);
  const memoryAllocatableBytes = toFiniteNumber(resources.memory_allocatable_bytes);
  const memoryRequestedBytes = toFiniteNumber(resources.memory_requested_bytes);
  const memoryActualBytes = toNullableFiniteNumber(resources.memory_actual_usage_bytes);

  return {
    id: backendId,
    totalNodes: toFiniteNumber(item.nodes_total),
    readyNodes: toFiniteNumber(item.nodes_ready),
    totalCpuCores: millicoresToCores(cpuAllocatableMillicores),
    usedCpuCores: millicoresToCores(cpuRequestedMillicores),
    actualCpuCores:
      cpuActualMillicores === null ? null : millicoresToCores(cpuActualMillicores),
    actualCpuPercent:
      cpuActualMillicores === null
        ? null
        : toPercent(cpuActualMillicores, cpuAllocatableMillicores),
    totalRamGi: bytesToGi(memoryAllocatableBytes),
    usedRamGi: bytesToGi(memoryRequestedBytes),
    actualRamGi: memoryActualBytes === null ? null : bytesToGi(memoryActualBytes),
    actualRamPercent:
      memoryActualBytes === null
        ? null
        : toPercent(memoryActualBytes, memoryAllocatableBytes),
    totalGpus: toFiniteNumber(resources.gpu_allocatable),
    usedGpus: toFiniteNumber(resources.gpu_requested),
    activeDeployments: toFiniteNumber(item.active_deployments),
  };
}

function normalizeNodeSnapshot(raw: unknown): NodeSummary | null {
  const item = asRecord(raw);
  if (!item) return null;

  const name = String(item.name || '').trim();
  if (!name) return null;

  const resources = asRecord(item.resources);
  const cpuAllocatableCores = resources
    ? millicoresToCores(resources.cpu_allocatable_millicores)
    : toFiniteNumber(item.cpuAllocatableCores);
  const cpuRequestedCores = resources
    ? millicoresToCores(resources.cpu_requested_millicores)
    : toFiniteNumber(item.cpuRequestedCores);
  const ramAllocatableGi = resources
    ? bytesToGi(resources.memory_allocatable_bytes)
    : toFiniteNumber(item.ramAllocatableGi);
  const ramRequestedGi = resources
    ? bytesToGi(resources.memory_requested_bytes)
    : toFiniteNumber(item.ramRequestedGi);
  const ramFreeGi = resources
    ? bytesToGi(resources.memory_free_bytes)
    : toFiniteNumber(item.ramFreeGi);

  const cpuUsagePercent = resources
    ? toPercent(
        toFiniteNumber(resources.cpu_requested_millicores),
        toFiniteNumber(resources.cpu_allocatable_millicores)
      )
    : toFiniteNumber(item.cpuUsagePercent);
  const ramUsagePercent = resources
    ? toPercent(
        toFiniteNumber(resources.memory_requested_bytes),
        toFiniteNumber(resources.memory_allocatable_bytes)
      )
    : toFiniteNumber(item.ramUsagePercent);

  const cpuActualCores = resources
    ? (() => {
        const value = toNullableFiniteNumber(resources.cpu_actual_usage_millicores);
        return value === null ? null : millicoresToCores(value);
      })()
    : toNullableFiniteNumber(item.cpuActualCores);
  const ramActualGi = resources
    ? (() => {
        const value = toNullableFiniteNumber(resources.memory_actual_usage_bytes);
        return value === null ? null : bytesToGi(value);
      })()
    : toNullableFiniteNumber(item.ramActualGi);

  const cpuActualPercent =
    cpuActualCores === null
      ? null
      : toPercent(cpuActualCores, Math.max(cpuAllocatableCores, 0.0001));
  const ramActualPercent =
    ramActualGi === null
      ? null
      : toPercent(ramActualGi, Math.max(ramAllocatableGi, 0.0001));

  const runningDeploymentsRaw = Array.isArray(item.runningDeployments)
    ? item.runningDeployments
    : Array.isArray(item.running_deployments)
    ? item.running_deployments
    : [];

  const runningDeployments = runningDeploymentsRaw
    .map((value) => String(value || '').trim())
    .filter(Boolean);

  const gpuAllocatable = resources
    ? toFiniteNumber(resources.gpu_allocatable)
    : toFiniteNumber(asRecord(item.gpu)?.count);
  const gpuRequested = resources
    ? toFiniteNumber(resources.gpu_requested)
    : toFiniteNumber(asRecord(item.gpu)?.requestedCount);
  const gpuModel =
    String(item.gpu_product || '').trim() ||
    String(asRecord(item.gpu)?.model || '').trim() ||
    'GPU';
  const gpu = gpuAllocatable > 0
    ? {
        model: gpuModel,
        count: gpuAllocatable,
        requestedCount: gpuRequested,
        utilizationPercent:
          gpuAllocatable > 0 ? toPercent(gpuRequested, gpuAllocatable) : 0,
      }
    : null;

  return {
    name,
    role: normalizeNodeRole(item.role),
    status: normalizeNodeStatus(item.status),
    canDeploy: String(item.canDeploy || item.can_deploy || 'unavailable'),
    cpuModel: String(item.cpuModel || item.cpu_product || '').trim() || null,
    cpuAllocatableCores,
    cpuRequestedCores,
    cpuUsagePercent,
    cpuActualCores,
    cpuActualPercent,
    ramAllocatableGi,
    ramRequestedGi,
    ramFreeGi,
    ramUsagePercent,
    ramActualGi,
    ramActualPercent,
    gpu,
    runningDeployments,
  };
}

function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return 'n/a';
  }
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function formatNullableNumber(value: number | null): string {
  if (value === null) return 'n/a';
  return formatNumber(value);
}

function formatPercent(value: number | null): string {
  if (value === null) return 'n/a';
  return `${formatNumber(value)}%`;
}

function formatTimeTick(timestampMs: number): string {
  try {
    const date = new Date(timestampMs);
    return date.toLocaleTimeString('ru-RU', {
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

function toRoundedPercent(value: number): number {
  return Math.max(0, Math.min(100, Number(value.toFixed(2))));
}

function aggregateClusterUtilization(
  clusters: ClusterSummary[]
): Omit<InfrastructureConsumptionPoint, 'timestampMs'> {
  let cpuActualWeightedSum = 0;
  let cpuActualWeight = 0;
  let cpuRequestedSum = 0;
  let cpuTotalSum = 0;

  let ramActualWeightedSum = 0;
  let ramActualWeight = 0;
  let ramRequestedSum = 0;
  let ramTotalSum = 0;

  let gpuUsedSum = 0;
  let gpuTotalSum = 0;

  clusters.forEach((cluster) => {
    if (cluster.actualCpuPercent !== null && cluster.totalCpuCores > 0) {
      cpuActualWeightedSum += cluster.actualCpuPercent * cluster.totalCpuCores;
      cpuActualWeight += cluster.totalCpuCores;
    }
    cpuRequestedSum += cluster.usedCpuCores;
    cpuTotalSum += cluster.totalCpuCores;

    if (cluster.actualRamPercent !== null && cluster.totalRamGi > 0) {
      ramActualWeightedSum += cluster.actualRamPercent * cluster.totalRamGi;
      ramActualWeight += cluster.totalRamGi;
    }
    ramRequestedSum += cluster.usedRamGi;
    ramTotalSum += cluster.totalRamGi;

    gpuUsedSum += cluster.usedGpus;
    gpuTotalSum += cluster.totalGpus;
  });

  const cpuPercent =
    cpuActualWeight > 0
      ? toRoundedPercent(cpuActualWeightedSum / cpuActualWeight)
      : cpuTotalSum > 0
      ? toRoundedPercent((cpuRequestedSum / cpuTotalSum) * 100)
      : null;

  const ramPercent =
    ramActualWeight > 0
      ? toRoundedPercent(ramActualWeightedSum / ramActualWeight)
      : ramTotalSum > 0
      ? toRoundedPercent((ramRequestedSum / ramTotalSum) * 100)
      : null;

  const gpuPercent =
    gpuTotalSum > 0 ? toRoundedPercent((gpuUsedSum / gpuTotalSum) * 100) : null;

  return {
    cpuPercent,
    ramPercent,
    gpuPercent,
  };
}

function appendRealtimeConsumptionPoint(
  current: InfrastructureConsumptionPoint[],
  point: InfrastructureConsumptionPoint
): InfrastructureConsumptionPoint[] {
  const bucketedTimestampMs =
    Math.floor(point.timestampMs / CONSUMPTION_BUCKET_MS) * CONSUMPTION_BUCKET_MS;
  const normalizedPoint = {
    ...point,
    timestampMs: bucketedTimestampMs,
  };
  const minAllowedTimestamp = bucketedTimestampMs - CONSUMPTION_RETENTION_MS;
  const trimmed = current.filter((item) => item.timestampMs >= minAllowedTimestamp);
  if (trimmed.length > 0 && trimmed[trimmed.length - 1].timestampMs === bucketedTimestampMs) {
    const updated = [...trimmed];
    updated[updated.length - 1] = normalizedPoint;
    return updated;
  }
  return [...trimmed, normalizedPoint];
}

function getDeployability(
  node: NodeSummary,
  isVllmCompatible: boolean,
  runningDeploymentsCount: number = node.runningDeployments.length
): Deployability {
  const backendStatus = (node.canDeploy || '').trim().toLowerCase();

  if (!isVllmCompatible) {
    if (node.status !== 'Ready') {
      return {
        label: 'Недоступна для vLLM',
        details: 'Node status is NotReady',
        canDeploy: false,
        tone: 'red',
      };
    }

    if (backendStatus === 'restricted' || node.role === 'control-plane') {
      return {
        label: 'Недоступна для vLLM',
        details: 'Control-plane or restricted node',
        canDeploy: false,
        tone: 'gray',
      };
    }

    if (backendStatus === 'insufficient_ram') {
      return {
        label: 'Недоступна для vLLM',
        details: 'Insufficient RAM for selected model/mode',
        canDeploy: false,
        tone: 'yellow',
      };
    }

    if (backendStatus === 'occupied' || (node.gpu && runningDeploymentsCount > 0)) {
      return {
        label: 'Недоступна для vLLM',
        details: 'GPU node is occupied by another deployment',
        canDeploy: false,
        tone: 'yellow',
      };
    }

    return {
      label: 'Недоступна для vLLM',
      details: 'Node does not satisfy current vLLM constraints',
      canDeploy: false,
      tone: 'red',
    };
  }

  if (node.status !== 'Ready') {
    return {
      label: 'Unavailable',
      details: 'Node status is NotReady',
      canDeploy: false,
      tone: 'red',
    };
  }

  if (backendStatus === 'occupied' || (node.gpu && runningDeploymentsCount > 0)) {
    return {
      label: 'Occupied',
      details: '1 GPU node = 1 GPU deployment',
      canDeploy: false,
      tone: 'yellow',
    };
  }

  if (backendStatus === 'unavailable' || backendStatus === 'restricted') {
    return {
      label: 'Unavailable',
      details: 'Node is not schedulable right now.',
      canDeploy: false,
      tone: 'red',
    };
  }

  const usedCpu = toFiniteNumber(node.cpuRequestedCores);
  const freeCpu = Number((toFiniteNumber(node.cpuAllocatableCores) - usedCpu).toFixed(1));
  const freeRam = Number(toFiniteNumber(node.ramFreeGi).toFixed(1));
  const canDeploy = backendStatus === 'available' || (freeCpu > 0.5 && freeRam > 1);

  if (backendStatus === 'insufficient_ram') {
    return {
      label: 'Limited',
      details: `Недостаточно RAM (свободно ${formatNumber(Math.max(0, freeRam))} Gi)`,
      canDeploy: false,
      tone: 'yellow',
    };
  }

  if (backendStatus === 'available') {
    return {
      label: 'Available',
      details: node.gpu
        ? `GPU ${node.gpu.model}`
        : `Free CPU ${formatNumber(Math.max(0, freeCpu))}, RAM ${formatNumber(Math.max(0, freeRam))} Gi`,
      canDeploy: true,
      tone: node.gpu ? 'green' : 'blue',
    };
  }

  return {
    label: canDeploy ? 'Available' : 'Unavailable',
    details: `Free CPU ${formatNumber(Math.max(0, freeCpu))}, RAM ${formatNumber(Math.max(0, freeRam))} Gi`,
    canDeploy,
    tone: canDeploy ? 'blue' : 'red',
  };
}

function toneToBadgeClass(tone: Deployability['tone']): string {
  if (tone === 'green') {
    return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-400';
  }
  if (tone === 'red') {
    return 'bg-red-100 text-red-800 dark:bg-red-500/20 dark:text-red-400';
  }
  if (tone === 'yellow') {
    return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-500/20 dark:text-yellow-400';
  }
  if (tone === 'blue') {
    return 'bg-blue-100 text-blue-800 dark:bg-blue-500/20 dark:text-blue-400';
  }
  return 'bg-gray-100 text-gray-800 dark:bg-slate-700 dark:text-slate-300';
}

function normalizeDeploymentPhase(deployment: DeploymentResponse): string {
  return (deployment.status.phase || deployment.status.status || '').toLowerCase();
}

function deploymentTone(
  phase: string,
  modelReady: boolean
): 'yellow' | 'blue' | 'green' | 'red' | 'gray' {
  if (phase === 'pending' || phase === 'creating') return 'yellow';
  if (phase === 'running' && !modelReady) return 'blue';
  if (phase === 'running' && modelReady) return 'green';
  if (phase === 'failed') return 'red';
  return 'gray';
}

function deploymentStatusLabel(phase: string, modelReady: boolean): string {
  if (phase === 'pending') return 'Pending';
  if (phase === 'creating') return 'Creating';
  if (phase === 'running' && !modelReady) return 'Running (loading)';
  if (phase === 'running' && modelReady) return 'Running';
  if (phase === 'failed') return 'Failed';
  if (phase === 'not_found_in_cluster') return 'Not found in cluster';
  return 'Unknown';
}

function mapNodePlacements(
  node: Pick<NodeSummary, 'name' | 'runningDeployments' | 'gpu'>,
  clusterId: string | null,
  deployments: DeploymentResponse[]
): NodeLlmPlacement[] {
  if (!clusterId) return [];

  const byNode = deployments
    .filter(
      (deployment) =>
        deployment.cluster_id === clusterId && (deployment.node_name || '') === node.name
    )
    .map((deployment) => ({
      id: deployment.id,
      crdName: deployment.crd_name,
      modelName: deployment.model_name,
      mode: deployment.inference.mode,
      phase: normalizeDeploymentPhase(deployment),
      modelReady: deployment.status.model_ready,
      team: deployment.team,
      product: deployment.product,
    }));

  if (byNode.length > 0) {
    return byNode;
  }

  const byCrdName = new Map(
    deployments
      .filter((deployment) => deployment.cluster_id === clusterId)
      .map((deployment) => [deployment.crd_name, deployment])
  );

  return node.runningDeployments.map((crdName) => {
    const linked = byCrdName.get(crdName);
    if (linked) {
      return {
        id: linked.id,
        crdName: linked.crd_name,
        modelName: linked.model_name,
        mode: linked.inference.mode,
        phase: normalizeDeploymentPhase(linked),
        modelReady: linked.status.model_ready,
        team: linked.team,
        product: linked.product,
      };
    }

    return {
      id: crdName,
      crdName,
      modelName: crdName,
      mode: node.gpu ? 'gpu' : 'cpu',
      phase: 'unknown',
      modelReady: false,
      team: null,
      product: null,
    };
  });
}

function ProgressBar({
  value,
  accent = 'indigo',
}: {
  value: number;
  accent?: 'indigo' | 'emerald';
}) {
  const width = Math.max(0, Math.min(toFiniteNumber(value), 100));
  return (
    <div className="mt-1 h-1.5 w-full rounded-full bg-gray-200 dark:bg-slate-800">
      <div
        className={`h-full rounded-full ${accent === 'emerald' ? 'bg-emerald-500' : 'bg-indigo-500'}`}
        style={{ width: `${width}%` }}
      />
    </div>
  );
}

export function Infrastructure({
  onDeployHere,
}: {
  onDeployHere: (payload: DeployHerePayload) => void;
}) {
  const [clusters, setClusters] = useState<ClusterSummary[]>([]);
  const [selectedClusterId, setSelectedClusterId] = useState<string | null>(null);
  const [nodes, setNodes] = useState<NodeSummary[]>([]);
  const [clusterNodesMap, setClusterNodesMap] = useState<Record<string, NodeSummary[]>>({});
  const [vllmCompatibleNodeNames, setVllmCompatibleNodeNames] = useState<string[]>([]);
  const [vllmFilterModelName, setVllmFilterModelName] = useState<string>(
    VLLM_MODEL_OPTIONS[0]
  );
  const [vllmFilterMode, setVllmFilterMode] = useState<VllmFilterMode>('all');

  const [loadingClusters, setLoadingClusters] = useState(true);
  const [loadingNodes, setLoadingNodes] = useState(false);

  const [clustersError, setClustersError] = useState<string | null>(null);
  const [nodesError, setNodesError] = useState<string | null>(null);
  const [placementsError, setPlacementsError] = useState<string | null>(null);
  const [deployments, setDeployments] = useState<DeploymentResponse[]>([]);
  const [consumptionSeries, setConsumptionSeries] = useState<InfrastructureConsumptionPoint[]>(
    []
  );
  const [loadingConsumption, setLoadingConsumption] = useState(true);
  const [consumptionError, setConsumptionError] = useState<string | null>(null);
  const [selectedLoadNodeNames, setSelectedLoadNodeNames] = useState<string[]>([]);

  const selectedClusterIdRef = useRef<string | null>(null);
  const safeVllmCompatibleNodeNames = Array.isArray(vllmCompatibleNodeNames)
    ? vllmCompatibleNodeNames
    : [];

  const nodeRows = useMemo<NodeTableRow[]>(
    () =>
      nodes.map((node) => {
        const placements = mapNodePlacements(node, selectedClusterId, deployments);
        const isVllmCompatible = safeVllmCompatibleNodeNames.includes(node.name);
        return {
          node,
          placements,
          deployability: getDeployability(node, isVllmCompatible, placements.length),
          usedCpu: toFiniteNumber(node.cpuRequestedCores),
          usedRam: toFiniteNumber(node.ramRequestedGi),
        };
      }),
    [nodes, selectedClusterId, deployments, safeVllmCompatibleNodeNames]
  );

  const availableNodeRows = useMemo(
    () => nodeRows.filter((row) => row.deployability.canDeploy),
    [nodeRows]
  );

  const unavailableNodeRows = useMemo(
    () => nodeRows.filter((row) => !row.deployability.canDeploy),
    [nodeRows]
  );

  const loadChartNodeRows = useMemo(
    () =>
      selectedLoadNodeNames.length === 0
        ? nodeRows
        : nodeRows.filter((row) => selectedLoadNodeNames.includes(row.node.name)),
    [nodeRows, selectedLoadNodeNames]
  );

  const hasActualLoadData = useMemo(
    () =>
      loadChartNodeRows.some(
        (row) =>
          row.node.cpuActualPercent !== null || row.node.ramActualPercent !== null
      ),
    [loadChartNodeRows]
  );

  const plannedVsActualChartData = useMemo(
    () =>
      loadChartNodeRows.map((row) => ({
        name: row.node.name,
        cpuRequestedPercent: toFiniteNumber(row.node.cpuUsagePercent),
        cpuActualPercent: toFiniteNumber(row.node.cpuActualPercent, 0),
        ramRequestedPercent: toFiniteNumber(row.node.ramUsagePercent),
        ramActualPercent: toFiniteNumber(row.node.ramActualPercent, 0),
      })),
    [loadChartNodeRows]
  );

  const nodeFilterOptions = useMemo(
    () =>
      Array.from(new Set<string>(nodeRows.map((row) => row.node.name))).sort((a, b) =>
        a.localeCompare(b)
      ),
    [nodeRows]
  );

  const consumptionChartData = useMemo(
    () =>
      consumptionSeries.map((point) => ({
        timestampMs: point.timestampMs,
        time: formatTimeTick(point.timestampMs),
        cpuPercent: point.cpuPercent,
        ramPercent: point.ramPercent,
        gpuPercent: point.gpuPercent,
      })),
    [consumptionSeries]
  );

  const latestConsumption = useMemo(() => {
    if (consumptionSeries.length === 0) {
      return {
        cpuPercent: null,
        ramPercent: null,
        gpuPercent: null,
      };
    }
    const last = consumptionSeries[consumptionSeries.length - 1];
    return {
      cpuPercent: last.cpuPercent,
      ramPercent: last.ramPercent,
      gpuPercent: last.gpuPercent,
    };
  }, [consumptionSeries]);

  const renderNodeRow = (row: NodeTableRow) => {
    const { node, placements, deployability, usedCpu, usedRam } = row;
    const freeRam = Math.max(0, Number(toFiniteNumber(node.ramFreeGi).toFixed(1)));
    const ramStatusTone =
      node.canDeploy === 'insufficient_ram'
        ? 'text-yellow-700 dark:text-yellow-300'
        : freeRam > 1
          ? 'text-emerald-700 dark:text-emerald-300'
          : 'text-red-700 dark:text-red-300';

    return (
      <tr
        key={node.name}
        className="transition-colors hover:bg-gray-50 dark:hover:bg-slate-900/50"
      >
        <td className="px-6 py-4 font-medium text-gray-900 dark:text-white">
          {node.name}
        </td>
        <td className="px-6 py-4 text-gray-700 dark:text-slate-300">{node.role}</td>
        <td className="px-6 py-4">
          {node.status === 'Ready' ? (
            <span className="inline-flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="w-4 h-4" />
              Ready
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-red-600 dark:text-red-400">
              <XCircle className="w-4 h-4" />
              NotReady
            </span>
          )}
        </td>
        <td className="px-6 py-4">
          <div className="text-gray-800 dark:text-slate-200">
            {formatNumber(usedCpu)} / {formatNumber(node.cpuAllocatableCores)}
          </div>
          <div className="text-xs text-gray-500 dark:text-slate-400">
            {formatNumber(node.cpuUsagePercent)}% requested
          </div>
          <ProgressBar value={toFiniteNumber(node.cpuUsagePercent)} accent="indigo" />
          <div className="mt-1 text-xs text-gray-500 dark:text-slate-400">
            Actual:{' '}
            {node.cpuActualCores === null
              ? 'n/a'
              : `${formatNumber(node.cpuActualCores)} / ${formatNumber(node.cpuAllocatableCores)} (${formatNumber(
                  node.cpuActualPercent ?? 0
                )}%)`}
          </div>
          {node.cpuActualPercent !== null && (
            <ProgressBar value={node.cpuActualPercent} accent="emerald" />
          )}
        </td>
        <td className="px-6 py-4">
          <div className="text-gray-800 dark:text-slate-200">
            {formatNumber(usedRam)} / {formatNumber(node.ramAllocatableGi)} Gi
          </div>
          <div className="text-xs text-gray-500 dark:text-slate-400">
            {formatNumber(node.ramUsagePercent)}% requested
          </div>
          <ProgressBar value={toFiniteNumber(node.ramUsagePercent)} accent="emerald" />
          <div className="mt-1 text-xs text-gray-500 dark:text-slate-400">
            Actual:{' '}
            {node.ramActualGi === null
              ? 'n/a'
              : `${formatNumber(node.ramActualGi)} / ${formatNumber(node.ramAllocatableGi)} Gi (${formatNumber(
                  node.ramActualPercent ?? 0
                )}%)`}
          </div>
          {node.ramActualPercent !== null && (
            <ProgressBar value={node.ramActualPercent} accent="indigo" />
          )}
        </td>
        <td className="px-6 py-4">
          {node.gpu ? (
            <div className="space-y-0.5">
              <div className="text-gray-900 dark:text-white">{node.gpu.model}</div>
              <div className="text-xs text-gray-500 dark:text-slate-400">
                Reserved {node.gpu.requestedCount}/{node.gpu.count}
              </div>
              <div className="text-xs text-gray-500 dark:text-slate-400">
                Occupancy {formatNumber(node.gpu.utilizationPercent)}%
              </div>
              <ProgressBar value={toFiniteNumber(node.gpu.utilizationPercent)} accent="indigo" />
            </div>
          ) : (
            <span className="text-gray-400 dark:text-slate-500">CPU only</span>
          )}
        </td>
        <td className="px-6 py-4">
          {placements.length > 0 ? (
            <div className="space-y-2">
              {placements.map((placement) => {
                const phaseTone = deploymentTone(
                  placement.phase,
                  placement.modelReady
                );
                return (
                  <div
                    key={placement.id}
                    className="rounded-md border border-gray-200 dark:border-slate-800 bg-gray-50 dark:bg-slate-900/60 px-2.5 py-2"
                  >
                    <div className="text-xs font-medium text-gray-900 dark:text-white">
                      {placement.modelName}
                    </div>
                    <div className="mt-1 flex items-center gap-2">
                      <span
                        className={`inline-flex rounded px-1.5 py-0.5 text-[10px] font-medium ${toneToBadgeClass(
                          phaseTone
                        )}`}
                      >
                        {deploymentStatusLabel(
                          placement.phase,
                          placement.modelReady
                        )}
                      </span>
                      <span className="text-[10px] text-gray-500 dark:text-slate-400">
                        {placement.mode ?? 'n/a'}
                      </span>
                    </div>
                    <div className="mt-1 text-[10px] text-gray-500 dark:text-slate-400 break-all">
                      {placement.crdName}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <span className="text-gray-500 dark:text-slate-400">Available</span>
          )}
        </td>
        <td className="px-6 py-4">
          <div className="space-y-2">
            <span
              className={`inline-flex rounded-md px-2 py-1 text-xs font-medium ${toneToBadgeClass(
                deployability.tone
              )}`}
            >
              {deployability.label}
            </span>
            <div className="text-xs text-gray-500 dark:text-slate-400">
              {deployability.details}
            </div>
            <div className={`text-[11px] ${ramStatusTone}`}>
              RAM status: requested {formatNumber(usedRam)} / {formatNumber(node.ramAllocatableGi)} Gi
              , free {formatNumber(freeRam)} Gi ({node.ramUsagePercent}% requested)
              {node.ramActualGi !== null
                ? `, actual ${formatNumber(node.ramActualGi)} Gi (${formatNumber(
                    node.ramActualPercent ?? 0
                  )}%)`
                : ', actual n/a'}
            </div>
            {deployability.canDeploy && selectedClusterId && (
              <button
                onClick={(event) => {
                  event.stopPropagation();
                  onDeployHere({
                    clusterId: selectedClusterId,
                    nodeName: node.name,
                    mode:
                      vllmFilterMode === 'all'
                        ? node.gpu
                          ? 'gpu'
                          : 'cpu'
                        : vllmFilterMode,
                  });
                }}
                className="inline-flex items-center gap-1.5 rounded-md border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-700 hover:bg-indigo-100 dark:border-indigo-500/30 dark:bg-indigo-500/10 dark:text-indigo-300 dark:hover:bg-indigo-500/20"
              >
                Deploy here
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </td>
      </tr>
    );
  };

  useEffect(() => {
    selectedClusterIdRef.current = selectedClusterId;
  }, [selectedClusterId]);

  useEffect(() => {
    let unmounted = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let socket: WebSocket | null = null;
    let receivedSnapshot = false;

    const clearReconnectTimer = () => {
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
    };

    const scheduleReconnect = () => {
      if (unmounted || reconnectTimer) {
        return;
      }
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        connect();
      }, 1500);
    };

    const applyStateSnapshot = (payload: {
      clusters?: ClusterSummary[];
      deployments?: DeploymentResponse[];
      nodes_by_cluster?: Record<string, NodeSummary[]>;
    }) => {
      let clusterList: ClusterSummary[] | null = null;
      if (Array.isArray(payload.clusters)) {
        clusterList = payload.clusters
          .map((cluster) => normalizeClusterSnapshot(cluster))
          .filter((cluster): cluster is ClusterSummary => Boolean(cluster));
        setClusters(clusterList);
        setClustersError(null);
        setLoadingClusters(false);
        setSelectedClusterId((current) => {
          if (current && clusterList.some((cluster) => cluster.id === current)) {
            return current;
          }
          return clusterList[0]?.id || null;
        });
      }

      if (clusterList && clusterList.length > 0) {
        const point = aggregateClusterUtilization(clusterList);
        setConsumptionSeries((current) =>
          appendRealtimeConsumptionPoint(current, {
            timestampMs: Date.now(),
            ...point,
          })
        );
        setLoadingConsumption(false);
        setConsumptionError(null);
      }

      if (Array.isArray(payload.deployments)) {
        setDeployments(payload.deployments);
        setPlacementsError(null);
      }

      if (payload.nodes_by_cluster && typeof payload.nodes_by_cluster === 'object') {
        const normalizedMap: Record<string, NodeSummary[]> = {};
        Object.entries(payload.nodes_by_cluster).forEach(([clusterId, nodeList]) => {
          if (Array.isArray(nodeList)) {
            normalizedMap[clusterId] = nodeList
              .map((node) => normalizeNodeSnapshot(node))
              .filter((node): node is NodeSummary => Boolean(node));
          }
        });
        setClusterNodesMap(normalizedMap);
        const activeClusterId = selectedClusterIdRef.current;
        if (activeClusterId) {
          setNodes(normalizedMap[activeClusterId] || []);
          setNodesError(null);
          setLoadingNodes(false);
        }
      }
    };

    const connect = () => {
      if (unmounted) {
        return;
      }

      const wsUrl = buildRealtimeSocketUrl({
        scope: ['infrastructure', 'deployments'],
        intervalSeconds: 4,
      });
      socket = new WebSocket(wsUrl);

      socket.onopen = () => {
        if (unmounted) return;
        setClustersError(null);
        setPlacementsError(null);
        setNodesError(null);
        setConsumptionError(null);
      };

      socket.onmessage = (event) => {
        if (unmounted) return;
        const message = parseRealtimeSocketMessage(event.data);
        if (!message) return;

        if (message.type === 'state_snapshot') {
          applyStateSnapshot(message.payload || {});
          receivedSnapshot = true;
          return;
        }

        if (message.type === 'error') {
          const errorText = String(message.message || '').trim();
          if (errorText) {
            setClustersError(errorText);
            setConsumptionError(errorText);
          }
          if (!receivedSnapshot) {
            setLoadingClusters(false);
            setLoadingNodes(false);
            setLoadingConsumption(false);
          }
        }
      };

      socket.onerror = () => {
        if (unmounted) return;
        if (!receivedSnapshot) {
          setClustersError('Realtime connection failed for infrastructure state.');
          setLoadingClusters(false);
          setLoadingNodes(false);
          setConsumptionError('Realtime connection failed for infrastructure metrics.');
          setLoadingConsumption(false);
        }
      };

      socket.onclose = () => {
        if (unmounted) return;
        scheduleReconnect();
      };
    };

    connect();

    return () => {
      unmounted = true;
      clearReconnectTimer();
      if (socket && socket.readyState <= WebSocket.OPEN) {
        socket.close();
      }
    };
  }, []);

  useEffect(() => {
    if (!selectedClusterId) {
      setNodes([]);
      setLoadingNodes(false);
      return;
    }
    const nextNodes = clusterNodesMap[selectedClusterId];
    if (Array.isArray(nextNodes)) {
      setNodes(nextNodes);
      setNodesError(null);
      setLoadingNodes(false);
      return;
    }
    setNodes([]);
    setLoadingNodes(true);
  }, [selectedClusterId, clusterNodesMap]);

  useEffect(() => {
    if (!selectedClusterId) {
      setVllmCompatibleNodeNames([]);
      return;
    }

    let active = true;

    const loadVllmCompatibleNodes = async () => {
      try {
        const data = await (
          vllmFilterMode === 'all'
            ? (() => {
                const loadAllModes = async () => {
                  const settled = await Promise.allSettled([
                    getClusterDeployableNodes(
                      selectedClusterId,
                      vllmFilterModelName,
                      'gpu',
                      'compatibility'
                    ),
                    getClusterDeployableNodes(
                      selectedClusterId,
                      vllmFilterModelName,
                      'cpu',
                      'compatibility'
                    ),
                  ]);

                  const merged: NodeSummary[] = [];
                  for (const result of settled) {
                    if (result.status === 'fulfilled') {
                      merged.push(...result.value);
                    }
                  }

                  if (merged.length === 0) {
                    const firstError = settled.find(
                      (item): item is PromiseRejectedResult => item.status === 'rejected'
                    );
                    if (firstError?.reason instanceof Error) {
                      throw firstError.reason;
                    }
                    throw new Error('Failed to load deployable nodes for both modes.');
                  }

                  const uniqueNames = Array.from(
                    new Set(merged.map((node) => node.name))
                  );
                  return uniqueNames;
                };
                return loadAllModes();
              })()
            : getClusterDeployableNodes(
                selectedClusterId,
                vllmFilterModelName,
                vllmFilterMode,
                'compatibility'
              ).then((nodes) => nodes.map((node) => node.name))
        );
        if (!active) return;
        const normalizedNames = Array.isArray(data)
          ? data.filter((item): item is string => typeof item === 'string' && item.length > 0)
          : [];
        setVllmCompatibleNodeNames(normalizedNames);
      } catch {
        if (!active) return;
        // Keep previous snapshot to avoid UI flicker on transient backend/network errors.
      }
    };

    void loadVllmCompatibleNodes();

    return () => {
      active = false;
    };
  }, [selectedClusterId, vllmFilterModelName, vllmFilterMode]);

  useEffect(() => {
    setSelectedLoadNodeNames((current) =>
      current.filter((name) => nodeFilterOptions.includes(name))
    );
  }, [nodeFilterOptions]);

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          Инфраструктура
        </h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-slate-400">
          Верхние показатели в карточках и таблице ниже показывают планируемые ресурсы
          (Kubernetes requests/reserved). Ниже добавлен отдельный блок с реальной текущей
          нагрузкой.
        </p>
      </div>

      {clustersError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
          {clustersError}
        </div>
      )}

      {placementsError && (
        <div className="rounded-lg border border-yellow-200 bg-yellow-50 px-4 py-3 text-sm text-yellow-800 dark:border-yellow-500/30 dark:bg-yellow-500/10 dark:text-yellow-300">
          {placementsError}
        </div>
      )}

      <div className="bg-white dark:bg-slate-950 rounded-xl border border-gray-200 dark:border-slate-800 p-6 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Clusters</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {clusters.map((cluster) => {
            const isSelected = cluster.id === selectedClusterId;
            return (
              <button
                key={cluster.id}
                onClick={() => setSelectedClusterId(cluster.id)}
                className={`text-left rounded-xl border p-4 transition-colors ${
                  isSelected
                    ? 'border-indigo-500 bg-indigo-50 dark:border-indigo-500/60 dark:bg-indigo-500/10'
                    : 'border-gray-200 dark:border-slate-800 hover:border-indigo-300 dark:hover:border-indigo-500/40'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="text-base font-semibold text-gray-900 dark:text-white">
                    {cluster.id}
                  </div>
                  <ArrowRight className="w-4 h-4 text-gray-400" />
                </div>
                <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <div className="text-gray-500 dark:text-slate-400">Nodes</div>
                    <div className="text-gray-900 dark:text-white font-medium">
                      {cluster.readyNodes}/{cluster.totalNodes} Ready
                    </div>
                  </div>
                  <div>
                    <div className="text-gray-500 dark:text-slate-400">Deployments</div>
                    <div className="text-gray-900 dark:text-white font-medium">
                      {cluster.activeDeployments}
                    </div>
                  </div>
                  <div>
                    <div className="text-gray-500 dark:text-slate-400">CPU</div>
                    <div className="text-gray-900 dark:text-white font-medium">
                      {formatNumber(cluster.usedCpuCores)} / {formatNumber(cluster.totalCpuCores)} (req/alloc)
                    </div>
                    <div className="text-[11px] text-gray-500 dark:text-slate-400">
                      Actual: {formatNullableNumber(cluster.actualCpuCores)} / {formatNumber(cluster.totalCpuCores)}
                      {cluster.actualCpuPercent !== null ? ` (${formatNumber(cluster.actualCpuPercent)}%)` : ''}
                    </div>
                  </div>
                  <div>
                    <div className="text-gray-500 dark:text-slate-400">RAM</div>
                    <div className="text-gray-900 dark:text-white font-medium">
                      {formatNumber(cluster.usedRamGi)} / {formatNumber(cluster.totalRamGi)} Gi (req/alloc)
                    </div>
                    <div className="text-[11px] text-gray-500 dark:text-slate-400">
                      Actual: {formatNullableNumber(cluster.actualRamGi)} / {formatNumber(cluster.totalRamGi)} Gi
                      {cluster.actualRamPercent !== null ? ` (${formatNumber(cluster.actualRamPercent)}%)` : ''}
                    </div>
                  </div>
                  <div>
                    <div className="text-gray-500 dark:text-slate-400">GPU</div>
                    <div className="text-gray-900 dark:text-white font-medium">
                      {cluster.usedGpus} / {cluster.totalGpus} (reserved/alloc)
                    </div>
                  </div>
                </div>
                <div className="mt-3">
                  <div className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-slate-400">
                    Nodes in cluster
                  </div>
                  {(clusterNodesMap[cluster.id] || []).length === 0 ? (
                    <div className="mt-1 text-xs text-gray-500 dark:text-slate-400">
                      No nodes data
                    </div>
                  ) : (
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {(clusterNodesMap[cluster.id] || []).slice(0, 4).map((node) => (
                        <span
                          key={node.name}
                          className={`rounded-md px-2 py-0.5 text-[11px] ${
                            node.status === 'Ready'
                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300'
                              : 'bg-red-100 text-red-800 dark:bg-red-500/20 dark:text-red-300'
                          }`}
                        >
                          {node.name}
                        </span>
                      ))}
                      {(clusterNodesMap[cluster.id] || []).length > 4 && (
                        <span className="rounded-md bg-gray-100 px-2 py-0.5 text-[11px] text-gray-700 dark:bg-slate-800 dark:text-slate-300">
                          +{(clusterNodesMap[cluster.id] || []).length - 4}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="bg-white dark:bg-slate-950 rounded-xl border border-gray-200 dark:border-slate-800 p-6 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              Текущая нагрузка
            </h2>
            <p className="mt-1 text-xs text-gray-500 dark:text-slate-400">
              Источник: realtime stream `/ws/state` (clusters + nodes).
            </p>
          </div>
        </div>

        {consumptionError && (
          <div className="mb-4 rounded-lg border border-yellow-200 bg-yellow-50 px-4 py-3 text-sm text-yellow-800 dark:border-yellow-500/30 dark:bg-yellow-500/10 dark:text-yellow-300">
            {consumptionError}
          </div>
        )}

        {loadingConsumption && consumptionChartData.length === 0 ? (
          <div className="text-sm text-gray-500 dark:text-slate-400">
            Загружаем realtime-метрики инфраструктуры...
          </div>
        ) : consumptionChartData.length === 0 ? (
          <div className="text-sm text-yellow-700 dark:text-yellow-300">
            Нет данных realtime для графиков общего потребления CPU/GPU/RAM.
          </div>
        ) : (
          <div className="space-y-4 mb-5">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="rounded-lg border border-gray-200 dark:border-slate-800 px-3 py-2">
                <div className="text-xs text-gray-500 dark:text-slate-400">CPU total</div>
                <div className="text-sm font-semibold text-gray-900 dark:text-white">
                  {formatPercent(latestConsumption.cpuPercent)}
                </div>
              </div>
              <div className="rounded-lg border border-gray-200 dark:border-slate-800 px-3 py-2">
                <div className="text-xs text-gray-500 dark:text-slate-400">RAM total</div>
                <div className="text-sm font-semibold text-gray-900 dark:text-white">
                  {formatPercent(latestConsumption.ramPercent)}
                </div>
              </div>
              <div className="rounded-lg border border-gray-200 dark:border-slate-800 px-3 py-2">
                <div className="text-xs text-gray-500 dark:text-slate-400">GPU total</div>
                <div className="text-sm font-semibold text-gray-900 dark:text-white">
                  {formatPercent(latestConsumption.gpuPercent)}
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-gray-200 dark:border-slate-800 p-3">
              <div className="text-xs uppercase tracking-wide text-gray-500 dark:text-slate-400 mb-2">
                Общее потребление по realtime snapshot (последние 30 минут)
              </div>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={consumptionChartData}>
                    <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.2} />
                    <XAxis dataKey="time" tick={{ fontSize: 11 }} minTickGap={28} />
                    <YAxis domain={[0, 100]} tickFormatter={(value) => `${value}%`} />
                    <Tooltip
                      labelFormatter={(_value, payload) => {
                        const timestampMs = payload?.[0]?.payload?.timestampMs as
                          | number
                          | undefined;
                        if (!timestampMs) {
                          return '';
                        }
                        return new Date(timestampMs).toLocaleString('ru-RU');
                      }}
                      formatter={(value: number | null, name: string) => [
                        formatPercent(value ?? null),
                        name,
                      ]}
                    />
                    <Legend />
                    <Line
                      type="monotone"
                      dataKey="cpuPercent"
                      name="CPU"
                      stroke="#6366f1"
                      strokeWidth={2}
                      dot={false}
                      connectNulls
                    />
                    <Line
                      type="monotone"
                      dataKey="ramPercent"
                      name="RAM"
                      stroke="#0ea5e9"
                      strokeWidth={2}
                      dot={false}
                      connectNulls
                    />
                    <Line
                      type="monotone"
                      dataKey="gpuPercent"
                      name="GPU"
                      stroke="#f59e0b"
                      strokeWidth={2}
                      dot={false}
                      connectNulls
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        )}

        {selectedClusterId && nodeRows.length > 0 && (
          <div className="mb-5 rounded-lg border border-gray-200 dark:border-slate-800 p-3">
            <div className="flex items-center justify-between gap-3">
              <div className="text-xs uppercase tracking-wide text-gray-500 dark:text-slate-400">
                Фильтр по нодам (для графиков по нодам ниже)
              </div>
              <button
                type="button"
                onClick={() => {
                  setSelectedLoadNodeNames([]);
                }}
                className="rounded-md border border-gray-300 dark:border-slate-700 px-2 py-1 text-[11px] text-gray-700 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-800"
              >
                Сбросить
              </button>
            </div>
            <div className="mt-2 flex max-h-28 flex-wrap gap-2 overflow-y-auto pr-1">
              {nodeFilterOptions.map((nodeName) => {
                const selected = selectedLoadNodeNames.includes(nodeName);
                return (
                  <button
                    key={nodeName}
                    type="button"
                    onClick={() => {
                      setSelectedLoadNodeNames((current) =>
                        current.includes(nodeName)
                          ? current.filter((value) => value !== nodeName)
                          : [...current, nodeName]
                      );
                    }}
                    className={`rounded-full border px-2.5 py-1 text-xs ${
                      selected
                        ? 'border-indigo-500 bg-indigo-50 text-indigo-700 dark:border-indigo-400 dark:bg-indigo-500/20 dark:text-indigo-300'
                        : 'border-gray-300 text-gray-700 dark:border-slate-700 dark:text-slate-300'
                    }`}
                  >
                    {selected ? '✓ ' : ''}
                    {nodeName}
                  </button>
                );
              })}
              {nodeFilterOptions.length === 0 && (
                <div className="text-xs text-gray-500 dark:text-slate-400">Ноды не найдены.</div>
              )}
            </div>
            <div className="mt-2 text-xs text-gray-500 dark:text-slate-400">
              Выбрано:{' '}
              {selectedLoadNodeNames.length === 0
                ? 'все ноды'
                : `${selectedLoadNodeNames.length} из ${nodeFilterOptions.length}`}
            </div>
          </div>
        )}

        {!selectedClusterId ? (
          <div className="text-sm text-gray-500 dark:text-slate-400">
            Выберите кластер, чтобы увидеть метрики по нодам.
          </div>
        ) : nodes.length === 0 ? (
          <div className="text-sm text-gray-500 dark:text-slate-400">
            Нет данных по нодам для построения графиков.
          </div>
        ) : plannedVsActualChartData.length === 0 ? (
          <div className="text-sm text-gray-500 dark:text-slate-400">
            По выбранному фильтру нод данных нет. Сбросьте фильтр или выберите другие ноды.
          </div>
        ) : !hasActualLoadData ? (
          <div className="text-sm text-yellow-700 dark:text-yellow-300">
            Для выбранного кластера сейчас нет live-метрик CPU/RAM. Проверь `metrics-server`.
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div className="rounded-lg border border-gray-200 dark:border-slate-800 p-3">
              <div className="text-xs uppercase tracking-wide text-gray-500 dark:text-slate-400 mb-2">
                CPU % (Requested vs Actual)
              </div>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={plannedVsActualChartData}>
                    <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.2} />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis domain={[0, 100]} tickFormatter={(value) => `${value}%`} />
                    <Tooltip formatter={(value: number) => `${formatNumber(value)}%`} />
                    <Bar dataKey="cpuRequestedPercent" name="Requested" fill="#6366f1" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="cpuActualPercent" name="Actual" fill="#10b981" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div className="rounded-lg border border-gray-200 dark:border-slate-800 p-3">
              <div className="text-xs uppercase tracking-wide text-gray-500 dark:text-slate-400 mb-2">
                RAM % (Requested vs Actual)
              </div>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={plannedVsActualChartData}>
                    <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.2} />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis domain={[0, 100]} tickFormatter={(value) => `${value}%`} />
                    <Tooltip formatter={(value: number) => `${formatNumber(value)}%`} />
                    <Bar dataKey="ramRequestedPercent" name="Requested" fill="#0ea5e9" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="ramActualPercent" name="Actual" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="bg-white dark:bg-slate-950 rounded-xl border border-gray-200 dark:border-slate-800 overflow-hidden shadow-sm">
        <div className="px-6 py-4 border-b border-gray-200 dark:border-slate-800 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Запланированная нагрузка</h2>
            <p className="mt-1 text-xs text-gray-500 dark:text-slate-400">
              Source for this table: planned/reserved resources (allocatable + requests).
            </p>
          </div>
          <div />
        </div>

        {nodesError && (
          <div className="px-6 py-3 text-sm text-red-700 bg-red-50 dark:bg-red-500/10 dark:text-red-300">
            {nodesError}
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-left text-sm">
            <thead className="bg-gray-50 dark:bg-slate-900/50 text-gray-600 dark:text-slate-400 border-b border-gray-200 dark:border-slate-800">
              <tr>
                <th className="px-6 py-4 font-medium">Name</th>
                <th className="px-6 py-4 font-medium">Role</th>
                <th className="px-6 py-4 font-medium">Status</th>
                <th className="px-6 py-4 font-medium">CPU (req/alloc)</th>
                <th className="px-6 py-4 font-medium">RAM (req/alloc)</th>
                <th className="px-6 py-4 font-medium">GPU (reserved)</th>
                <th className="px-6 py-4 font-medium">Running deployments</th>
                <th className="px-6 py-4 font-medium">Can deploy</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-slate-800">
              {(loadingClusters && nodes.length === 0) || (loadingNodes && nodes.length === 0) ? (
                <tr>
                  <td colSpan={8} className="px-6 py-12 text-center">
                    <p className="text-gray-500 dark:text-slate-400">Загрузка данных...</p>
                  </td>
                </tr>
              ) : nodes.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-10 text-center text-gray-500 dark:text-slate-400">
                    Нет нод, подходящих под выбранный vLLM фильтр.
                  </td>
                </tr>
              ) : (
                <>
                  <tr className="bg-emerald-50/70 dark:bg-emerald-500/10">
                    <td colSpan={8} className="px-6 py-2.5 text-xs font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
                      Доступны для vLLM ({availableNodeRows.length})
                    </td>
                  </tr>
                  {availableNodeRows.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-6 py-4 text-sm text-gray-500 dark:text-slate-400">
                        Нет нод, на которые сейчас можно безопасно запускать vLLM.
                      </td>
                    </tr>
                  ) : (
                    availableNodeRows.map(renderNodeRow)
                  )}

                  <tr className="bg-amber-50/70 dark:bg-amber-500/10">
                    <td colSpan={8} className="px-6 py-2.5 text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300">
                      Недоступны для vLLM ({unavailableNodeRows.length})
                    </td>
                  </tr>
                  {unavailableNodeRows.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-6 py-4 text-sm text-gray-500 dark:text-slate-400">
                        Все ноды в кластере доступны для запуска vLLM.
                      </td>
                    </tr>
                  ) : (
                    unavailableNodeRows.map(renderNodeRow)
                  )}
                </>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
