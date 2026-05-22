import {
  API_BASE_URL,
  BACKEND_UNAVAILABLE_MESSAGE,
  getApiBearerToken,
} from './deployments';
import { handleUnauthorizedResponse } from './security';

export type ValidationStatus =
  | 'pending'
  | 'running'
  | 'passed'
  | 'failed'
  | 'error'
  | 'cancelled';

export interface SLOConfigResponse {
  id: string;
  name: string;
  description?: string | null;
  max_error_rate: number;
  min_throughput: number;
  max_p95_latency_ms: number;
  max_p99_latency_ms: number;
  max_startup_time_sec: number;
  max_ttft_ms?: number | null;
  max_tpot_ms?: number | null;
  max_queue_length?: number | null;
  max_kv_cache_utilization?: number | null;
  warmup_duration_sec: number;
  load_test_duration_sec: number;
  stabilization_wait_sec: number;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface ValidationRunResponse {
  id: string;
  status: ValidationStatus;
  verdict: ValidationStatus;
  model_name: string;
  model_version: string;
  cluster_id: string;
  team: string;
  product: string;
  namespace: string;
  staging_crd_name?: string | null;
  staging_service_name?: string | null;
  slo_config_id?: string | null;
  slo_config_name?: string | null;
  readiness_ok?: boolean | null;
  smoke_ok?: boolean | null;
  error_rate?: number | null;
  throughput?: number | null;
  latency_p50_ms?: number | null;
  latency_p95_ms?: number | null;
  latency_p99_ms?: number | null;
  ttft_p95_ms?: number | null;
  tpot_ms?: number | null;
  queue_length?: number | null;
  kv_cache_utilization?: number | null;
  startup_time_sec?: number | null;
  fail_reasons?: string[];
  summary?: string | null;
  artifact_ref?: string | null;
  cancel_requested: boolean;
  target_deployment_id?: string | null;
  created_at: string;
  updated_at: string;
  started_at?: string | null;
  finished_at?: string | null;
}

export interface ValidationReportResponse {
  id: string;
  run_id: string;
  status: ValidationStatus;
  verdict: ValidationStatus;
  summary?: string | null;
  fail_reasons?: string[];
  artifact_ref?: string | null;
  report: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface UserNotificationResponse {
  id: string;
  category: string;
  severity: 'info' | 'warning' | 'error' | 'success';
  title: string;
  message: string;
  resource_type?: string | null;
  resource_id?: string | null;
  payload: Record<string, unknown>;
  is_read: boolean;
  created_at: string;
  read_at?: string | null;
}

function buildUrl(path: string): string {
  const base = API_BASE_URL.replace(/\/+$/, '');
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${base}${normalizedPath}`;
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
    // ignore
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

export async function listSLOConfigs(): Promise<SLOConfigResponse[]> {
  return requestJson<SLOConfigResponse[]>('/validation/slo-configs');
}

export async function listValidationRuns(options?: {
  status?: ValidationStatus;
  limit?: number;
  targetDeploymentId?: string;
}): Promise<ValidationRunResponse[]> {
  const params = new URLSearchParams();
  if (options?.status) {
    params.set('status', options.status);
  }
  if (options?.limit && Number.isFinite(options.limit)) {
    params.set('limit', String(options.limit));
  }
  const targetDeploymentId = String(options?.targetDeploymentId || '').trim();
  if (targetDeploymentId) {
    params.set('target_deployment_id', targetDeploymentId);
  }
  const query = params.toString();
  return requestJson<ValidationRunResponse[]>(
    `/validation/runs${query ? `?${query}` : ''}`
  );
}

export async function getValidationReport(runId: string): Promise<ValidationReportResponse> {
  const normalizedRunId = String(runId || '').trim();
  if (!normalizedRunId) {
    throw new Error('run_id is required.');
  }
  return requestJson<ValidationReportResponse>(
    `/validation/reports/${encodeURIComponent(normalizedRunId)}`
  );
}

export async function listUserNotifications(options?: {
  includeRead?: boolean;
  limit?: number;
}): Promise<UserNotificationResponse[]> {
  const params = new URLSearchParams();
  if (options?.includeRead) {
    params.set('include_read', 'true');
  }
  if (options?.limit && Number.isFinite(options.limit)) {
    params.set('limit', String(options.limit));
  }
  const query = params.toString();
  return requestJson<UserNotificationResponse[]>(
    `/notifications${query ? `?${query}` : ''}`
  );
}

export async function markUserNotificationRead(notificationId: string): Promise<void> {
  const normalized = String(notificationId || '').trim();
  if (!normalized) {
    throw new Error('notification_id is required.');
  }
  await requestJson<{ id: string; is_read: boolean }>(
    `/notifications/${encodeURIComponent(normalized)}/read`,
    { method: 'POST' }
  );
}

export async function markAllUserNotificationsRead(): Promise<number> {
  const payload = await requestJson<{ updated: number }>('/notifications/read-all', {
    method: 'POST',
  });
  return Number.isFinite(payload.updated) ? Number(payload.updated) : 0;
}
