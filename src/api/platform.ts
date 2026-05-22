import {
  type DeploymentResponse,
  type InferenceApiTokenInfo,
  type InferenceApiTokenCreateResponse,
  createDeployment as createDeploymentRequest,
  getDeployment as getDeploymentRequest,
  getDeployments as getDeploymentsRequest,
  deleteDeployment as deleteDeploymentRequest,
  listTrafficRoutes as listTrafficRoutesRequest,
  createTrafficRoute as createTrafficRouteRequest,
  updateTrafficRoute as updateTrafficRouteRequest,
  deleteTrafficRoute as deleteTrafficRouteRequest,
  testTrafficRoute as testTrafficRouteRequest,
  listReleases as listReleasesRequest,
  getRelease as getReleaseRequest,
  createRelease as createReleaseRequest,
  pauseRelease as pauseReleaseRequest,
  resumeRelease as resumeReleaseRequest,
  rollbackRelease as rollbackReleaseRequest,
  skipReleaseTo100 as skipReleaseTo100Request,
  createDeploymentInferenceToken,
  listDeploymentInferenceTokens,
  revokeDeploymentInferenceToken,
} from './deployments';
import {
  getCostHistory as getCostHistoryRequest,
  getModelRates as getModelRatesRequest,
  getElectricityPrice as getElectricityPriceRequest,
  updateModelRate as updateModelRateRequest,
  updateElectricityPrice as updateElectricityPriceRequest,
  getEnergyHistory as getEnergyHistoryRequest,
  getCostSummary as getCostSummaryRequest,
  type CostEntry as FinopsCostEntry,
  type CostSummary,
  type ModelRate as FinopsModelRate,
  type EnergyTimeSeries,
} from './finops';
import {
  listQuotas as listQuotasRequest,
  createQuota as createQuotaRequest,
  updateQuota as updateQuotaRequest,
  deleteQuota as deleteQuotaRequest,
  type QuotaResponse,
} from './quotas';
import {
  listUsers as listSecurityUsers,
  listTeams as listSecurityTeams,
  listProjectRoles,
  type UserResponse,
  type TeamResponse,
  type RoleLiteral,
} from './security';
import {
  getClusters,
  getClusterNodes,
  type NodeSummary,
} from './infrastructure';
import { isDemoModeEnabled } from './demoMode';

export type DeploymentStatus = 'pending' | 'pulling' | 'running' | 'failed';

export interface PodStatus {
  name: string;
  status: 'pending' | 'pulling' | 'running' | 'failed';
  progress: number;
  stage?: string;
}

export interface ClusterGroup {
  clusterId: string;
  replicas: number;
  status: DeploymentStatus;
  progress: number;
  message?: string;
  pods?: PodStatus[];
}

export interface Deployment {
  id: string;
  modelName: string;
  modelVersion: string;
  clusterId: string;
  replicas: number;
  status: DeploymentStatus;
  message?: string;
  createdAt: string;
  team: string;
  product: string;
  ownerId: string;
  isMultiCluster?: boolean;
  clusterGroups?: ClusterGroup[];
  backendClusterId?: string;
}

export interface ReleaseMetric {
  latencyP99: number;
  errorRate: number;
  throughput: number;
}

export interface ReleaseStep {
  percent: number;
  timestamp?: string;
  status: 'pending' | 'completed' | 'active';
  metrics?: ReleaseMetric;
}

export interface ReleaseEvent {
  timestamp: string;
  type: 'info' | 'warning' | 'error' | 'action';
  message: string;
}

export interface Release {
  id: string;
  name: string;
  sourceId: string;
  targetId: string;
  routeId: string;
  strategy: 'canary' | 'blue-green' | 'linear';
  status: 'rolling' | 'paused' | 'succeeded' | 'failed' | 'rolled-back';
  currentPercent: number;
  targetPercent: number;
  sloHealthy: boolean;
  currentMetrics: ReleaseMetric;
  sourceMetrics: ReleaseMetric;
  createdAt: string;
  type: 'standard' | 'migration';
  sourceCluster?: string;
  targetCluster?: string;
  steps: ReleaseStep[];
  events: ReleaseEvent[];
}

export interface RouteBackend {
  deploymentId: string;
  clusterId: string;
  weight: number;
}

export interface TrafficRoute {
  id: string;
  name: string;
  backends: RouteBackend[];
  status?: string;
  statusReason?: string | null;
}

export interface Quota {
  id: string;
  subjectType: 'team' | 'user';
  subjectId: string;
  subjectName: string;
  model: string;
  limitValue: number;
  limitUnit: 'tokens' | 'requests';
  period: 'hour' | 'day' | 'month';
  action: 'block' | 'throttle' | 'warn';
  priority: number;
  usageValue: number;
  usageCost: number;
  status: 'active' | 'throttled' | 'blocked';
  clusterId: string;
}

export type CostEntry = {
  id: string;
  deploymentId: string;
  modelName: string;
  team: string;
  product: string;
  inputTokens: number;
  outputTokens: number;
  inferenceCost: number;
  electricityCost: number;
  energyKWh: number;
  clusterId: string;
  timestamp: string;
  ownerId: string;
};

export interface PlatformRates {
  electricityPriceKWh: number;
}

export interface ModelRate {
  modelName: string;
  inputPricePer1M: number;
  outputPricePer1M: number;
  wattsPerReplica: number;
}

export type PlatformRole = 'admin' | 'developer' | 'manager' | 'viewer';
export type TeamRole = 'owner' | 'manager' | 'member' | 'viewer';

export interface UserTeamMembership {
  teamId: string;
  role: TeamRole;
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: PlatformRole;
  memberships: UserTeamMembership[];
  allowedClusters: string[];
  createdAt: string;
}

export interface Team {
  id: string;
  name: string;
  memberCount: number;
  deploymentIds: string[];
  allowedClusters: string[];
}

export interface Permission {
  id: string;
  category: string;
  name: string;
  label: string;
  description: string;
}

export interface RolePermissions {
  roleId: string;
  permissions: string[];
}

export interface TechnicalToken {
  id: string;
  name?: string;
  token: string;
  model: string;
  cluster: string;
  deploymentId: string;
  createdAt: string;
  expiresAt: string;
  status: 'active' | 'revoked' | 'expired';
}

export interface ClusterNode {
  id: string;
  name: string;
  clusterId: string;
  type: 'gpu' | 'cpu';
  gpuModel?: string;
  allocatable: {
    cpu: number;
    ram: number;
    gpu: number;
  };
  used: {
    cpu: number;
    ram: number;
    gpu: number;
  };
  deployments: string[];
  isDeployable: boolean;
  status: 'ready' | 'not-ready';
}

type ImportMetaEnvShape = ImportMeta & {
  env: Record<string, string | undefined>;
};

export const REAL_CLUSTER_ID =
  (import.meta as ImportMetaEnvShape).env.VITE_REAL_CLUSTER_ID?.trim() || 'msk-1';
export const REAL_CLUSTER_LABEL =
  (import.meta as ImportMetaEnvShape).env.VITE_REAL_CLUSTER_LABEL?.trim() || REAL_CLUSTER_ID;

const tokenToDeployment = new Map<string, string>();
const DEMO_MODE = isDemoModeEnabled();
const DEMO_CLUSTER_IDS = ['msk-1', 'spb-1', 'ekb-1'] as const;

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function isoHoursAgo(hoursAgo: number): string {
  return new Date(Date.now() - hoursAgo * 60 * 60 * 1000).toISOString();
}

