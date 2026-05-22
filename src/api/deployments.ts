type ImportMetaEnvShape = ImportMeta & {
  env: Record<string, string | undefined>;
};
import {
  getApiBearerToken as getSharedApiBearerToken,
  handleUnauthorizedResponse,
} from './security';
import { isDemoModeEnabled } from './demoMode';
import type {
  BackendModelHardwarePolicy,
  BackendModelHardwarePolicyUpdateRequest,
} from '../config/modelHardwarePolicy';

type RuntimeWindow = Window & {
  __APP_CONFIG__?: {
    API_URL?: string;
    API_BEARER_TOKEN?: string;
  };
};

const DEFAULT_CLUSTER_API_URL = 'https://deployment.hse-llm-project-2026.ru';
const EXTERNAL_DOMAIN = 'hse-llm-project-2026.ru';

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

const API_BASE_URL =
  runtimeApiUrl || buildTimeApiUrl || inferExternalDeploymentApiUrl() || DEFAULT_CLUSTER_API_URL;
export const API_BEARER_STORAGE_KEY = 'platform.apiBearerToken';
const BACKEND_UNAVAILABLE_MESSAGE =
  'Бэкенд недоступен. Проверьте, что Deployment service запущен.';
const DEMO_MODE = isDemoModeEnabled();

export interface ObjectRef {
  name: string;
  namespace: string;
}

export interface InferenceConfig {
  max_tokens: number;
  gpu_memory_utilization?: number | null;
  dtype: string;
  mode: 'gpu' | 'cpu';
  cpu_request?: string | null;
  cpu_limit?: string | null;
}

export interface DeploymentValidationLoadTestConfig {
  users?: number | null;
  spawn_rate?: number | null;
  max_tokens?: number | null;
  prompt?: string | null;
}

export interface DeploymentValidationSettings {
  enabled?: boolean;
  skip_validation?: boolean;
  slo_config_id?: string | null;
  slo_config_name?: string | null;
  smoke_check_enabled?: boolean;
  load_test_enabled?: boolean;
  load_test?: DeploymentValidationLoadTestConfig | null;
}

export type DeploymentAutoscalingMetric =
  | 'queue_length'
  | 'kv_cache_utilization'
  | 'tokens_per_second';

export interface DeploymentAutoscalingSettings {
  enabled?: boolean;
  min_replicas?: number;
  max_replicas?: number;
  metric?: DeploymentAutoscalingMetric;
  target_value?: number;
  cooldown_seconds?: number;
}

export interface DeploymentAutoscalingState {
  enabled: boolean;
  min_replicas: number;
  max_replicas: number;
  metric: DeploymentAutoscalingMetric;
  target_value: number;
  cooldown_seconds: number;
  current_replicas: number;
  desired_replicas: number;
  metric_value?: number | null;
  metric_unit?: string | null;
  blocked_reason?: string | null;
  pinned_replicas?: number | null;
  pin_expires_at?: string | null;
  last_evaluated_at?: string | null;
  last_scaled_at?: string | null;
  updated_at?: string | null;
}

export interface DeploymentAutoscalingEvent {
  id: string;
  action: 'scaled_up' | 'scaled_down' | 'blocked' | 'policy_updated' | 'pinned' | 'unpinned';
  from_replicas?: number | null;
  to_replicas?: number | null;
  metric?: DeploymentAutoscalingMetric | null;
  metric_value?: number | null;
  reason?: string | null;
  created_at: string;
}

export interface DeploymentAutoscalingDetailsResponse {
  deployment_id: string;
  autoscaling: DeploymentAutoscalingState;
  events: DeploymentAutoscalingEvent[];
}

export interface DeploymentAutoscalingHistoryPoint {
  timestamp: string;
  metric_value?: number | null;
  replicas: number;
}

export interface DeploymentAutoscalingHistoryResponse {
  deployment_id: string;
  metric: DeploymentAutoscalingMetric;
  metric_unit: string;
  lookback_minutes: number;
  step_seconds: number;
  points: DeploymentAutoscalingHistoryPoint[];
}

export interface DeploymentAutoscalingUpdateRequest {
  enabled: boolean;
  min_replicas: number;
  max_replicas: number;
  metric: DeploymentAutoscalingMetric;
  target_value: number;
  cooldown_seconds: number;
}

export interface DeploymentAutoscalingPinRequest {
  replicas: number;
  duration_minutes?: number | null;
}

