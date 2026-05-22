type ImportMetaEnvShape = ImportMeta & {
  env: Record<string, string | undefined>;
};

type RuntimeWindow = Window & {
  __APP_CONFIG__?: {
    API_URL?: string;
    API_BEARER_TOKEN?: string;
  };
};

import { getApiBearerToken, handleUnauthorizedResponse } from './security';

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
  typeof window !== 'undefined' ? (window as RuntimeWindow).__APP_CONFIG__?.API_URL : undefined;
const runtimeApiBearerToken =
  typeof window !== 'undefined'
    ? (window as RuntimeWindow).__APP_CONFIG__?.API_BEARER_TOKEN
    : undefined;

const buildTimeApiUrl = (import.meta as ImportMetaEnvShape).env.VITE_API_URL;
const buildTimeApiBearerToken = (import.meta as ImportMetaEnvShape).env.VITE_API_BEARER_TOKEN;

const API_BASE_URL =
  runtimeApiUrl || buildTimeApiUrl || inferExternalDeploymentApiUrl() || DEFAULT_CLUSTER_API_URL;

const BACKEND_UNAVAILABLE_MESSAGE =
  'Бэкенд недоступен. Проверьте, что Deployment service запущен.';

export type QuotaSubjectType = 'team' | 'user';
export type QuotaUnit = 'tokens' | 'requests';
export type QuotaPeriod = 'hour' | 'day' | 'month';
export type QuotaAction = 'block' | 'throttle' | 'warn';
export type QuotaStatus = 'normal' | 'warning' | 'exceeded' | 'disabled';

export interface QuotaResponse {
  id: string;
  subject_type: QuotaSubjectType;
  subject_key: string;
  display_name: string;
  team: string | null;
  limit_value: number;
  unit: QuotaUnit;
  period: QuotaPeriod;
  action: QuotaAction;
  priority: number;
  enabled: boolean;
  warning_threshold_percent: number;
  current_value: number;
  usage_percent: number;
  status: QuotaStatus;
  resets_at: string;
  created_at: string;
  updated_at: string;
  created_by_user_id?: string | null;
  created_by_user_email?: string | null;
  updated_by_user_id?: string | null;
  updated_by_user_email?: string | null;
}

export interface QuotaUpsertRequest {
  subject_type: QuotaSubjectType;
  subject_key: string;
  display_name?: string | null;
  team?: string | null;
  limit_value: number;
  unit: QuotaUnit;
  period: QuotaPeriod;
  action: QuotaAction;
  priority: number;
  enabled: boolean;
  warning_threshold_percent: number;
}

export interface QuotaTimeseriesPointResponse {
  timestamp: string;
  value: number;
  tokens: number;
  requests: number;
}

export interface QuotaModelUsageResponse {
  model_name: string;
  tokens: number;
  requests: number;
  share_percent: number;
}

export interface QuotaChangeHistoryResponse {
  id: string;
  action: 'created' | 'updated' | 'deleted';
  changed_at: string;
  changed_by_user_id?: string | null;
  changed_by_user_email?: string | null;
  old_value?: Record<string, unknown> | null;
  new_value?: Record<string, unknown> | null;
}

export interface QuotaDeniedEventResponse {
  id: string;
  occurred_at: string;
  status_code: number;
  reason: string;
  subject_type: QuotaSubjectType;
  subject_key: string;
  team?: string | null;
  deployment_id?: string | null;
  route_alias?: string | null;
  model_name?: string | null;
  requested_tokens: number;
  requested_requests: number;
  current_value: number;
  limit_value: number;
  resets_at?: string | null;
}

export interface QuotaDetailsResponse {
  quota: QuotaResponse;
  timeseries: QuotaTimeseriesPointResponse[];
  model_breakdown: QuotaModelUsageResponse[];
  change_history: QuotaChangeHistoryResponse[];
  denied_events: QuotaDeniedEventResponse[];
}

export interface ListQuotasQuery {
  subjectType?: QuotaSubjectType;
  team?: string;
  enabled?: boolean;
  status?: QuotaStatus;
}

function getApiBearerTokenForDeploymentService(): string | null {
  const sessionToken = getApiBearerToken();
  if (sessionToken) {
    return sessionToken;
  }

  const fallback =
    runtimeApiBearerToken ||
    buildTimeApiBearerToken ||
    (typeof window !== 'undefined'
      ? window.localStorage.getItem('platform.apiBearerToken')
      : null);
  if (!fallback) return null;
  const trimmed = String(fallback).trim();
  if (!trimmed) return null;
  return trimmed.toLowerCase().startsWith('bearer ') ? trimmed : `Bearer ${trimmed}`;
}

function withAuthHeaders(init?: RequestInit): RequestInit {
  const headers = new Headers(init?.headers || {});
  const token = getApiBearerTokenForDeploymentService();
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', token);
  }
  return { ...init, headers };
}

function buildUrl(path: string): string {
  return `${API_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`;
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
          const msg = (item as { msg?: unknown }).msg;
          return typeof msg === 'string' ? msg.trim() : '';
        })
        .filter(Boolean);
      if (messages.length > 0) {
        return messages.join(' ');
      }
    }
  } catch {
    // Ignore parse errors.
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

export async function listQuotas(query?: ListQuotasQuery): Promise<QuotaResponse[]> {
  const params = new URLSearchParams();
  if (query?.subjectType) params.set('subject_type', query.subjectType);
  if (query?.team) params.set('team', query.team);
  if (typeof query?.enabled === 'boolean') params.set('enabled', String(query.enabled));
  if (query?.status) params.set('status', query.status);
  const suffix = params.toString();
  return requestJson<QuotaResponse[]>(`/quotas${suffix ? `?${suffix}` : ''}`);
}

export async function createQuota(payload: QuotaUpsertRequest): Promise<QuotaResponse> {
  return requestJson<QuotaResponse>('/quotas', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export async function updateQuota(
  quotaId: string,
  payload: QuotaUpsertRequest
): Promise<QuotaResponse> {
  return requestJson<QuotaResponse>(`/quotas/${encodeURIComponent(quotaId)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export async function deleteQuota(quotaId: string): Promise<QuotaResponse> {
  return requestJson<QuotaResponse>(`/quotas/${encodeURIComponent(quotaId)}`, {
    method: 'DELETE',
  });
}

export async function getQuotaDetails(quotaId: string): Promise<QuotaDetailsResponse> {
  return requestJson<QuotaDetailsResponse>(
    `/quotas/${encodeURIComponent(quotaId)}/details`
  );
}