const demoState: {
  deployments: Deployment[];
  releases: Release[];
  routes: TrafficRoute[];
  quotas: Quota[];
  tokens: TechnicalToken[];
  users: User[];
  permissions: Permission[];
  modelRates: ModelRate[];
  electricityPriceKWh: number;
} = {
  deployments: [
    {
      id: 'dep-smollm2-msk',
      modelName: 'HuggingFaceTB/SmolLM2-1.7B-Instruct',
      modelVersion: 'latest',
      clusterId: 'msk-1',
      replicas: 2,
      status: 'running',
      message: 'Serving traffic',
      createdAt: isoHoursAgo(72),
      team: 'Data Science',
      product: 'Assistant API',
      ownerId: 'Data Science',
    },
    {
      id: 'dep-qwen-spb',
      modelName: 'Qwen/Qwen2.5-3B-Instruct',
      modelVersion: 'latest',
      clusterId: 'spb-1',
      replicas: 2,
      status: 'running',
      message: 'Serving traffic',
      createdAt: isoHoursAgo(48),
      team: 'Search',
      product: 'Semantic Search',
      ownerId: 'Search',
    },
    {
      id: 'dep-gemma-ekb',
      modelName: 'google/gemma-3-4b-it',
      modelVersion: 'latest',
      clusterId: 'ekb-1',
      replicas: 1,
      status: 'pulling',
      message: 'Pulling model weights',
      createdAt: isoHoursAgo(12),
      team: 'Fraud',
      product: 'Risk Scoring',
      ownerId: 'Fraud',
    },
    {
      id: 'dep-smolvlm-msk',
      modelName: 'HuggingFaceTB/SmolVLM2-2.2B-Instruct',
      modelVersion: 'latest',
      clusterId: 'msk-1',
      replicas: 1,
      status: 'running',
      message: 'Serving traffic',
      createdAt: isoHoursAgo(96),
      team: 'Vision',
      product: 'OCR Helper',
      ownerId: 'Vision',
    },
    {
      id: 'dep-llama31-msk',
      modelName: 'meta-llama/Llama-3.1-8B-Instruct',
      modelVersion: 'latest',
      clusterId: 'msk-1',
      replicas: 1,
      status: 'running',
      message: 'Serving traffic',
      createdAt: isoHoursAgo(36),
      team: 'Platform',
      product: 'Support Assistant',
      ownerId: 'Platform',
    },
    {
      id: 'dep-mistral-spb',
      modelName: 'mistralai/Mistral-7B-Instruct-v0.3',
      modelVersion: 'latest',
      clusterId: 'spb-1',
      replicas: 1,
      status: 'running',
      message: 'Serving traffic',
      createdAt: isoHoursAgo(28),
      team: 'Support',
      product: 'Agent Helper',
      ownerId: 'Support',
    },
    {
      id: 'dep-phi4-ekb',
      modelName: 'microsoft/Phi-4-mini-instruct',
      modelVersion: 'latest',
      clusterId: 'ekb-1',
      replicas: 1,
      status: 'running',
      message: 'Serving traffic',
      createdAt: isoHoursAgo(16),
      team: 'Fraud',
      product: 'Risk Co-Pilot',
      ownerId: 'Fraud',
    },
  ],
  releases: [
    {
      id: 'rel-smollm2-rollout',
      name: 'assistant-main',
      sourceId: 'dep-smollm2-msk',
      targetId: 'dep-qwen-spb',
      routeId: 'assistant-main',
      strategy: 'canary',
      status: 'rolling',
      currentPercent: 35,
      targetPercent: 100,
      sloHealthy: true,
      currentMetrics: { latencyP99: 680, errorRate: 0.22, throughput: 86 },
      sourceMetrics: { latencyP99: 720, errorRate: 0.28, throughput: 80 },
      createdAt: isoHoursAgo(6),
      type: 'standard',
      sourceCluster: 'msk-1',
      targetCluster: 'spb-1',
      steps: [
        { percent: 5, status: 'completed', timestamp: isoHoursAgo(6.5) },
        { percent: 20, status: 'completed', timestamp: isoHoursAgo(6.0) },
        { percent: 35, status: 'active', timestamp: isoHoursAgo(5.5) },
        { percent: 50, status: 'pending' },
        { percent: 100, status: 'pending' },
      ],
      events: [
        {
          timestamp: isoHoursAgo(6.5),
          type: 'info',
          message: 'Release created, initial canary 5%',
        },
        {
          timestamp: isoHoursAgo(6.0),
          type: 'action',
          message: 'Traffic increased to 20%',
        },
      ],
    },
    {
      id: 'rel-support-rollout',
      name: 'support-chat',
      sourceId: 'dep-llama31-msk',
      targetId: 'dep-mistral-spb',
      routeId: 'support-chat',
      strategy: 'canary',
      status: 'paused',
      currentPercent: 50,
      targetPercent: 100,
      sloHealthy: true,
      currentMetrics: { latencyP99: 540, errorRate: 0.16, throughput: 102 },
      sourceMetrics: { latencyP99: 575, errorRate: 0.21, throughput: 94 },
      createdAt: isoHoursAgo(10),
      type: 'standard',
      sourceCluster: 'msk-1',
      targetCluster: 'spb-1',
      steps: [
        { percent: 10, status: 'completed', timestamp: isoHoursAgo(10) },
        { percent: 30, status: 'completed', timestamp: isoHoursAgo(9.4) },
        { percent: 50, status: 'active', timestamp: isoHoursAgo(8.8) },
        { percent: 70, status: 'pending' },
        { percent: 100, status: 'pending' },
      ],
      events: [
        {
          timestamp: isoHoursAgo(8.8),
          type: 'warning',
          message: 'Paused by operator after latency spike.',
        },
      ],
    },
    {
      id: 'rel-fraud-migration',
      name: 'fraud-risk',
      sourceId: 'dep-gemma-ekb',
      targetId: 'dep-phi4-ekb',
      routeId: 'fraud-risk',
      strategy: 'canary',
      status: 'succeeded',
      currentPercent: 100,
      targetPercent: 100,
      sloHealthy: true,
      currentMetrics: { latencyP99: 430, errorRate: 0.11, throughput: 68 },
      sourceMetrics: { latencyP99: 510, errorRate: 0.22, throughput: 56 },
      createdAt: isoHoursAgo(30),
      type: 'migration',
      sourceCluster: 'ekb-1',
      targetCluster: 'ekb-1',
      steps: [
        { percent: 10, status: 'completed', timestamp: isoHoursAgo(30) },
        { percent: 40, status: 'completed', timestamp: isoHoursAgo(29.5) },
        { percent: 70, status: 'completed', timestamp: isoHoursAgo(29) },
        { percent: 100, status: 'completed', timestamp: isoHoursAgo(28.5) },
      ],
      events: [
        {
          timestamp: isoHoursAgo(28.5),
          type: 'info',
          message: 'Release completed successfully.',
        },
      ],
    },
  ],
  routes: [
    {
      id: 'assistant-main',
      name: 'assistant-main',
      backends: [
        { deploymentId: 'dep-smollm2-msk', clusterId: 'msk-1', weight: 65 },
        { deploymentId: 'dep-qwen-spb', clusterId: 'spb-1', weight: 35 },
      ],
      status: 'active',
      statusReason: null,
    },
    {
      id: 'vision-ocr',
      name: 'vision-ocr',
      backends: [{ deploymentId: 'dep-smolvlm-msk', clusterId: 'msk-1', weight: 100 }],
      status: 'active',
      statusReason: null,
    },
    {
      id: 'support-chat',
      name: 'support-chat',
      backends: [
        { deploymentId: 'dep-llama31-msk', clusterId: 'msk-1', weight: 50 },
        { deploymentId: 'dep-mistral-spb', clusterId: 'spb-1', weight: 50 },
      ],
      status: 'active',
      statusReason: null,
    },
    {
      id: 'fraud-risk',
      name: 'fraud-risk',
      backends: [
        { deploymentId: 'dep-gemma-ekb', clusterId: 'ekb-1', weight: 0 },
        { deploymentId: 'dep-phi4-ekb', clusterId: 'ekb-1', weight: 100 },
      ],
      status: 'active',
      statusReason: null,
    },
  ],
  quotas: [
    {
      id: 'quota-data-science',
      subjectType: 'team',
      subjectId: 'Data Science',
      subjectName: 'Data Science',
      model: 'all',
      limitValue: 9_000_000,
      limitUnit: 'tokens',
      period: 'month',
      action: 'throttle',
      priority: 3,
      usageValue: 5_300_000,
      usageCost: 0,
      status: 'active',
      clusterId: 'msk-1',
    },
    {
      id: 'quota-search',
      subjectType: 'team',
      subjectId: 'Search',
      subjectName: 'Search',
      model: 'all',
      limitValue: 6_000_000,
      limitUnit: 'tokens',
      period: 'month',
      action: 'block',
      priority: 2,
      usageValue: 5_850_000,
      usageCost: 0,
      status: 'throttled',
      clusterId: 'spb-1',
    },
    {
      id: 'quota-fraud-daily',
      subjectType: 'team',
      subjectId: 'Fraud',
      subjectName: 'Fraud',
      model: 'microsoft/Phi-4-mini-instruct',
      limitValue: 900_000,
      limitUnit: 'tokens',
      period: 'day',
      action: 'warn',
      priority: 4,
      usageValue: 640_000,
      usageCost: 0,
      status: 'active',
      clusterId: 'ekb-1',
    },
    {
      id: 'quota-platform-hourly',
      subjectType: 'team',
      subjectId: 'Platform',
      subjectName: 'Platform',
      model: 'all',
      limitValue: 3000,
      limitUnit: 'requests',
      period: 'hour',
      action: 'block',
      priority: 1,
      usageValue: 1720,
      usageCost: 0,
      status: 'active',
      clusterId: 'msk-1',
    },
  ],
  tokens: [
    {
      id: 'tok-assistant-main',
      name: 'Assistant Main',
      token: 'llmptk_demo_assistant_xxx',
      model: 'HuggingFaceTB/SmolLM2-1.7B-Instruct',
      cluster: 'msk-1',
      deploymentId: 'dep-smollm2-msk',
      createdAt: isoHoursAgo(120),
      expiresAt: isoHoursAgo(-24 * 30),
      status: 'active',
    },
    {
      id: 'tok-support-chat',
      name: 'Support Chat',
      token: 'llmptk_demo_support_xxx',
      model: 'meta-llama/Llama-3.1-8B-Instruct',
      cluster: 'msk-1',
      deploymentId: 'dep-llama31-msk',
      createdAt: isoHoursAgo(80),
      expiresAt: isoHoursAgo(-24 * 20),
      status: 'active',
    },
    {
      id: 'tok-vision-ocr',
      name: 'Vision OCR',
      token: 'llmptk_demo_vision_xxx',
      model: 'HuggingFaceTB/SmolVLM2-2.2B-Instruct',
      cluster: 'msk-1',
      deploymentId: 'dep-smolvlm-msk',
      createdAt: isoHoursAgo(64),
      expiresAt: isoHoursAgo(-24 * 14),
      status: 'active',
    },
  ],
  users: [
    {
      id: 'user-admin',
      name: 'Igor Malysh',
      email: 'igor.malysh@hse-llm-project-2026.ru',
      role: 'admin',
      memberships: [{ teamId: 'Platform', role: 'owner' }],
      allowedClusters: [...DEMO_CLUSTER_IDS],
      createdAt: isoHoursAgo(24 * 120),
    },
    {
      id: 'user-ds',
      name: 'Anna Petrova',
      email: 'anna.petrova@hse-llm-project-2026.ru',
      role: 'developer',
      memberships: [{ teamId: 'Data Science', role: 'member' }],
      allowedClusters: ['msk-1', 'spb-1'],
      createdAt: isoHoursAgo(24 * 60),
    },
    {
      id: 'user-search',
      name: 'Maksim Sidorov',
      email: 'maksim.sidorov@hse-llm-project-2026.ru',
      role: 'manager',
      memberships: [{ teamId: 'Search', role: 'manager' }],
      allowedClusters: ['spb-1', 'ekb-1'],
      createdAt: isoHoursAgo(24 * 40),
    },
    {
      id: 'user-vision',
      name: 'Elena Krylova',
      email: 'elena.krylova@hse-llm-project-2026.ru',
      role: 'developer',
      memberships: [{ teamId: 'Vision', role: 'member' }],
      allowedClusters: ['msk-1'],
      createdAt: isoHoursAgo(24 * 25),
    },
    {
      id: 'user-fraud',
      name: 'Pavel Lebedev',
      email: 'pavel.lebedev@hse-llm-project-2026.ru',
      role: 'viewer',
      memberships: [{ teamId: 'Fraud', role: 'viewer' }],
      allowedClusters: ['ekb-1'],
      createdAt: isoHoursAgo(24 * 18),
    },
  ],
  permissions: [
    {
      id: 'deployments:read',
      category: 'Deployments',
      name: 'deployments:read',
      label: 'deployments:read',
      description: 'Read deployments and statuses',
    },
    {
      id: 'deployments:write',
      category: 'Deployments',
      name: 'deployments:write',
      label: 'deployments:write',
      description: 'Create and update deployments',
    },
    {
      id: 'releases:manage',
      category: 'Releases',
      name: 'releases:manage',
      label: 'releases:manage',
      description: 'Control canary releases',
    },
    {
      id: 'quotas:manage',
      category: 'Quotas',
      name: 'quotas:manage',
      label: 'quotas:manage',
      description: 'Create and update quotas',
    },
    {
      id: 'traffic_routes:manage',
      category: 'Traffic',
      name: 'traffic_routes:manage',
      label: 'traffic_routes:manage',
      description: 'Manage weighted traffic routes',
    },
    {
      id: 'costs:read',
      category: 'Costs',
      name: 'costs:read',
      label: 'costs:read',
      description: 'Read costs and energy telemetry',
    },
    {
      id: 'releases:read',
      category: 'Releases',
      name: 'releases:read',
      label: 'releases:read',
      description: 'Read release progress and events',
    },
    {
      id: 'audit:read',
      category: 'Audit',
      name: 'audit:read',
      label: 'audit:read',
      description: 'Access audit events',
    },
  ],
  modelRates: [
    {
      modelName: 'HuggingFaceTB/SmolLM2-1.7B-Instruct',
      inputPricePer1M: 11.8,
      outputPricePer1M: 14.4,
      wattsPerReplica: 340,
    },
    {
      modelName: 'Qwen/Qwen2.5-3B-Instruct',
      inputPricePer1M: 18.5,
      outputPricePer1M: 22.0,
      wattsPerReplica: 420,
    },
    {
      modelName: 'google/gemma-3-4b-it',
      inputPricePer1M: 20.0,
      outputPricePer1M: 24.5,
      wattsPerReplica: 450,
    },
    {
      modelName: 'HuggingFaceTB/SmolVLM2-2.2B-Instruct',
      inputPricePer1M: 24.0,
      outputPricePer1M: 28.0,
      wattsPerReplica: 480,
    },
    {
      modelName: 'meta-llama/Llama-3.1-8B-Instruct',
      inputPricePer1M: 29.0,
      outputPricePer1M: 34.5,
      wattsPerReplica: 560,
    },
    {
      modelName: 'mistralai/Mistral-7B-Instruct-v0.3',
      inputPricePer1M: 27.0,
      outputPricePer1M: 31.5,
      wattsPerReplica: 520,
    },
    {
      modelName: 'microsoft/Phi-4-mini-instruct',
      inputPricePer1M: 21.5,
      outputPricePer1M: 26.0,
      wattsPerReplica: 430,
    },
  ],
  electricityPriceKWh: 8.1,
};