export interface DeploymentCreateRequest {
  model_name: string;
  model_version: string;
  cluster_id: string;
  replicas: number;
  team: string;
  product: string;
  inference: InferenceConfig;
  scaling_policy_ref?: ObjectRef | null;
  slo_config_ref?: ObjectRef | null;
  node_name?: string | null;
  node_selector?: Record<string, string> | null;
  validation?: DeploymentValidationSettings | null;
  autoscaling?: DeploymentAutoscalingSettings | null;
}

export interface DeploymentRuntimeStatus {
  status: string;
  phase: string | null;
  ready_replicas: number;
  message: string | null;
  model_ready: boolean;
}

export interface DeploymentRuntimeErrorResponse {
  deployment_id: string;
  namespace: string;
  crd_name: string;
  has_error: boolean;
  phase: string | null;
  status_message: string | null;
  pod_name: string | null;
  container_name: string | null;
  reason: string | null;
  exit_code: number | null;
  restart_count: number;
  logs: string | null;
  checked_at: string;
}

export interface DeploymentK8sMetadata {
  uid?: string | null;
  generation?: number | null;
  resource_version?: string | null;
  creation_timestamp?: string | null;
  deletion_timestamp?: string | null;
  labels?: Record<string, string>;
  annotation_keys?: string[];
  annotations_preview?: Record<string, string>;
  finalizers?: string[];
}

export interface DeploymentValidationInfo {
  run_id: string;
  status: 'pending' | 'running' | 'passed' | 'failed' | 'error' | 'cancelled';
  verdict: 'pending' | 'running' | 'passed' | 'failed' | 'error' | 'cancelled';
  summary?: string | null;
  fail_reasons?: string[];
  started_at?: string | null;
  finished_at?: string | null;
  updated_at: string;
}

export interface DeploymentResponse {
  id: string;
  crd_name: string;
  namespace: string;
  model_name: string;
  model_version: string;
  cluster_id: string;
  replicas: number;
  team: string;
  product: string;
  can_manage?: boolean;
  can_inference?: boolean;
  node_name?: string | null;
  runtime_device_type?: 'gpu' | 'cpu' | 'unknown';
  runtime_device_name?: string | null;
  source?: 'postgresql' | 'cluster_only';
  inference: InferenceConfig;
  metadata?: DeploymentK8sMetadata | null;
  created_at: string;
  updated_at: string;
  status: DeploymentRuntimeStatus;
  validation?: DeploymentValidationInfo | null;
  autoscaling?: DeploymentAutoscalingState | null;
}

export type TrafficRouteStatus = 'active' | 'pending' | 'invalid';

export interface TrafficRouteBackendInput {
  deployment_id: string;
  weight: number;
}

export interface TrafficRouteCreateRequest {
  alias: string;
  backends: TrafficRouteBackendInput[];
}

export interface TrafficRouteUpdateRequest {
  backends: TrafficRouteBackendInput[];
}

export interface TrafficRouteBackendResponse {
  deployment_id: string;
  namespace: string;
  crd_name: string;
  model_name: string | null;
  model_version: string | null;
  team: string | null;
  weight: number;
  status: DeploymentRuntimeStatus | null;
  healthy: boolean;
  message: string | null;
}

export interface TrafficRouteResponse {
  alias: string;
  namespace: string;
  status: TrafficRouteStatus;
  status_reason: string | null;
  backends: TrafficRouteBackendResponse[];
  created_at: string;
  updated_at: string;
  generation: number | null;
  resource_version: string | null;
}

export interface TrafficRouteTestRequest {
  prompt: string;
  max_tokens?: number;
  temperature?: number;
}

export interface TrafficRouteTestResponse {
  alias: string;
  backend: TrafficRouteBackendResponse;
  response_text: string;
  status_code: number;
}

export type ReleaseStatus =
  | 'pending'
  | 'running'
  | 'paused'
  | 'completed'
  | 'rolled_back'
  | 'cancelled';

export interface ReleaseStrategyInput {
  mode: 'step' | 'instant';
  start_percent: number;
  step_percent: number;
  interval_seconds: number;
  target_percent: number;
}

export interface ReleaseSLOInput {
  max_p95_latency_ms?: number | null;
  max_error_rate?: number | null;
  min_throughput?: number | null;
  max_p95_degradation_ratio?: number | null;
  max_error_rate_delta?: number | null;
  min_throughput_ratio?: number | null;
  confirmation_cycles?: number | null;
}