function demoTeams(): Team[] {
  const teams = new Set<string>(['Platform']);
  demoState.users.forEach((user) => user.memberships.forEach((m) => teams.add(m.teamId)));
  demoState.deployments.forEach((dep) => teams.add(dep.team));
  return Array.from(teams).map((teamId) => ({
    id: teamId,
    name: teamId,
    memberCount: demoState.users.filter((user) =>
      user.memberships.some((membership) => membership.teamId === teamId)
    ).length,
    deploymentIds: demoState.deployments
      .filter((dep) => dep.team === teamId)
      .map((dep) => dep.id),
    allowedClusters: [...DEMO_CLUSTER_IDS],
  }));
}

function demoCostHistory(period: string, clusterId?: string): CostEntry[] {
  const points = period === '24h' ? 24 : period === '7d' ? 7 * 6 : 30 * 2;
  const stepHours = period === '24h' ? 1 : period === '7d' ? 4 : 12;
  const selectedDeployments = withSingleClusterFilter(
    demoState.deployments.map((dep) => ({ ...dep, clusterId: dep.clusterId })),
    clusterId
  );

  const result: CostEntry[] = [];
  for (let index = points - 1; index >= 0; index -= 1) {
    const ts = new Date(Date.now() - index * stepHours * 60 * 60 * 1000);
    selectedDeployments.forEach((dep, depIndex) => {
      const base = 16 + depIndex * 5;
      const wave = Math.sin((index + depIndex) * 0.7);
      const inferenceCost = Number((base + wave * 3).toFixed(3));
      const electricityCost = Number((base * 0.24 + wave).toFixed(3));
      const inputTokens = Math.max(1200, Math.round((base * 1300) + wave * 240));
      const outputTokens = Math.max(700, Math.round((base * 800) + wave * 180));
      result.push({
        id: `${dep.id}-${ts.getTime()}`,
        deploymentId: dep.id,
        modelName: dep.modelName,
        team: dep.team,
        product: dep.product,
        inputTokens,
        outputTokens,
        inferenceCost,
        electricityCost,
        energyKWh: Number((electricityCost / Math.max(demoState.electricityPriceKWh, 0.1)).toFixed(4)),
        clusterId: dep.clusterId,
        timestamp: ts.toISOString(),
        ownerId: dep.ownerId,
      });
    });
  }
  return result;
}

function demoEnergySeries(period: string, clusterId?: string): EnergyTimeSeries[] {
  const points = period === '24h' ? 48 : period === '7d' ? 84 : 120;
  const stepMinutes = period === '24h' ? 30 : period === '7d' ? 120 : 360;
  const filteredDeployments = withSingleClusterFilter(
    demoState.deployments.map((item) => ({ ...item, clusterId: item.clusterId })),
    clusterId
  );
  const basePower = 180 + filteredDeployments.length * 140;

  const series: EnergyTimeSeries[] = [];
  for (let idx = points - 1; idx >= 0; idx -= 1) {
    const timestamp = new Date(Date.now() - idx * stepMinutes * 60 * 1000);
    const drift = Math.sin(idx * 0.35) * 46 + Math.cos(idx * 0.12) * 25;
    const power = Math.max(90, Number((basePower + drift).toFixed(2)));
    const hours = stepMinutes / 60;
    const cost = Number(((power / 1000) * demoState.electricityPriceKWh * hours).toFixed(6));
    series.push({ timestamp: timestamp.toISOString(), power_watts: power, cost });
  }
  return series;
}