export interface ReleaseCreateRequest {
  route_alias: string;
  target_deployment_id: string;
  strategy?: Partial<ReleaseStrategyInput>;
  slo?: ReleaseSLOInput | null;
}

export interface ReleaseActionRequest {
  reason?: string | null;
}

export interface ReleaseStrategyResponse {
  mode: 'step' | 'instant';
  start_percent: number;
  step_percent: number;
  interval_seconds: number;
  target_percent: number;
}

export interface ReleaseSLOResponse {
  max_p95_latency_ms?: number | null;
  max_error_rate?: number | null;
  min_throughput?: number | null;
  max_p95_degradation_ratio?: number | null;
  max_error_rate_delta?: number | null;
  min_throughput_ratio?: number | null;
  confirmation_cycles: number;
}

export interface ReleaseStepResponse {
  id: string;
  step_index: number;
  target_percent: number;
  status: string;
  note?: string | null;
  metrics: Record<string, unknown>;
  applied_at: string;
}

export interface ReleaseEventResponse {
  id: string;
  event_type: string;
  status_snapshot: string;
  traffic_percent?: number | null;
  message?: string | null;
  metrics: Record<string, unknown>;
  details: Record<string, unknown>;
  created_at: string;
}

export interface ReleaseResponse {
  id: string;
  route_alias: string;
  namespace: string;
  team?: string | null;
  product?: string | null;
  source_deployment_id: string;
  source_crd_name: string;
  source_namespace: string;
  target_deployment_id: string;
  target_crd_name: string;
  target_namespace: string;
  strategy: ReleaseStrategyResponse;
  slo: ReleaseSLOResponse;
  status: ReleaseStatus;
  current_percent: number;
  next_step_at?: string | null;
  paused_at?: string | null;
  started_at?: string | null;
  finished_at?: string | null;
  rollback_reason?: string | null;
  completion_reason?: string | null;
  latest_metrics: Record<string, unknown>;
  created_by_user_id?: string | null;
  created_by_user_email?: string | null;
  created_at: string;
  updated_at: string;
  steps: ReleaseStepResponse[];
  events: ReleaseEventResponse[];
}

export interface ReleaseListResponse {
  items: ReleaseResponse[];
}

export interface DeploymentTeamAccessRule {
  team: string;
  allow_manage: boolean;
  allow_inference: boolean;
}

export interface DeploymentAccessResponse {
  deployment_id: string;
  owner_team: string;
  rules: DeploymentTeamAccessRule[];
  can_manage: boolean;
  can_inference: boolean;
}

export interface DeploymentAccessUpdateRequest {
  rules: DeploymentTeamAccessRule[];
}

export interface InferenceApiTokenCreateRequest {
  description?: string | null;
  ttl_minutes: number;
}

export interface InferenceApiTokenInfo {
  id: string;
  deployment_id: string;
  deployment_ref: string;
  namespace: string;
  crd_name: string;
  team: string;
  token_prefix: string;
  description: string | null;
  expires_at: string;
  created_at: string;
  updated_at: string;
  created_by_user_id: string | null;
  created_by_user_email: string | null;
  last_used_at: string | null;
  revoked_at: string | null;
}

export interface InferenceApiTokenCreateResponse extends InferenceApiTokenInfo {
  token: string;
}

export interface ChatCompletionMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | ChatCompletionContentPart[];
}

export interface ChatCompletionTextPart {
  type: 'text';
  text: string;
}

export interface ChatCompletionImagePart {
  type: 'image_url';
  image_url: {
    url: string;
    detail?: 'auto' | 'low' | 'high';
  };
}

export type ChatCompletionContentPart = ChatCompletionTextPart | ChatCompletionImagePart;

export interface ChatCompletionRequest {
  model: string;
  messages: ChatCompletionMessage[];
  max_tokens?: number;
  temperature?: number;
  stream?: boolean;
}

interface ChatCompletionChoice {
  index?: number;
  message?: {
    role?: string;
    content?: string | Array<Record<string, unknown>>;
  };
}

interface ChatCompletionResponse {
  choices?: ChatCompletionChoice[];
}

const demoDeploymentAccessState = new Map<string, DeploymentAccessResponse>();
const demoTokenState = new Map<string, InferenceApiTokenInfo[]>();

function demoNowIso(): string {
  return new Date().toISOString();
}

function demoId(prefix: string): string {
  const randomPart = Math.random().toString(36).slice(2, 8);
  return `${prefix}-${Date.now().toString(36)}-${randomPart}`;
}

function ensureDemoDeploymentAccess(deploymentId: string): DeploymentAccessResponse {
  const existing = demoDeploymentAccessState.get(deploymentId);
  if (existing) {
    return existing;
  }
  const seeded: DeploymentAccessResponse = {
    deployment_id: deploymentId,
    owner_team: 'Data Science',
    rules: [
      {
        team: 'Data Science',
        allow_manage: true,
        allow_inference: true,
      },
      {
        team: 'Search',
        allow_manage: false,
        allow_inference: true,
      },
    ],
    can_manage: true,
    can_inference: true,
  };
  demoDeploymentAccessState.set(deploymentId, seeded);
  return seeded;
}

function ensureDemoInferenceTokens(deploymentId: string): InferenceApiTokenInfo[] {
  const existing = demoTokenState.get(deploymentId);
  if (existing) {
    return existing;
  }
  const now = demoNowIso();
  const seeded: InferenceApiTokenInfo[] = [
    {
      id: demoId('tok'),
      deployment_id: deploymentId,
      deployment_ref: deploymentId,
      namespace: 'llmops',
      crd_name: deploymentId,
      team: 'Data Science',
      token_prefix: `llmptk_${Math.random().toString(36).slice(2, 9)}`,
      description: 'Demo inference token',
      expires_at: new Date(Date.now() + 45 * 24 * 60 * 60 * 1000).toISOString(),
      created_at: now,
      updated_at: now,
      created_by_user_id: 'demo-admin',
      created_by_user_email: 'demo.admin@hse-llm-project-2026.ru',
      last_used_at: null,
      revoked_at: null,
    },
  ];
  demoTokenState.set(deploymentId, seeded);
  return seeded;
}

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function buildUrl(path: string): string {
  return `${API_BASE_URL.replace(/\/+$/, '')}${path}`;
}

export function normalizeBearerToken(raw: string | undefined): string | null {
  const token = (raw ?? '').trim();
  if (!token) {
    return null;
  }
  if (/^bearer\s+/i.test(token)) {
    return token;
  }
  return `Bearer ${token}`;
}

export function getApiBearerToken(): string | null {
  return getSharedApiBearerToken();
}

export function setApiBearerToken(rawToken: string): string | null {
  const normalizedToken = normalizeBearerToken(rawToken);
  if (!normalizedToken || typeof window === 'undefined') {
    return null;
  }
  window.localStorage.setItem(API_BEARER_STORAGE_KEY, normalizedToken);
  return normalizedToken;
}