function mapDeploymentStatus(raw: string | null | undefined): DeploymentStatus {
  const value = String(raw ?? '').toLowerCase();
  if (value.includes('running') || value.includes('ready')) return 'running';
  if (value.includes('pull') || value.includes('load') || value.includes('validat') || value.includes('progress')) return 'pulling';
  if (value.includes('error') || value.includes('fail') || value.includes('admission') || value.includes('crash')) return 'failed';
  return 'pending';
}

function mapRealDeployment(item: DeploymentResponse): Deployment {
  return {
    id: String(item.id),
    modelName: String(item.model_name ?? 'unknown'),
    modelVersion: String(item.model_version ?? 'latest'),
    clusterId: String(item.cluster_id || REAL_CLUSTER_ID),
    backendClusterId: item.cluster_id || undefined,
    replicas: Number(item.replicas ?? 1),
    status: mapDeploymentStatus(item?.status?.status ?? item?.status?.phase ?? item?.status?.message),
    message: item?.status?.message ?? undefined,
    createdAt: String(item.created_at ?? new Date().toISOString()),
    team: String(item.team ?? 'unknown'),
    product: String(item.product ?? 'unknown'),
    ownerId: String(item.team ?? 'unknown'),
  };
}

export function mapRealtimeDeploymentLike(item: any): Deployment {
  return mapRealDeployment(item as DeploymentResponse);
}

function mapRealReleaseStatus(raw: string | null | undefined): Release['status'] {
  const normalized = String(raw ?? '').toLowerCase();
  if (normalized === 'rolled_back' || normalized === 'rolled-back') return 'rolled-back';
  if (normalized === 'completed' || normalized === 'succeeded') return 'succeeded';
  if (normalized === 'paused') return 'paused';
  if (normalized === 'failed' || normalized === 'cancelled') return 'failed';
  return 'rolling';
}

function toMetric(raw: Record<string, unknown> | null | undefined): ReleaseMetric {
  return {
    latencyP99: Number(raw?.p99_latency_ms ?? raw?.p95_latency_ms ?? 0),
    errorRate: Number(raw?.error_rate_percent ?? raw?.error_rate ?? 0),
    throughput: Number(raw?.throughput_rps ?? raw?.tokens_per_second ?? 0),
  };
}

function mapRealRelease(item: any): Release {
  const currentMetrics = toMetric(item?.latest_metrics ?? {});
  const sourceMetrics = toMetric(item?.baseline_metrics ?? item?.latest_metrics ?? {});
  const rawSteps = Array.isArray(item?.steps) ? item.steps : [];
  const rawEvents = Array.isArray(item?.events) ? item.events : [];

  const steps: ReleaseStep[] = rawSteps.map((step: any) => ({
    percent: Number(step?.target_percent ?? step?.percent ?? 0),
    timestamp: typeof step?.applied_at === 'string' ? step.applied_at : step?.timestamp,
    status:
      String(step?.status ?? '').toLowerCase() === 'completed'
        ? 'completed'
        : String(step?.status ?? '').toLowerCase() === 'pending'
          ? 'pending'
          : 'active',
    metrics: toMetric(step?.metrics ?? {}),
  }));

  const events: ReleaseEvent[] = rawEvents.map((event: any) => {
    const eventType = String(event?.event_type ?? event?.type ?? 'info').toLowerCase();
    return {
      timestamp: String(event?.created_at ?? event?.timestamp ?? item?.updated_at ?? item?.created_at ?? new Date().toISOString()),
      type:
        eventType.includes('error') || eventType.includes('rollback')
          ? 'error'
          : eventType.includes('warning') || eventType.includes('slo')
            ? 'warning'
            : eventType.includes('manual') || eventType.includes('action')
              ? 'action'
              : 'info',
      message: String(event?.message ?? event?.event_type ?? 'Release event'),
    };
  });

  return {
    id: String(item.id),
    name: String(item.route_alias ?? item.id),
    sourceId: String(item.source_deployment_id ?? ''),
    targetId: String(item.target_deployment_id ?? ''),
    routeId: String(item.route_alias ?? ''),
    strategy: 'canary',
    status: mapRealReleaseStatus(item?.status),
    currentPercent: Number(item?.current_percent ?? 0),
    targetPercent: Number(item?.strategy?.target_percent ?? item?.target_percent ?? 100),
    sloHealthy: !Boolean(item?.rollback_reason),
    currentMetrics,
    sourceMetrics,
    createdAt: String(item?.created_at ?? new Date().toISOString()),
    type: 'standard',
    sourceCluster: REAL_CLUSTER_ID,
    targetCluster: REAL_CLUSTER_ID,
    steps,
    events,
  };
}

export function mapRealtimeReleaseLike(item: any): Release {
  return mapRealRelease(item);
}

function mapQuotaStatus(quota: QuotaResponse): Quota['status'] {
  if (quota.status === 'exceeded') {
    return quota.action === 'throttle' ? 'throttled' : 'blocked';
  }
  if (quota.status === 'disabled') {
    return 'blocked';
  }
  return 'active';
}

function mapQuota(item: QuotaResponse): Quota {
  return {
    id: String(item.id),
    subjectType: item.subject_type,
    subjectId: item.subject_key,
    subjectName: item.display_name || item.subject_key,
    model: 'all',
    limitValue: Number(item.limit_value ?? 0),
    limitUnit: item.unit,
    period: item.period,
    action: item.action,
    priority: Number(item.priority ?? 0),
    usageValue: Number(item.current_value ?? 0),
    usageCost: 0,
    status: mapQuotaStatus(item),
    clusterId: REAL_CLUSTER_ID,
  };
}

function mapModelRate(item: FinopsModelRate): ModelRate {
  return {
    modelName: String(item.modelName),
    inputPricePer1M: Number(item.inputPricePer1M ?? 0),
    outputPricePer1M: Number(item.outputPricePer1M ?? 0),
    wattsPerReplica: Number(item.wattsPerReplica ?? 0),
  };
}

function mapCostEntry(item: FinopsCostEntry & Record<string, unknown>): CostEntry {
  const totalCost = Number(item.cost ?? item.inferenceCost ?? 0);
  const electricityCost = Number(item.electricityCost ?? 0);
  const inferenceCost = Number(item.inferenceCost ?? Math.max(totalCost - electricityCost, 0));

  return {
    id: String(item.id),
    deploymentId: String(item.deploymentId ?? item.deployment_id ?? 'unknown'),
    modelName: String(item.modelName ?? item.model_name ?? 'unknown'),
    team: String(item.team ?? 'unknown'),
    product: String(item.product ?? 'unknown'),
    inputTokens: Number(item.inputTokens ?? item.prompt_tokens ?? 0),
    outputTokens: Number(item.outputTokens ?? item.completion_tokens ?? 0),
    inferenceCost,
    electricityCost,
    energyKWh: Number(item.energyKWh ?? item.energy_kwh_period ?? 0),
    clusterId: String(item.clusterId ?? item.cluster_id ?? REAL_CLUSTER_ID),
    timestamp: String(item.timestamp ?? new Date().toISOString()),
    ownerId: String(item.ownerId ?? item.team ?? 'unknown'),
  };
}

function mapToken(item: InferenceApiTokenInfo | InferenceApiTokenCreateResponse): TechnicalToken {
  const now = Date.now();
  const expiresAtMs = Date.parse(String(item.expires_at));
  const revoked = Boolean(item.revoked_at);
  const expired = Number.isFinite(expiresAtMs) && expiresAtMs < now;

  tokenToDeployment.set(String(item.id), String(item.deployment_id));

  return {
    id: String(item.id),
    name: item.description ?? item.token_prefix,
    token: 'token' in item ? String(item.token) : `${item.token_prefix}***`,
    model: String(item.crd_name ?? item.deployment_ref ?? item.deployment_id),
    cluster: REAL_CLUSTER_ID,
    deploymentId: String(item.deployment_id),
    createdAt: String(item.created_at),
    expiresAt: String(item.expires_at),
    status: revoked ? 'revoked' : expired ? 'expired' : 'active',
  };
}

function mapUserRole(role: string | null | undefined): PlatformRole {
  const normalized = String(role || '').toLowerCase();
  if (normalized === 'admin') return 'admin';
  if (normalized === 'manager') return 'manager';
  if (normalized === 'developer') return 'developer';
  return 'viewer';
}