export function clearApiBearerToken(): void {
  if (typeof window === 'undefined') {
    return;
  }
  window.localStorage.removeItem(API_BEARER_STORAGE_KEY);
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
    if (Array.isArray(body?.detail)) {
      const messages = body.detail
        .map((item: unknown) => {
          if (!item || typeof item !== 'object') return '';
          const message = (item as { msg?: unknown }).msg;
          if (typeof message !== 'string') return '';
          return message.replace(/^Value error,\s*/i, '').trim();
        })
        .filter((message: string) => message.length > 0);
      if (messages.length > 0) {
        return messages.join(' ');
      }
    }
  } catch {
    // Ignore body parsing errors and use fallback below.
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

export async function getDeployments(): Promise<DeploymentResponse[]> {

  try {
    return await requestJson<DeploymentResponse[]>('/deployments');
  } catch (error) {
    throw error instanceof Error ? error : new Error('Не удалось загрузить деплойменты.');
  }
}

export async function getDeployment(id: string): Promise<DeploymentResponse> {

  try {
    return await requestJson<DeploymentResponse>(`/deployments/${id}`);
  } catch (error) {
    throw error instanceof Error
      ? error
      : new Error(`Не удалось загрузить деплоймент ${id}.`);
  }
}

export async function listTrafficRoutes(): Promise<TrafficRouteResponse[]> {

  return requestJson<TrafficRouteResponse[]>('/traffic-routes');
}

export async function getTrafficRoute(alias: string): Promise<TrafficRouteResponse> {

  return requestJson<TrafficRouteResponse>(
    `/traffic-routes/${encodeURIComponent(alias)}`
  );
}

export async function createTrafficRoute(
  payload: TrafficRouteCreateRequest
): Promise<TrafficRouteResponse> {

  return requestJson<TrafficRouteResponse>('/traffic-routes', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
}

export async function updateTrafficRoute(
  alias: string,
  payload: TrafficRouteUpdateRequest
): Promise<TrafficRouteResponse> {

  return requestJson<TrafficRouteResponse>(
    `/traffic-routes/${encodeURIComponent(alias)}`,
    {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    }
  );
}

export async function deleteTrafficRoute(alias: string): Promise<void> {

  let response: Response;
  try {
    response = await fetch(
      buildUrl(`/traffic-routes/${encodeURIComponent(alias)}`),
      withAuthHeaders({ method: 'DELETE' })
    );
  } catch {
    throw new Error(BACKEND_UNAVAILABLE_MESSAGE);
  }

  if (response.status === 404 || response.status === 204) {
    return;
  }

  if (handleUnauthorizedResponse(response)) {
    throw new Error('Сессия истекла. Выполните вход повторно.');
  }

  if (!response.ok) {
    throw new Error(await parseErrorMessage(response));
  }
}

export async function testTrafficRoute(
  alias: string,
  payload: TrafficRouteTestRequest
): Promise<TrafficRouteTestResponse> {

  return requestJson<TrafficRouteTestResponse>(
    `/traffic-routes/${encodeURIComponent(alias)}/test`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    }
  );
}

export async function listReleases(options?: {
  statuses?: ReleaseStatus[];
  includeHistory?: boolean;
}): Promise<ReleaseResponse[]> {
  const includeHistory = options?.includeHistory ?? false;
  const params = new URLSearchParams();
  if (options?.statuses && options.statuses.length > 0) {
    params.set('status', options.statuses.join(','));
  }
  if (includeHistory) {
    params.set('include_history', 'true');
  }
  const suffix = params.toString();
  const payload = await requestJson<ReleaseListResponse>(
    suffix ? `/releases?${suffix}` : '/releases'
  );
  return payload.items;
}

export async function getRelease(releaseId: string): Promise<ReleaseResponse> {
  return requestJson<ReleaseResponse>(`/releases/${encodeURIComponent(releaseId)}`);
}

export async function createRelease(payload: ReleaseCreateRequest): Promise<ReleaseResponse> {
  return requestJson<ReleaseResponse>('/releases', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
}

async function performReleaseAction(
  releaseId: string,
  action: 'pause' | 'resume' | 'rollback' | 'skip-to-100',
  payload?: ReleaseActionRequest
): Promise<ReleaseResponse> {
  return requestJson<ReleaseResponse>(
    `/releases/${encodeURIComponent(releaseId)}/${action}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload ?? {}),
    }
  );
}

export async function pauseRelease(
  releaseId: string,
  payload?: ReleaseActionRequest
): Promise<ReleaseResponse> {
  return performReleaseAction(releaseId, 'pause', payload);
}

export async function resumeRelease(
  releaseId: string,
  payload?: ReleaseActionRequest
): Promise<ReleaseResponse> {
  return performReleaseAction(releaseId, 'resume', payload);
}

export async function rollbackRelease(
  releaseId: string,
  payload?: ReleaseActionRequest
): Promise<ReleaseResponse> {
  return performReleaseAction(releaseId, 'rollback', payload);
}

export async function skipReleaseTo100(
  releaseId: string,
  payload?: ReleaseActionRequest
): Promise<ReleaseResponse> {
  return performReleaseAction(releaseId, 'skip-to-100', payload);
}

export async function getDeploymentAccess(
  deploymentId: string
): Promise<DeploymentAccessResponse> {
  if (DEMO_MODE) {
    return deepClone(ensureDemoDeploymentAccess(deploymentId));
  }
  return requestJson<DeploymentAccessResponse>(
    `/deployments/${encodeURIComponent(deploymentId)}/access`
  );
}

export async function updateDeploymentAccess(
  deploymentId: string,
  payload: DeploymentAccessUpdateRequest
): Promise<DeploymentAccessResponse> {
  if (DEMO_MODE) {
    const updated: DeploymentAccessResponse = {
      ...ensureDemoDeploymentAccess(deploymentId),
      rules: deepClone(payload.rules || []),
      can_manage: true,
      can_inference: true,
    };
    demoDeploymentAccessState.set(deploymentId, updated);
    return deepClone(updated);
  }
  return requestJson<DeploymentAccessResponse>(
    `/deployments/${encodeURIComponent(deploymentId)}/access`,
    {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    }
  );
}

export async function listDeploymentInferenceTokens(
  deploymentId: string
): Promise<InferenceApiTokenInfo[]> {
  if (DEMO_MODE) {
    return deepClone(ensureDemoInferenceTokens(deploymentId));
  }
  return requestJson<InferenceApiTokenInfo[]>(
    `/deployments/${encodeURIComponent(deploymentId)}/inference-tokens`
  );
}

export async function createDeploymentInferenceToken(
  deploymentId: string,
  payload: InferenceApiTokenCreateRequest
): Promise<InferenceApiTokenCreateResponse> {
  if (DEMO_MODE) {
    const now = demoNowIso();
    const created: InferenceApiTokenCreateResponse = {
      id: demoId('tok'),
      deployment_id: deploymentId,
      deployment_ref: deploymentId,
      namespace: 'llmops',
      crd_name: deploymentId,
      team: 'Data Science',
      token_prefix: `llmptk_${Math.random().toString(36).slice(2, 9)}`,
      description: payload.description || null,
      expires_at: new Date(
        Date.now() + Math.max(60, Number(payload.ttl_minutes || 60)) * 60 * 1000
      ).toISOString(),
      created_at: now,
      updated_at: now,
      created_by_user_id: 'demo-admin',
      created_by_user_email: 'demo.admin@hse-llm-project-2026.ru',
      last_used_at: null,
      revoked_at: null,
      token: `llmptk_demo_${Math.random().toString(36).slice(2, 16)}`,
    };
    const list = ensureDemoInferenceTokens(deploymentId);
    const persisted: InferenceApiTokenInfo = {
      id: created.id,
      deployment_id: created.deployment_id,
      deployment_ref: created.deployment_ref,
      namespace: created.namespace,
      crd_name: created.crd_name,
      team: created.team,
      token_prefix: created.token_prefix,
      description: created.description,
      expires_at: created.expires_at,
      created_at: created.created_at,
      updated_at: created.updated_at,
      created_by_user_id: created.created_by_user_id,
      created_by_user_email: created.created_by_user_email,
      last_used_at: created.last_used_at,
      revoked_at: created.revoked_at,
    };
    list.unshift(persisted);
    demoTokenState.set(deploymentId, list);
    return deepClone(created);
  }
  return requestJson<InferenceApiTokenCreateResponse>(
    `/deployments/${encodeURIComponent(deploymentId)}/inference-tokens`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    }
  );
}

export async function revokeDeploymentInferenceToken(
  deploymentId: string,
  tokenId: string
): Promise<InferenceApiTokenInfo> {
  if (DEMO_MODE) {
    const list = ensureDemoInferenceTokens(deploymentId);
    const token = list.find((item) => item.id === tokenId);
    if (!token) {
      throw new Error('Token not found.');
    }
    token.revoked_at = demoNowIso();
    token.updated_at = token.revoked_at;
    demoTokenState.set(deploymentId, list);
    return deepClone(token);
  }
  return requestJson<InferenceApiTokenInfo>(
    `/deployments/${encodeURIComponent(deploymentId)}/inference-tokens/${encodeURIComponent(tokenId)}`,
    {
      method: 'DELETE',
    }
  );
}

export async function getModelHardwarePolicy(): Promise<BackendModelHardwarePolicy> {
  if (DEMO_MODE) {
    return {
      default_cpu_memory_request: '6Gi',
      default_gpu_memory_request: '6Gi',
      all_cpu_models: [
        'HuggingFaceTB/SmolLM2-135M-Instruct',
        'HuggingFaceTB/SmolLM2-1.7B-Instruct',
        'Qwen/Qwen2.5-3B-Instruct',
      ],
      all_gpu_models: [
        'HuggingFaceTB/SmolLM2-135M-Instruct',
        'HuggingFaceTB/SmolLM2-1.7B-Instruct',
        'Qwen/Qwen2.5-3B-Instruct',
        'google/gemma-3-4b-it',
        'HuggingFaceTB/SmolVLM2-2.2B-Instruct',
      ],
      cpu_type_models: {
        'intel(r) core(tm) i3-2120 cpu @ 3.30ghz': [
          'HuggingFaceTB/SmolLM2-135M-Instruct',
          'Qwen/Qwen2.5-3B-Instruct',
        ],
      },
      gpu_type_models: {
        'NVIDIA-A100-SXM4-80GB': [
          'HuggingFaceTB/SmolLM2-1.7B-Instruct',
          'google/gemma-3-4b-it',
          'HuggingFaceTB/SmolVLM2-2.2B-Instruct',
        ],
      },
      cpu_model_memory_requests: {},
      gpu_model_memory_requests: {},
      updated_at: demoNowIso(),
      updated_by_user_id: 'demo-admin',
      updated_by_user_email: 'demo.admin@hse-llm-project-2026.ru',
    };
  }
  return requestJson<BackendModelHardwarePolicy>('/admin/model-hardware-policy');
}

export async function updateModelHardwarePolicy(
  payload: BackendModelHardwarePolicyUpdateRequest
): Promise<BackendModelHardwarePolicy> {
  if (DEMO_MODE) {
    return {
      default_cpu_memory_request: payload.default_cpu_memory_request,
      default_gpu_memory_request: payload.default_gpu_memory_request,
      all_cpu_models: payload.all_cpu_models,
      all_gpu_models: payload.all_gpu_models,
      cpu_type_models: payload.cpu_type_models,
      gpu_type_models: payload.gpu_type_models,
      cpu_model_memory_requests: payload.cpu_model_memory_requests,
      gpu_model_memory_requests: payload.gpu_model_memory_requests,
      updated_at: demoNowIso(),
      updated_by_user_id: 'demo-admin',
      updated_by_user_email: 'demo.admin@hse-llm-project-2026.ru',
    };
  }
  return requestJson<BackendModelHardwarePolicy>('/admin/model-hardware-policy', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
}

export async function createDeployment(
  payload: DeploymentCreateRequest
): Promise<DeploymentResponse> {

  try {
    return await requestJson<DeploymentResponse>('/deployments', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
  } catch (error) {
    throw error instanceof Error ? error : new Error('Не удалось создать деплоймент.');
  }
}

export async function deleteDeployment(id: string): Promise<void> {

  let response: Response;
  try {
    response = await fetch(
      buildUrl(`/deployments/${id}`),
      withAuthHeaders({ method: 'DELETE' })
    );
  } catch {
    throw new Error(BACKEND_UNAVAILABLE_MESSAGE);
  }

  if (response.status === 404 || response.status === 204) {
    return;
  }

  if (handleUnauthorizedResponse(response)) {
    throw new Error('Сессия истекла. Выполните вход повторно.');
  }

  if (!response.ok) {
    throw new Error(await parseErrorMessage(response));
  }
}

export async function getDeploymentRuntimeError(
  deploymentId: string,
  options?: {
    includeLogs?: boolean;
    tailLines?: number;
  }
): Promise<DeploymentRuntimeErrorResponse> {
  if (DEMO_MODE) {
    const includeLogs = options?.includeLogs ?? true;
    return {
      deployment_id: deploymentId,
      namespace: 'llmops',
      crd_name: deploymentId,
      has_error: false,
      phase: 'Running',
      status_message: null,
      pod_name: `${deploymentId}-0`,
      container_name: 'vllm-server',
      reason: null,
      exit_code: null,
      restart_count: 0,
      logs: includeLogs
        ? 'INFO Starting vLLM server\nINFO Model loaded and ready\nINFO Health checks OK'
        : null,
      checked_at: demoNowIso(),
    };
  }
  const includeLogs = options?.includeLogs ?? true;
  const tailLines = options?.tailLines ?? 120;


  const params = new URLSearchParams();
  params.set('include_logs', String(includeLogs));
  params.set('tail_lines', String(tailLines));
  return requestJson<DeploymentRuntimeErrorResponse>(
    `/deployments/${encodeURIComponent(deploymentId)}/runtime-error?${params.toString()}`
  );
}

export async function redeployDeployment(id: string): Promise<DeploymentResponse> {
  if (DEMO_MODE) {
    const now = demoNowIso();
    return {
      id,
      crd_name: id,
      namespace: 'llmops',
      model_name: 'HuggingFaceTB/SmolLM2-1.7B-Instruct',
      model_version: 'latest',
      cluster_id: 'msk-1',
      replicas: 1,
      team: 'Data Science',
      product: 'Assistant API',
      can_manage: true,
      can_inference: true,
      node_name: null,
      runtime_device_type: 'gpu',
      runtime_device_name: 'NVIDIA A100',
      source: 'postgresql',
      inference: {
        max_tokens: 512,
        gpu_memory_utilization: 0.9,
        dtype: 'auto',
        mode: 'gpu',
        cpu_request: null,
        cpu_limit: null,
      },
      metadata: null,
      created_at: now,
      updated_at: now,
      status: {
        status: 'running',
        phase: 'Running',
        ready_replicas: 1,
        message: 'Redeploy accepted',
        model_ready: true,
      },
      validation: null,
      autoscaling: null,
    };
  }
  return requestJson<DeploymentResponse>(`/deployments/${encodeURIComponent(id)}/redeploy`, {
    method: 'POST',
  });
}

export async function getDeploymentAutoscaling(
  deploymentId: string
): Promise<DeploymentAutoscalingDetailsResponse> {

  return requestJson<DeploymentAutoscalingDetailsResponse>(
    `/deployments/${encodeURIComponent(deploymentId)}/autoscaling`
  );
}

export async function getDeploymentAutoscalingHistory(
  deploymentId: string,
  options?: {
    lookbackMinutes?: number;
    stepSeconds?: number;
  }
): Promise<DeploymentAutoscalingHistoryResponse> {
  const lookbackMinutes = Math.max(10, Math.trunc(options?.lookbackMinutes ?? 60));
  const stepSeconds = Math.max(15, Math.trunc(options?.stepSeconds ?? 30));


  const params = new URLSearchParams({
    lookback_minutes: String(lookbackMinutes),
    step_seconds: String(stepSeconds),
  });
  return requestJson<DeploymentAutoscalingHistoryResponse>(
    `/deployments/${encodeURIComponent(deploymentId)}/autoscaling/history?${params.toString()}`
  );
}

export async function updateDeploymentAutoscaling(
  deploymentId: string,
  payload: DeploymentAutoscalingUpdateRequest
): Promise<DeploymentAutoscalingDetailsResponse> {

  return requestJson<DeploymentAutoscalingDetailsResponse>(
    `/deployments/${encodeURIComponent(deploymentId)}/autoscaling`,
    {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    }
  );
}

export async function pinDeploymentAutoscalingReplicas(
  deploymentId: string,
  payload: DeploymentAutoscalingPinRequest
): Promise<DeploymentAutoscalingDetailsResponse> {

  return requestJson<DeploymentAutoscalingDetailsResponse>(
    `/deployments/${encodeURIComponent(deploymentId)}/autoscaling/pin`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    }
  );
}

export async function unpinDeploymentAutoscalingReplicas(
  deploymentId: string
): Promise<DeploymentAutoscalingDetailsResponse> {

  return requestJson<DeploymentAutoscalingDetailsResponse>(
    `/deployments/${encodeURIComponent(deploymentId)}/autoscaling/pin`,
    {
      method: 'DELETE',
    }
  );
}

export async function proxyDeploymentChatCompletion(
  deploymentId: string,
  payload: ChatCompletionRequest
): Promise<string> {
  const messageContentToText = (content: string | ChatCompletionContentPart[]): string => {
    if (typeof content === 'string') {
      return content.trim();
    }
    if (!Array.isArray(content)) {
      return '';
    }
    return content
      .map((item) => {
        if (item.type === 'text') {
          return String(item.text || '').trim();
        }
        if (item.type === 'image_url') {
          return '[image]';
        }
        return '';
      })
      .filter((chunk) => chunk.length > 0)
      .join(' ')
      .trim();
  };

  const responseContentToText = (content: unknown): string => {
    if (typeof content === 'string') {
      return content.trim();
    }
    if (!Array.isArray(content)) {
      return '';
    }
    return content
      .map((item) => {
        if (!item || typeof item !== 'object') {
          return '';
        }
        const record = item as Record<string, unknown>;
        const maybeText = record.text;
        if (typeof maybeText === 'string' && maybeText.trim()) {
          return maybeText.trim();
        }
        const maybeContent = record.content;
        if (typeof maybeContent === 'string' && maybeContent.trim()) {
          return maybeContent.trim();
        }
        return '';
      })
      .filter((chunk) => chunk.length > 0)
      .join('\n')
      .trim();
  };

  if (DEMO_MODE) {
    const userMessages = (payload.messages || [])
      .filter((message) => message.role === 'user')
      .map((message) => messageContentToText(message.content))
      .filter((text) => text.length > 0);
    const lastPrompt = userMessages[userMessages.length - 1] || 'Привет';
    return `Demo response from ${deploymentId}: ${lastPrompt.slice(0, 180)}`;
  }

  const response = await requestJson<ChatCompletionResponse>(
    `/deployments/${encodeURIComponent(deploymentId)}/proxy/v1/chat/completions`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ...payload,
        stream: false,
      }),
    }
  );

  const content = responseContentToText(response.choices?.[0]?.message?.content);
  if (!content) {
    throw new Error('LLM вернула пустой ответ.');
  }
  return content;
}

export { API_BASE_URL, BACKEND_UNAVAILABLE_MESSAGE };