function mapTeamRoleForUserRole(role: PlatformRole): TeamRole {
  if (role === 'admin') return 'owner';
  if (role === 'manager') return 'manager';
  if (role === 'developer') return 'member';
  return 'viewer';
}

function mapUser(item: UserResponse): User {
  const role = mapUserRole(item.role);
  const memberships: UserTeamMembership[] = item.team
    ? [{ teamId: item.team, role: mapTeamRoleForUserRole(role) }]
    : [];

  return {
    id: String(item.id),
    name: String(item.name?.trim() || item.email || item.id),
    email: String(item.email),
    role,
    memberships,
    allowedClusters: [REAL_CLUSTER_ID],
    createdAt: String(item.created_at ?? new Date().toISOString()),
  };
}

function mapNode(clusterId: string, item: NodeSummary): ClusterNode {
  const allocGpu = Number(item.gpu?.count ?? 0);
  const usedGpu = Number(item.gpu?.requestedCount ?? 0);
  return {
    id: `${clusterId}:${item.name}`,
    name: item.name,
    clusterId,
    type: allocGpu > 0 ? 'gpu' : 'cpu',
    gpuModel: item.gpu?.model ?? undefined,
    allocatable: {
      cpu: Number(item.cpuAllocatableCores ?? 0),
      ram: Number(item.ramAllocatableGi ?? 0),
      gpu: allocGpu,
    },
    used: {
      cpu: Number(item.cpuRequestedCores ?? item.cpuActualCores ?? 0),
      ram: Number(item.ramRequestedGi ?? item.ramActualGi ?? 0),
      gpu: usedGpu,
    },
    deployments: Array.isArray(item.runningDeployments) ? item.runningDeployments : [],
    isDeployable: String(item.canDeploy || '').toLowerCase().includes('yes'),
    status: item.status === 'Ready' ? 'ready' : 'not-ready',
  };
}

function withSingleClusterFilter<T extends { clusterId?: string }>(
  data: T[],
  clusterId?: string
): T[] {
  if (!clusterId || clusterId === 'all') return data;
  if (DEMO_MODE) {
    return data.filter((item) => item.clusterId === clusterId);
  }
  if (clusterId !== REAL_CLUSTER_ID) return [];
  return data;
}

function demoNowIso(): string {
  return new Date().toISOString();
}

function demoId(prefix: string): string {
  const randomPart = Math.random().toString(36).slice(2, 8);
  return `${prefix}-${Date.now().toString(36)}-${randomPart}`;
}

function demoRouteMatchesCluster(route: TrafficRoute, clusterId?: string): boolean {
  if (!clusterId || clusterId === 'all') return true;
  return route.backends.some((backend) => backend.clusterId === clusterId);
}

function demoReleaseMatchesCluster(release: Release, clusterId?: string): boolean {
  if (!clusterId || clusterId === 'all') return true;
  if (release.sourceCluster === clusterId || release.targetCluster === clusterId) return true;
  const sourceDeployment = demoState.deployments.find((item) => item.id === release.sourceId);
  const targetDeployment = demoState.deployments.find((item) => item.id === release.targetId);
  return sourceDeployment?.clusterId === clusterId || targetDeployment?.clusterId === clusterId;
}

function demoQuotaStatusFromUsage(usageValue: number, limitValue: number, action: Quota['action']): Quota['status'] {
  if (limitValue <= 0) return 'blocked';
  if (usageValue >= limitValue) {
    return action === 'throttle' ? 'throttled' : 'blocked';
  }
  return 'active';
}

function buildDemoCostSummary(clusterId?: string): CostSummary {
  const history = demoCostHistory('24h', clusterId);
  const totalCost = history.reduce((acc, item) => acc + item.inferenceCost + item.electricityCost, 0);
  const inferenceCost = history.reduce((acc, item) => acc + item.inferenceCost, 0);
  const energyCost = history.reduce((acc, item) => acc + item.electricityCost, 0);
  const totalTokens = history.reduce((acc, item) => acc + item.inputTokens + item.outputTokens, 0);
  const requestsApprox = Math.max(1, history.length * 28);

  const byDate = new Map<string, number>();
  history.forEach((item) => {
    const key = new Date(item.timestamp).toISOString().slice(0, 10);
    const current = byDate.get(key) || 0;
    byDate.set(key, current + item.inferenceCost + item.electricityCost);
  });
  const chartData = Array.from(byDate.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([date, cost]) => ({
      date,
      cost: Number(cost.toFixed(3)),
    }));

  return {
    totalCost: Number(totalCost.toFixed(3)),
    inferenceCost: Number(inferenceCost.toFixed(3)),
    energyCost: Number(energyCost.toFixed(3)),
    totalTokens,
    chartData,
    avgCostPerRequest: Number((totalCost / requestsApprox).toFixed(6)),
  };
}

function pushDemoReleaseEvent(
  release: Release,
  type: ReleaseEvent['type'],
  message: string
): void {
  release.events.unshift({
    timestamp: demoNowIso(),
    type,
    message,
  });
}

export async function getDeployments(clusterId?: string): Promise<Deployment[]> {
  if (DEMO_MODE) {
    return deepClone(withSingleClusterFilter(demoState.deployments, clusterId));
  }
  if (clusterId && clusterId !== 'all' && clusterId !== REAL_CLUSTER_ID) {
    return [];
  }
  const deployments = await getDeploymentsRequest();
  return deployments.map(mapRealDeployment);
}

export async function getDeployment(id: string): Promise<Deployment | undefined> {
  if (DEMO_MODE) {
    const found = demoState.deployments.find((item) => item.id === id);
    return found ? deepClone(found) : undefined;
  }
  const deployment = await getDeploymentRequest(id);
  return mapRealDeployment(deployment);
}

export async function createDeployment(data: any): Promise<Deployment> {
  if (DEMO_MODE) {
    const clusterGroups = Array.isArray(data?.clusterGroups)
      ? data.clusterGroups
          .map((group: any) => ({
            clusterId: String(group?.clusterId || ''),
            replicas: Math.max(1, Number(group?.replicas ?? 1)),
            status: 'pending' as const,
            progress: 0,
            message: 'Preparing node allocation',
          }))
          .filter((group: ClusterGroup) => group.clusterId)
      : [];

    const created: Deployment = {
      id: demoId('dep'),
      modelName: String(data?.modelName || data?.model_name || 'Unknown Model'),
      modelVersion: String(data?.modelVersion || data?.model_version || 'latest'),
      clusterId:
        String(data?.clusterId || data?.cluster_id || '').trim() ||
        clusterGroups[0]?.clusterId ||
        DEMO_CLUSTER_IDS[0],
      replicas: Math.max(1, Number(data?.replicas ?? 1)),
      status: 'pulling',
      message: 'Pulling model artifacts',
      createdAt: demoNowIso(),
      team: String(data?.team || 'Platform'),
      product: String(data?.product || 'Demo Workload'),
      ownerId: String(data?.team || 'Platform'),
      isMultiCluster: Boolean(data?.isMultiCluster) || clusterGroups.length > 1,
      clusterGroups: clusterGroups.length > 0 ? clusterGroups : undefined,
    };

    demoState.deployments.unshift(created);
    return deepClone(created);
  }

  const mode = String(data?.mode || data?.inference?.mode || 'gpu').toLowerCase() === 'cpu' ? 'cpu' : 'gpu';
  const payload = {
    model_name: String(data?.modelName || data?.model_name),
    model_version: String(data?.modelVersion || data?.model_version || 'latest'),
    cluster_id: String(data?.clusterId || data?.cluster_id || REAL_CLUSTER_ID),
    replicas: Math.max(1, Number(data?.replicas ?? 1)),
    team: String(data?.team || 'default-team'),
    product: String(data?.product || 'default-product'),
    inference: {
      max_tokens: Number(data?.inference?.max_tokens ?? data?.max_tokens ?? 256),
      dtype: String(data?.inference?.dtype || data?.dtype || 'auto'),
      mode,
      gpu_memory_utilization: mode === 'gpu' ? Number(data?.inference?.gpu_memory_utilization ?? 0.9) : null,
      cpu_request: mode === 'cpu' ? String(data?.inference?.cpu_request || '2') : null,
      cpu_limit: mode === 'cpu' ? String(data?.inference?.cpu_limit || '4') : null,
    },
    validation:
      data?.validation === true
        ? {
            enabled: true,
            slo_config_name: data?.sloConfig ? String(data.sloConfig) : null,
          }
        : null,
  };

  const created = await createDeploymentRequest(payload);
  return mapRealDeployment(created);
}

export async function deleteDeployment(id: string): Promise<void> {
  if (DEMO_MODE) {
    demoState.deployments = demoState.deployments.filter((item) => item.id !== id);
    demoState.tokens = demoState.tokens.filter((item) => item.deploymentId !== id);
    demoState.routes = demoState.routes.map((route) => ({
      ...route,
      backends: route.backends.filter((backend) => backend.deploymentId !== id),
    }));
    demoState.releases = demoState.releases.filter(
      (release) => release.sourceId !== id && release.targetId !== id
    );
    return;
  }
  await deleteDeploymentRequest(id);
}

export async function getModelRates(): Promise<ModelRate[]> {
  if (DEMO_MODE) {
    return deepClone(demoState.modelRates);
  }
  const rates = await getModelRatesRequest();
  return rates.map(mapModelRate);
}

export async function getElectricityPrice(): Promise<number> {
  if (DEMO_MODE) {
    return demoState.electricityPriceKWh;
  }
  return getElectricityPriceRequest();
}

export async function getPlatformRates(): Promise<PlatformRates> {
  if (DEMO_MODE) {
    return { electricityPriceKWh: demoState.electricityPriceKWh };
  }
  return { electricityPriceKWh: await getElectricityPriceRequest() };
}

export async function getCostHistory(period: string, clusterId?: string): Promise<CostEntry[]> {
  if (DEMO_MODE) {
    return deepClone(demoCostHistory(period, clusterId));
  }
  const history = await getCostHistoryRequest();
  const mapped = history.map((item) => mapCostEntry(item as FinopsCostEntry & Record<string, unknown>));

  const inPeriod = mapped.filter((entry) => {
    const ts = Date.parse(entry.timestamp);
    if (!Number.isFinite(ts)) return true;
    const now = Date.now();
    const lookback = period === '24h' ? 24 * 60 * 60 * 1000 : period === '7d' ? 7 * 24 * 60 * 60 * 1000 : 30 * 24 * 60 * 60 * 1000;
    return ts >= now - lookback;
  });

  return withSingleClusterFilter(inPeriod, clusterId).filter((entry) => entry.clusterId === REAL_CLUSTER_ID);
}

export async function getEnergyHistory(period: string, clusterId?: string): Promise<EnergyTimeSeries[]> {
  if (DEMO_MODE) {
    return deepClone(demoEnergySeries(period, clusterId));
  }
  if (clusterId && clusterId !== 'all' && clusterId !== REAL_CLUSTER_ID) {
    return [];
  }
  return getEnergyHistoryRequest(period);
}

export async function getCostSummary(clusterId?: string): Promise<CostSummary> {
  if (DEMO_MODE) {
    return buildDemoCostSummary(clusterId);
  }
  if (clusterId && clusterId !== 'all' && clusterId !== REAL_CLUSTER_ID) {
    return {
      totalCost: 0,
      inferenceCost: 0,
      energyCost: 0,
      totalTokens: 0,
      chartData: [],
      avgCostPerRequest: 0,
    };
  }
  return getCostSummaryRequest();
}

export async function updateModelRate(
  modelName: string,
  inputPrice: number,
  outputPrice: number,
  watts: number
): Promise<void> {
  if (DEMO_MODE) {
    const normalizedName = String(modelName).trim();
    const existing = demoState.modelRates.find((item) => item.modelName === normalizedName);
    if (existing) {
      existing.inputPricePer1M = Number(inputPrice);
      existing.outputPricePer1M = Number(outputPrice);
      existing.wattsPerReplica = Number(watts);
    } else {
      demoState.modelRates.push({
        modelName: normalizedName,
        inputPricePer1M: Number(inputPrice),
        outputPricePer1M: Number(outputPrice),
        wattsPerReplica: Number(watts),
      });
    }
    return;
  }
  await updateModelRateRequest(modelName, inputPrice, outputPrice, watts);
}

export async function updateElectricityPrice(price: number): Promise<void> {
  if (DEMO_MODE) {
    demoState.electricityPriceKWh = Number(price);
    return;
  }
  await updateElectricityPriceRequest(price);
}

export async function getReleases(clusterId?: string): Promise<Release[]> {
  if (DEMO_MODE) {
    return deepClone(demoState.releases.filter((release) => demoReleaseMatchesCluster(release, clusterId)));
  }
  if (clusterId && clusterId !== 'all' && clusterId !== REAL_CLUSTER_ID) {
    return [];
  }
  const releases = await listReleasesRequest({ includeHistory: true });
  return releases.map(mapRealRelease);
}

export async function pauseRelease(id: string): Promise<void> {
  if (DEMO_MODE) {
    const release = demoState.releases.find((item) => item.id === id);
    if (!release) return;
    release.status = 'paused';
    pushDemoReleaseEvent(release, 'action', 'Release paused manually');
    return;
  }
  await pauseReleaseRequest(id);
}

export async function resumeRelease(id: string): Promise<void> {
  if (DEMO_MODE) {
    const release = demoState.releases.find((item) => item.id === id);
    if (!release) return;
    release.status = 'rolling';
    pushDemoReleaseEvent(release, 'action', 'Release resumed');
    return;
  }
  await resumeReleaseRequest(id);
}

export async function rollbackRelease(id: string): Promise<void> {
  if (DEMO_MODE) {
    const release = demoState.releases.find((item) => item.id === id);
    if (!release) return;
    release.status = 'rolled-back';
    release.currentPercent = 0;
    release.steps = release.steps.map((step) => ({
      ...step,
      status: step.percent === 0 ? 'active' : step.status,
    }));
    pushDemoReleaseEvent(release, 'error', 'Rollback executed');
    return;
  }
  await rollbackReleaseRequest(id);
}

export async function skipReleaseTo100(id: string): Promise<void> {
  if (DEMO_MODE) {
    const release = demoState.releases.find((item) => item.id === id);
    if (!release) return;
    release.status = 'succeeded';
    release.currentPercent = 100;
    release.steps = release.steps.map((step) => ({
      ...step,
      status: step.percent <= 100 ? 'completed' : step.status,
      timestamp: step.timestamp || demoNowIso(),
    }));
    pushDemoReleaseEvent(release, 'action', 'Release jumped to 100%');
    return;
  }
  await skipReleaseTo100Request(id);
}

export async function deleteRelease(id: string): Promise<void> {
  if (DEMO_MODE) {
    demoState.releases = demoState.releases.filter((release) => release.id !== id);
    return;
  }
  throw new Error('Удаление релиза не поддерживается backend API.');
}

export async function retryRelease(id: string): Promise<void> {
  if (DEMO_MODE) {
    const release = demoState.releases.find((item) => item.id === id);
    if (!release) {
      throw new Error('Release not found.');
    }
    const cloned: Release = {
      ...deepClone(release),
      id: demoId('rel'),
      status: 'rolling',
      currentPercent: 5,
      createdAt: demoNowIso(),
      steps: [
        { percent: 5, status: 'active', timestamp: demoNowIso() },
        { percent: 20, status: 'pending' },
        { percent: 35, status: 'pending' },
        { percent: 50, status: 'pending' },
        { percent: 100, status: 'pending' },
      ],
      events: [
        {
          timestamp: demoNowIso(),
          type: 'action',
          message: `Retry created from ${release.id}`,
        },
      ],
    };
    demoState.releases.unshift(cloned);
    return;
  }
  const release = await getReleaseRequest(id);
  await createReleaseRequest({
    route_alias: release.route_alias,
    target_deployment_id: release.target_deployment_id,
    strategy: release.strategy,
    slo: release.slo,
  });
}

export async function startRelease(data: any): Promise<Release> {
  const routeAlias = String(data?.routeId || data?.route_alias || '').trim();
  const targetId = String(data?.targetId || data?.target_deployment_id || '').trim();
  if (!routeAlias) {
    throw new Error('routeId is required.');
  }
  if (!targetId) {
    throw new Error('targetId is required.');
  }

  if (DEMO_MODE) {
    const route = demoState.routes.find((item) => item.id === routeAlias || item.name === routeAlias);
    const targetDeployment = demoState.deployments.find((item) => item.id === targetId);
    if (!targetDeployment) {
      throw new Error(`Target deployment '${targetId}' not found.`);
    }
    const sourceBackend =
      route?.backends
        .slice()
        .sort((left, right) => right.weight - left.weight)
        .find((backend) => backend.deploymentId !== targetId) || route?.backends[0];
    const sourceDeployment = sourceBackend
      ? demoState.deployments.find((item) => item.id === sourceBackend.deploymentId)
      : undefined;

    const created: Release = {
      id: demoId('rel'),
      name: routeAlias,
      sourceId: sourceDeployment?.id || '',
      targetId: targetDeployment.id,
      routeId: routeAlias,
      strategy: 'canary',
      status: 'rolling',
      currentPercent: 5,
      targetPercent: Number(data?.targetPercent ?? 100),
      sloHealthy: true,
      currentMetrics: { latencyP99: 680, errorRate: 0.18, throughput: 94 },
      sourceMetrics: { latencyP99: 720, errorRate: 0.25, throughput: 82 },
      createdAt: demoNowIso(),
      type: 'standard',
      sourceCluster: sourceDeployment?.clusterId || targetDeployment.clusterId,
      targetCluster: targetDeployment.clusterId,
      steps: [
        { percent: 5, status: 'active', timestamp: demoNowIso() },
        { percent: 20, status: 'pending' },
        { percent: 35, status: 'pending' },
        { percent: 50, status: 'pending' },
        { percent: 100, status: 'pending' },
      ],
      events: [
        {
          timestamp: demoNowIso(),
          type: 'info',
          message: `Release created for route ${routeAlias}`,
        },
      ],
    };

    if (route) {
      route.backends = route.backends.map((backend) => {
        if (backend.deploymentId === targetId) {
          return { ...backend, weight: 5 };
        }
        return { ...backend, weight: Math.max(0, backend.weight - 5) };
      });
      if (!route.backends.some((backend) => backend.deploymentId === targetId)) {
        route.backends.push({
          deploymentId: targetId,
          clusterId: targetDeployment.clusterId,
          weight: 5,
        });
      }
    }

    demoState.releases.unshift(created);
    return deepClone(created);
  }

  const mode = String(data?.strategy || '').toLowerCase() === 'instant' ? 'instant' : 'step';
  const strategy =
    mode === 'instant'
      ? { mode: 'instant' as const }
      : {
          mode: 'step' as const,
          start_percent: Number(data?.startPercent ?? 5),
          step_percent: Number(data?.stepPercent ?? 15),
          interval_seconds: Number(data?.intervalSeconds ?? 300),
          target_percent: Number(data?.targetPercent ?? 100),
        };

  const hasLatencySlo = Object.prototype.hasOwnProperty.call(data || {}, 'sloLatency');
  const hasErrorSlo = Object.prototype.hasOwnProperty.call(data || {}, 'sloErrors');
  const slo =
    hasLatencySlo || hasErrorSlo
      ? {
          max_p95_latency_ms: hasLatencySlo ? Number(data?.sloLatency ?? 0) || null : null,
          max_error_rate: hasErrorSlo ? Number(data?.sloErrors ?? 0) || null : null,
        }
      : null;

  const created = await createReleaseRequest({
    route_alias: routeAlias,
    target_deployment_id: targetId,
    strategy,
    slo,
  });
  return mapRealRelease(created);
}

export async function getQuotas(clusterId?: string): Promise<Quota[]> {
  if (DEMO_MODE) {
    return deepClone(withSingleClusterFilter(demoState.quotas, clusterId));
  }
  if (clusterId && clusterId !== 'all' && clusterId !== REAL_CLUSTER_ID) {
    return [];
  }
  const quotas = await listQuotasRequest();
  return quotas.map(mapQuota);
}

export async function createQuota(data: any): Promise<Quota> {
  if (DEMO_MODE) {
    const subjectId = String(data?.subjectId || '').trim();
    const subjectName = String(data?.subjectName || subjectId || 'Team');
    const limitValue = Math.max(1, Number(data?.limitValue ?? 1_000_000));
    const action = String(data?.action || 'block') as Quota['action'];
    const usageValue = Math.round(limitValue * 0.37);
    const created: Quota = {
      id: demoId('quota'),
      subjectType: 'team',
      subjectId,
      subjectName,
      model: String(data?.model || 'all'),
      limitValue,
      limitUnit: data?.limitUnit === 'requests' ? 'requests' : 'tokens',
      period: data?.period === 'hour' || data?.period === 'day' ? data.period : 'month',
      action: action === 'throttle' || action === 'warn' ? action : 'block',
      priority: Math.max(1, Number(data?.priority ?? 5)),
      usageValue,
      usageCost: 0,
      status: demoQuotaStatusFromUsage(usageValue, limitValue, action),
      clusterId: String(data?.clusterId || REAL_CLUSTER_ID),
    };
    demoState.quotas.unshift(created);
    return deepClone(created);
  }
  const created = await createQuotaRequest({
    subject_type: data.subjectType,
    subject_key: data.subjectId,
    display_name: data.subjectName || data.subjectId,
    team: data.subjectType === 'team' ? data.subjectId : null,
    limit_value: Number(data.limitValue),
    unit: data.limitUnit,
    period: data.period,
    action: data.action,
    priority: Number(data.priority ?? 1),
    enabled: true,
    warning_threshold_percent: 85,
  });
  return mapQuota(created);
}

export async function updateQuota(id: string, data: any): Promise<Quota> {
  if (DEMO_MODE) {
    const quota = demoState.quotas.find((item) => item.id === id);
    if (!quota) {
      throw new Error(`Quota '${id}' not found.`);
    }
    quota.subjectType = 'team';
    quota.subjectId = String(data?.subjectId || quota.subjectId);
    quota.subjectName = String(data?.subjectName || quota.subjectName);
    quota.model = String(data?.model || quota.model);
    quota.limitValue = Math.max(1, Number(data?.limitValue ?? quota.limitValue));
    quota.limitUnit = data?.limitUnit === 'requests' ? 'requests' : 'tokens';
    quota.period = data?.period === 'hour' || data?.period === 'day' ? data.period : 'month';
    quota.action =
      data?.action === 'throttle' || data?.action === 'warn' || data?.action === 'block'
        ? data.action
        : quota.action;
    quota.priority = Math.max(1, Number(data?.priority ?? quota.priority));
    quota.clusterId = String(data?.clusterId || quota.clusterId);
    quota.status = demoQuotaStatusFromUsage(quota.usageValue, quota.limitValue, quota.action);
    return deepClone(quota);
  }
  const updated = await updateQuotaRequest(id, {
    subject_type: data.subjectType,
    subject_key: data.subjectId,
    display_name: data.subjectName || data.subjectId,
    team: data.subjectType === 'team' ? data.subjectId : null,
    limit_value: Number(data.limitValue),
    unit: data.limitUnit,
    period: data.period,
    action: data.action,
    priority: Number(data.priority ?? 1),
    enabled: true,
    warning_threshold_percent: 85,
  });
  return mapQuota(updated);
}

export async function deleteQuota(id: string): Promise<boolean> {
  if (DEMO_MODE) {
    const before = demoState.quotas.length;
    demoState.quotas = demoState.quotas.filter((item) => item.id !== id);
    return demoState.quotas.length !== before;
  }
  await deleteQuotaRequest(id);
  return true;
}

export async function getTokens(deploymentId?: string): Promise<TechnicalToken[]> {
  if (DEMO_MODE) {
    const source = deploymentId
      ? demoState.tokens.filter((token) => token.deploymentId === deploymentId)
      : demoState.tokens;
    return deepClone(source);
  }
  if (deploymentId) {
    const tokens = await listDeploymentInferenceTokens(deploymentId);
    return tokens.map(mapToken);
  }

  const deployments = await getDeploymentsRequest();
  const tokensByDeployment = await Promise.all(
    deployments.map(async (dep) => {
      try {
        const tokens = await listDeploymentInferenceTokens(dep.id);
        return tokens.map(mapToken);
      } catch {
        return [] as TechnicalToken[];
      }
    })
  );

  return tokensByDeployment.flat();
}

export async function createToken(data: {
  name?: string;
  model: string;
  cluster: string;
  deploymentId: string;
  expiresInDays: number;
}): Promise<TechnicalToken> {
  if (DEMO_MODE) {
    if (!data.deploymentId) {
      throw new Error('deploymentId is required to create technical token.');
    }
    const deployment = demoState.deployments.find((item) => item.id === data.deploymentId);
    if (!deployment) {
      throw new Error(`Deployment '${data.deploymentId}' not found.`);
    }
    const createdAt = demoNowIso();
    const expiresAt = new Date(
      Date.now() + Math.max(1, Number(data.expiresInDays || 1)) * 24 * 60 * 60 * 1000
    ).toISOString();
    const token: TechnicalToken = {
      id: demoId('tok'),
      name: data.name?.trim() || deployment.modelName,
      token: `llmptk_demo_${Math.random().toString(36).slice(2, 14)}`,
      model: deployment.modelName,
      cluster: deployment.clusterId,
      deploymentId: deployment.id,
      createdAt,
      expiresAt,
      status: 'active',
    };
    demoState.tokens.unshift(token);
    return deepClone(token);
  }
  if (!data.deploymentId) {
    throw new Error('deploymentId is required to create technical token.');
  }

  const created = await createDeploymentInferenceToken(data.deploymentId, {
    description: data.name?.trim() || null,
    ttl_minutes: Math.max(60, Math.round(data.expiresInDays * 24 * 60)),
  });
  return mapToken(created);
}

async function resolveTokenDeploymentId(tokenId: string): Promise<string> {
  const cached = tokenToDeployment.get(tokenId);
  if (cached) return cached;

  const allTokens = await getTokens();
  const found = allTokens.find((token) => token.id === tokenId);
  if (!found) {
    throw new Error('Token not found.');
  }
  tokenToDeployment.set(tokenId, found.deploymentId);
  return found.deploymentId;
}

export async function revokeToken(id: string): Promise<void> {
  if (DEMO_MODE) {
    const token = demoState.tokens.find((item) => item.id === id);
    if (!token) return;
    token.status = 'revoked';
    return;
  }
  const deploymentId = await resolveTokenDeploymentId(id);
  await revokeDeploymentInferenceToken(deploymentId, id);
}

export async function deleteToken(id: string): Promise<void> {
  if (DEMO_MODE) {
    demoState.tokens = demoState.tokens.filter((item) => item.id !== id);
    return;
  }
  await revokeToken(id);
}

export async function getNodes(clusterId?: string): Promise<ClusterNode[]> {
  if (clusterId && clusterId !== 'all') {
    const nodes = await getClusterNodes(clusterId);
    return nodes.map((node) => mapNode(clusterId, node));
  }

  const clusters = await getClusters();
  const targetClusters =
    clusterId && clusterId !== 'all'
      ? clusters.filter((cluster) => cluster.id === clusterId)
      : clusters;

  const nodesByCluster = await Promise.all(
    targetClusters.map(async (cluster) => {
      const nodes = await getClusterNodes(cluster.id);
      return nodes.map((node) => mapNode(cluster.id, node));
    })
  );

  return nodesByCluster.flat();
}

export async function getUsers(): Promise<User[]> {
  if (DEMO_MODE) {
    return deepClone(demoState.users);
  }
  const users = await listSecurityUsers();
  return users.map(mapUser);
}

export async function getTeams(): Promise<Team[]> {
  if (DEMO_MODE) {
    return deepClone(demoTeams());
  }
  const [teams, users, deployments] = await Promise.all([
    listSecurityTeams(),
    listSecurityUsers(),
    getDeploymentsRequest(),
  ]);

  const deploymentsByTeam = new Map<string, string[]>();
  deployments.forEach((deployment) => {
    const team = String(deployment.team || '').trim();
    if (!team) return;
    const list = deploymentsByTeam.get(team) || [];
    list.push(deployment.id);
    deploymentsByTeam.set(team, list);
  });

  const memberCountByTeam = new Map<string, number>();
  users.forEach((user) => {
    const team = String(user.team || '').trim();
    if (!team) return;
    memberCountByTeam.set(team, (memberCountByTeam.get(team) || 0) + 1);
  });

  const mapped = teams.map((team: TeamResponse) => {
    const name = String(team.team);
    return {
      id: name,
      name,
      memberCount: memberCountByTeam.get(name) || 0,
      deploymentIds: deploymentsByTeam.get(name) || [],
      allowedClusters: [REAL_CLUSTER_ID],
    };
  });

  return mapped;
}

export async function getPermissions(): Promise<Permission[]> {
  if (DEMO_MODE) {
    return deepClone(demoState.permissions);
  }
  const roles = await listProjectRoles();
  const dedup = new Map<string, Permission>();

  roles.forEach((role) => {
    const desc = role.description?.trim() || `Scope from role ${role.role_name}`;
    role.scopes.forEach((scope) => {
      const normalizedScope = String(scope).trim();
      if (!normalizedScope || dedup.has(normalizedScope)) return;
      const categorySource = normalizedScope.split(/[.:]/)[0] || 'general';
      const category = `${categorySource.charAt(0).toUpperCase()}${categorySource.slice(1)}`;

      dedup.set(normalizedScope, {
        id: normalizedScope,
        category,
        name: normalizedScope,
        label: normalizedScope,
        description: desc,
      });
    });
  });

  return Array.from(dedup.values());
}

export async function getTrafficRoutes(clusterId?: string): Promise<TrafficRoute[]> {
  if (DEMO_MODE) {
    return deepClone(demoState.routes.filter((route) => demoRouteMatchesCluster(route, clusterId)));
  }
  if (clusterId && clusterId !== 'all' && clusterId !== REAL_CLUSTER_ID) {
    return [];
  }
  const routes = await listTrafficRoutesRequest();
  return routes.map((route) => ({
    id: route.alias,
    name: route.alias,
    backends: (route.backends || []).map((backend) => ({
      deploymentId: backend.deployment_id,
      clusterId: REAL_CLUSTER_ID,
      weight: Number(backend.weight ?? 0),
    })),
    status: route.status,
    statusReason: route.status_reason,
  }));
}

export async function createTrafficRoute(payload: {
  name: string;
  backends: RouteBackend[];
}): Promise<TrafficRoute> {
  if (DEMO_MODE) {
    const created: TrafficRoute = {
      id: payload.name,
      name: payload.name,
      backends: payload.backends.map((backend) => ({
        deploymentId: backend.deploymentId,
        clusterId:
          backend.clusterId ||
          demoState.deployments.find((item) => item.id === backend.deploymentId)?.clusterId ||
          DEMO_CLUSTER_IDS[0],
        weight: Math.max(0, Number(backend.weight || 0)),
      })),
      status: 'active',
      statusReason: null,
    };
    demoState.routes = demoState.routes.filter((item) => item.id !== created.id);
    demoState.routes.unshift(created);
    return deepClone(created);
  }
  const created = await createTrafficRouteRequest({
    alias: payload.name,
    backends: payload.backends.map((backend) => ({
      deployment_id: backend.deploymentId,
      weight: Number(backend.weight),
    })),
  });

  return {
    id: created.alias,
    name: created.alias,
    backends: (created.backends || []).map((backend) => ({
      deploymentId: backend.deployment_id,
      clusterId: REAL_CLUSTER_ID,
      weight: Number(backend.weight ?? 0),
    })),
    status: created.status,
    statusReason: created.status_reason,
  };
}

export async function updateTrafficRoute(route: TrafficRoute): Promise<TrafficRoute> {
  if (DEMO_MODE) {
    const index = demoState.routes.findIndex((item) => item.id === route.id);
    const normalized: TrafficRoute = {
      ...route,
      backends: route.backends.map((backend) => ({
        deploymentId: backend.deploymentId,
        clusterId:
          backend.clusterId ||
          demoState.deployments.find((item) => item.id === backend.deploymentId)?.clusterId ||
          DEMO_CLUSTER_IDS[0],
        weight: Math.max(0, Number(backend.weight || 0)),
      })),
      status: route.status || 'active',
      statusReason: route.statusReason ?? null,
    };
    if (index >= 0) {
      demoState.routes[index] = normalized;
    } else {
      demoState.routes.unshift(normalized);
    }
    return deepClone(normalized);
  }
  const updated = await updateTrafficRouteRequest(route.id, {
    backends: route.backends.map((backend) => ({
      deployment_id: backend.deploymentId,
      weight: Number(backend.weight),
    })),
  });

  return {
    id: updated.alias,
    name: updated.alias,
    backends: (updated.backends || []).map((backend) => ({
      deploymentId: backend.deployment_id,
      clusterId: REAL_CLUSTER_ID,
      weight: Number(backend.weight ?? 0),
    })),
    status: updated.status,
    statusReason: updated.status_reason,
  };
}

export async function deleteTrafficRoute(routeId: string): Promise<void> {
  if (DEMO_MODE) {
    demoState.routes = demoState.routes.filter((route) => route.id !== routeId);
    return;
  }
  await deleteTrafficRouteRequest(routeId);
}

export async function testTrafficRoute(route: TrafficRoute): Promise<{
  id: string;
  deployment: string;
  cluster: string;
  latency: number;
}> {
  if (DEMO_MODE) {
    const backends = route.backends.filter((backend) => backend.weight > 0);
    const selected =
      backends.length > 0
        ? backends.slice().sort((left, right) => right.weight - left.weight)[0]
        : route.backends[0];
    const deployment = selected
      ? demoState.deployments.find((item) => item.id === selected.deploymentId)
      : undefined;
    return {
      id: `${route.id}-${Date.now()}`,
      deployment: deployment?.modelName || selected?.deploymentId || 'unknown',
      cluster: selected?.clusterId || deployment?.clusterId || DEMO_CLUSTER_IDS[0],
      latency: Number((85 + Math.random() * 260).toFixed(2)),
    };
  }
  const startedAt = performance.now();
  const response = await testTrafficRouteRequest(route.id, {
    prompt: 'health check',
    max_tokens: 16,
    temperature: 0,
  });
  const latency = Math.max(0, performance.now() - startedAt);

  return {
    id: `${route.id}-${Date.now()}`,
    deployment: response.backend.model_name || response.backend.deployment_id,
    cluster: REAL_CLUSTER_ID,
    latency,
  };
}
