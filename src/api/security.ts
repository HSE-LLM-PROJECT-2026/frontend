type ImportMetaEnvShape = ImportMeta & {
  env: Record<string, string | undefined>;
};

type RuntimeWindow = Window & {
  __APP_CONFIG__?: {
    SECURITY_API_URL?: string;
    API_BEARER_TOKEN?: string;
  };
};
import { isDemoModeEnabled } from './demoMode';

const DEFAULT_SECURITY_API_URL = 'https://audit.hse-llm-project-2026.ru';
const EXTERNAL_DOMAIN = 'hse-llm-project-2026.ru';
const API_BEARER_STORAGE_KEY = 'platform.apiBearerToken';
const REFRESH_TOKEN_STORAGE_KEY = 'platform.refreshToken';
const CURRENT_USER_STORAGE_KEY = 'platform.currentUser';
const ACCESS_TOKEN_EXPIRES_AT_STORAGE_KEY = 'platform.accessTokenExpiresAt';
const SESSION_EXPIRED_EVENT_DEBOUNCE_MS = 1500;
const BACKEND_UNAVAILABLE_MESSAGE =
  'Security service недоступен. Проверьте route/домен и состояние сервиса.';
const DEMO_MODE = isDemoModeEnabled();

function inferExternalSecurityApiUrl(): string | undefined {
  if (typeof window === 'undefined') {
    return undefined;
  }
  const protocol = window.location.protocol || 'https:';
  const host = window.location.hostname || '';
  if (host.endsWith(EXTERNAL_DOMAIN)) {
    return `${protocol}//audit.${EXTERNAL_DOMAIN}`;
  }
  return undefined;
}

export const SESSION_EXPIRED_EVENT = 'platform:session-expired';
export type SessionExpiredReason = 'token_expired' | 'unauthorized';

let lastSessionExpiredEventAt = 0;

export interface UserResponse {
  id: string;
  email: string;
  name: string;
  team: string;
  role: string;
  is_service_account: boolean;
  created_at: string;
  updated_at: string;
}

export interface TokenPairResponse {
  access_token: string;
  refresh_token: string;
  token_type: 'bearer';
  expires_in: number;
  user: UserResponse;
}

export interface RegisterRequest {
  email: string;
  password: string;
  name?: string;
}

export interface VerifyResponse {
  user_id: string;
  email: string;
  team: string;
  role: string;
  is_service_account: boolean;
  permissions: string[];
  allowed_models: string[];
  project_key?: string;
  project_roles?: string[];
  project_scopes?: string[];
  team_roles?: string[];
  team_scopes?: string[];
}

export type RoleLiteral = 'admin' | 'developer' | 'manager' | 'viewer';

export interface TeamResponse {
  id: string;
  team: string;
  description?: string | null;
  created_at: string;
  updated_at: string;
}

export interface TeamCreateRequest {
  team: string;
  description?: string;
}

export interface TeamRoleResponse {
  team: string;
  role_name: string;
  scopes: string[];
  description?: string | null;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export interface TeamRoleUpsertRequest {
  scopes: string[];
  description?: string;
}

export interface ProjectRoleResponse {
  project_key: string;
  role_name: string;
  scopes: string[];
  description?: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProjectRoleUpsertRequest {
  scopes: string[];
  description?: string;
}

export interface UserProjectRolesResponse {
  user_id: string;
  project_key: string;
  role_names: string[];
  effective_scopes: string[];
}

export interface UserTeamRolesResponse {
  user_id: string;
  team: string;
  role_names: string[];
  effective_scopes: string[];
}

export interface AuditEventResponse {
  id: string;
  user_id?: string | null;
  user_email?: string | null;
  is_service_account: boolean;
  action: string;
  resource_type?: string | null;
  resource_id?: string | null;
  details?: Record<string, unknown> | null;
  result: 'success' | 'failure';
  ip_address?: string | null;
  created_at: string;
}

export interface AuditListQuery {
  userId?: string;
  action?: string;
  resourceType?: string;
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
  offset?: number;
}

function demoNowIso(): string {
  return new Date().toISOString();
}

function demoUsers(): UserResponse[] {
  const now = demoNowIso();
  return [
    {
      id: 'demo-admin',
      email: 'demo.admin@hse-llm-project-2026.ru',
      name: 'Demo Platform Admin',
      team: 'Platform',
      role: 'admin',
      is_service_account: false,
      created_at: now,
      updated_at: now,
    },
    {
      id: 'demo-anna',
      email: 'anna.petrova@hse-llm-project-2026.ru',
      name: 'Anna Petrova',
      team: 'Data Science',
      role: 'developer',
      is_service_account: false,
      created_at: now,
      updated_at: now,
    },
    {
      id: 'demo-maksim',
      email: 'maksim.sidorov@hse-llm-project-2026.ru',
      name: 'Maksim Sidorov',
      team: 'Search',
      role: 'manager',
      is_service_account: false,
      created_at: now,
      updated_at: now,
    },
  ];
}

export function notifySessionExpired(reason: SessionExpiredReason): void {
  if (typeof window === 'undefined') {
    return;
  }

  const now = Date.now();
  if (now - lastSessionExpiredEventAt < SESSION_EXPIRED_EVENT_DEBOUNCE_MS) {
    return;
  }
  lastSessionExpiredEventAt = now;

  window.dispatchEvent(
    new CustomEvent<{ reason: SessionExpiredReason }>(SESSION_EXPIRED_EVENT, {
      detail: { reason },
    })
  );
}

function persistCurrentSessionUser(user: UserResponse): void {
  if (typeof window === 'undefined') {
    return;
  }
  window.localStorage.setItem(CURRENT_USER_STORAGE_KEY, JSON.stringify(user));
}

export function getCurrentSessionUser(): UserResponse | null {
  if (typeof window === 'undefined') {
    return null;
  }
  const raw = window.localStorage.getItem(CURRENT_USER_STORAGE_KEY);
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as UserResponse;
    if (!parsed || typeof parsed !== 'object') {
      return null;
    }
    if (typeof parsed.email !== 'string' || !parsed.email.trim()) {
      return null;
    }
    if (typeof parsed.role !== 'string' || !parsed.role.trim()) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

const runtimeSecurityApiUrl =
  typeof window !== 'undefined'
    ? (window as RuntimeWindow).__APP_CONFIG__?.SECURITY_API_URL
    : undefined;
const runtimeApiBearerToken =
  typeof window !== 'undefined'
    ? (window as RuntimeWindow).__APP_CONFIG__?.API_BEARER_TOKEN
    : undefined;

const buildTimeSecurityApiUrl = (import.meta as ImportMetaEnvShape).env.VITE_SECURITY_API_URL;
const buildTimeApiBearerToken = (import.meta as ImportMetaEnvShape).env.VITE_API_BEARER_TOKEN;

const SECURITY_API_BASE_URL =
  runtimeSecurityApiUrl ||
  buildTimeSecurityApiUrl ||
  inferExternalSecurityApiUrl() ||
  DEFAULT_SECURITY_API_URL;

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

function setAccessTokenExpiry(expiresInSeconds: number): void {
  if (typeof window === 'undefined') {
    return;
  }
  const ttlSeconds = Number.isFinite(expiresInSeconds) ? Math.max(1, Math.floor(expiresInSeconds)) : 1800;
  const expiresAt = Date.now() + ttlSeconds * 1000;
  window.localStorage.setItem(ACCESS_TOKEN_EXPIRES_AT_STORAGE_KEY, String(expiresAt));
}

function isStoredAccessTokenExpired(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }
  const raw = window.localStorage.getItem(ACCESS_TOKEN_EXPIRES_AT_STORAGE_KEY);
  if (!raw) {
    return false;
  }
  const expiresAt = Number.parseInt(raw, 10);
  if (!Number.isFinite(expiresAt)) {
    return false;
  }
  return Date.now() >= expiresAt;
}

export function getApiBearerToken(): string | null {
  const runtimeToken = normalizeBearerToken(runtimeApiBearerToken);
  if (runtimeToken) {
    return runtimeToken;
  }

  const buildToken = normalizeBearerToken(buildTimeApiBearerToken);
  if (buildToken) {
    return buildToken;
  }

  if (typeof window !== 'undefined') {
    const localStorageToken = normalizeBearerToken(
      window.localStorage.getItem(API_BEARER_STORAGE_KEY) ?? undefined
    );
    if (localStorageToken) {
      if (isStoredAccessTokenExpired()) {
        clearSecuritySession();
        notifySessionExpired('token_expired');
        return null;
      }
      return localStorageToken;
    }
  }

  return null;
}

function setApiBearerToken(rawToken: string): string | null {
  const normalizedToken = normalizeBearerToken(rawToken);
  if (!normalizedToken || typeof window === 'undefined') {
    return null;
  }
  window.localStorage.setItem(API_BEARER_STORAGE_KEY, normalizedToken);
  return normalizedToken;
}

export function hasActiveSessionToken(): boolean {
  return getApiBearerToken() !== null;
}

export function clearSecuritySession(): void {
  if (typeof window === 'undefined') {
    return;
  }
  window.localStorage.removeItem(API_BEARER_STORAGE_KEY);
  window.localStorage.removeItem(REFRESH_TOKEN_STORAGE_KEY);
  window.localStorage.removeItem(CURRENT_USER_STORAGE_KEY);
  window.localStorage.removeItem(ACCESS_TOKEN_EXPIRES_AT_STORAGE_KEY);
}

export function handleUnauthorizedResponse(
  response: Response,
  options?: { notify?: boolean }
): boolean {
  if (response.status !== 401) {
    return false;
  }
  clearSecuritySession();
  if (options?.notify !== false) {
    notifySessionExpired('unauthorized');
  }
  return true;
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
  return `${SECURITY_API_BASE_URL.replace(/\/+$/, '')}${path}`;
}

async function parseErrorMessage(response: Response): Promise<string> {
  try {
    const body = await response.json();
    if (typeof body?.detail === 'string' && body.detail.trim()) {
      return body.detail;
    }
  } catch {
    // Ignore parsing errors and use generic fallback.
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
    if (response.status === 401 && path !== '/auth/login' && path !== '/auth/register') {
      handleUnauthorizedResponse(response);
      throw new Error('Сессия истекла. Выполните вход повторно.');
    }
    throw new Error(await parseErrorMessage(response));
  }

  return (await response.json()) as T;
}

export async function login(email: string, password: string): Promise<TokenPairResponse> {
  if (DEMO_MODE) {
    const user =
      demoUsers().find((item) => item.email.toLowerCase() === String(email || '').toLowerCase()) ||
      demoUsers()[0];
    const response: TokenPairResponse = {
      access_token: `demo-access-${Date.now()}`,
      refresh_token: `demo-refresh-${Date.now()}`,
      token_type: 'bearer',
      expires_in: 60 * 60 * 24,
      user,
    };
    setApiBearerToken(response.access_token);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(REFRESH_TOKEN_STORAGE_KEY, response.refresh_token);
      persistCurrentSessionUser(response.user);
      setAccessTokenExpiry(response.expires_in);
    }
    const _unused = password;
    void _unused;
    return response;
  }

  const response = await requestJson<TokenPairResponse>('/auth/login', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, password }),
  });

  setApiBearerToken(response.access_token);
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(REFRESH_TOKEN_STORAGE_KEY, response.refresh_token);
    persistCurrentSessionUser(response.user);
    setAccessTokenExpiry(response.expires_in);
  }
  return response;
}

export async function register(payload: RegisterRequest): Promise<TokenPairResponse> {
  if (DEMO_MODE) {
    const user: UserResponse = {
      id: `demo-${Date.now()}`,
      email: payload.email.trim(),
      name: (payload.name || payload.email || 'Demo User').trim(),
      team: 'Data Science',
      role: 'developer',
      is_service_account: false,
      created_at: demoNowIso(),
      updated_at: demoNowIso(),
    };
    const response: TokenPairResponse = {
      access_token: `demo-access-${Date.now()}`,
      refresh_token: `demo-refresh-${Date.now()}`,
      token_type: 'bearer',
      expires_in: 60 * 60 * 24,
      user,
    };
    setApiBearerToken(response.access_token);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(REFRESH_TOKEN_STORAGE_KEY, response.refresh_token);
      persistCurrentSessionUser(response.user);
      setAccessTokenExpiry(response.expires_in);
    }
    return response;
  }
  const email = payload.email.trim();
  const password = payload.password;
  const name = (payload.name || '').trim() || email;

  if (!email) {
    throw new Error('Укажите email для регистрации.');
  }
  if (!password || password.length < 4) {
    throw new Error('Пароль должен содержать минимум 4 символа.');
  }


  const response = await requestJson<UserResponse>('/auth/register', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email,
      password,
      name,
    }),
  });
  if (!response) {
    throw new Error('Регистрация завершилась без ответа от сервиса.');
  }
  return login(email, password);
}

export async function listAuditEvents(query?: AuditListQuery): Promise<AuditEventResponse[]> {
  if (DEMO_MODE) {
    const now = Date.now();
    const allEvents: AuditEventResponse[] = [
      {
        id: 'audit-demo-1',
        user_id: 'demo-admin',
        user_email: 'demo.admin@hse-llm-project-2026.ru',
        is_service_account: false,
        action: 'deployment.create',
        resource_type: 'deployment',
        resource_id: 'dep-smollm2-msk',
        details: { cluster_id: 'msk-1', model: 'HuggingFaceTB/SmolLM2-1.7B-Instruct' },
        result: 'success',
        ip_address: '10.0.0.12',
        created_at: new Date(now - 15 * 60 * 1000).toISOString(),
      },
      {
        id: 'audit-demo-2',
        user_id: 'demo-maksim',
        user_email: 'maksim.sidorov@hse-llm-project-2026.ru',
        is_service_account: false,
        action: 'release.start',
        resource_type: 'release',
        resource_id: 'rel-smollm2-rollout',
        details: { cluster_id: 'spb-1', route_alias: 'assistant-main' },
        result: 'success',
        ip_address: '10.0.0.27',
        created_at: new Date(now - 42 * 60 * 1000).toISOString(),
      },
      {
        id: 'audit-demo-3',
        user_id: 'demo-anna',
        user_email: 'anna.petrova@hse-llm-project-2026.ru',
        is_service_account: false,
        action: 'quota.update',
        resource_type: 'quota',
        resource_id: 'quota-data-science',
        details: { cluster_id: 'msk-1', action: 'throttle' },
        result: 'success',
        ip_address: '10.0.0.33',
        created_at: new Date(now - 80 * 60 * 1000).toISOString(),
      },
    ];

    let filtered = allEvents;
    if (query?.userId?.trim()) {
      const value = query.userId.trim();
      filtered = filtered.filter((event) => event.user_id === value);
    }
    if (query?.action?.trim()) {
      const value = query.action.trim().toLowerCase();
      filtered = filtered.filter((event) => event.action.toLowerCase().includes(value));
    }
    if (query?.resourceType?.trim()) {
      const value = query.resourceType.trim().toLowerCase();
      filtered = filtered.filter((event) => String(event.resource_type || '').toLowerCase() === value);
    }
    const offset = Math.max(0, query?.offset ?? 0);
    const limit = Math.max(1, Math.min(query?.limit ?? 100, 500));
    return filtered.slice(offset, offset + limit);
  }
  const params = new URLSearchParams();

  const limit = Math.max(1, Math.min(query?.limit ?? 100, 500));
  const offset = Math.max(0, query?.offset ?? 0);
  params.set('limit', String(limit));
  params.set('offset', String(offset));

  if (query?.userId?.trim()) {
    params.set('user_id', query.userId.trim());
  }
  if (query?.action?.trim()) {
    params.set('action', query.action.trim());
  }
  if (query?.resourceType?.trim()) {
    params.set('resource_type', query.resourceType.trim());
  }
  if (query?.dateFrom?.trim()) {
    params.set('date_from', query.dateFrom.trim());
  }
  if (query?.dateTo?.trim()) {
    params.set('date_to', query.dateTo.trim());
  }

  return requestJson<AuditEventResponse[]>(`/audit?${params.toString()}`);
}

export async function listUsers(): Promise<UserResponse[]> {
  if (DEMO_MODE) {
    return demoUsers();
  }
  return requestJson<UserResponse[]>('/users');
}

export async function verifyCurrentPrincipal(): Promise<VerifyResponse> {
  if (DEMO_MODE) {
    const user = getCurrentSessionUser() || demoUsers()[0];
    return {
      user_id: user.id,
      email: user.email,
      team: user.team,
      role: user.role,
      is_service_account: false,
      permissions: [
        'deployments:read',
        'deployments:create',
        'deployments:delete:any',
        'traffic_routes:manage',
        'quotas:manage',
      ],
      allowed_models: ['*'],
      project_key: 'default',
      project_roles: ['owner'],
      project_scopes: ['deployments:*', 'releases:*', 'quotas:*'],
      team_roles: ['owner'],
      team_scopes: ['deployments:*', 'costs:read'],
    };
  }

  return requestJson<VerifyResponse>('/auth/verify', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({}),
  });
}

export async function updateUserTeam(userId: string, team: string): Promise<UserResponse> {

  return requestJson<UserResponse>(`/users/${encodeURIComponent(userId)}/team`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ team }),
  });
}

export async function updateUserRole(
  userId: string,
  role: RoleLiteral
): Promise<UserResponse> {

  return requestJson<UserResponse>(`/users/${encodeURIComponent(userId)}/role`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ role }),
  });
}

export async function listTeams(): Promise<TeamResponse[]> {
  if (DEMO_MODE) {
    const now = demoNowIso();
    return [
      { id: 'Platform', team: 'Platform', description: 'Platform team', created_at: now, updated_at: now },
      { id: 'Data Science', team: 'Data Science', description: 'Data Science', created_at: now, updated_at: now },
      { id: 'Search', team: 'Search', description: 'Search', created_at: now, updated_at: now },
      { id: 'Fraud', team: 'Fraud', description: 'Fraud', created_at: now, updated_at: now },
      { id: 'Vision', team: 'Vision', description: 'Vision', created_at: now, updated_at: now },
    ];
  }
  return requestJson<TeamResponse[]>('/teams');
}

export async function createTeam(payload: TeamCreateRequest): Promise<TeamResponse> {

  return requestJson<TeamResponse>('/teams', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
}

export async function listProjectRoles(): Promise<ProjectRoleResponse[]> {
  if (DEMO_MODE) {
    const now = demoNowIso();
    return [
      {
        project_key: 'default',
        role_name: 'owner',
        scopes: ['deployments:*', 'releases:*', 'quotas:*', 'access:*'],
        description: 'Full project access',
        created_at: now,
        updated_at: now,
      },
      {
        project_key: 'default',
        role_name: 'developer',
        scopes: ['deployments:read', 'deployments:create', 'releases:read'],
        description: 'Developer role',
        created_at: now,
        updated_at: now,
      },
    ];
  }
  return requestJson<ProjectRoleResponse[]>('/project/roles');
}

export async function upsertProjectRole(
  roleName: string,
  payload: ProjectRoleUpsertRequest
): Promise<ProjectRoleResponse> {

  return requestJson<ProjectRoleResponse>(`/project/roles/${encodeURIComponent(roleName)}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
}

export async function deleteProjectRole(roleName: string): Promise<void> {

  await requestJson<{ status: string }>(`/project/roles/${encodeURIComponent(roleName)}`, {
    method: 'DELETE',
  });
}

export async function getUserProjectRoles(userId: string): Promise<UserProjectRolesResponse> {

  return requestJson<UserProjectRolesResponse>(`/users/${encodeURIComponent(userId)}/project-roles`);
}

export async function putUserProjectRoles(
  userId: string,
  roleNames: string[]
): Promise<UserProjectRolesResponse> {

  return requestJson<UserProjectRolesResponse>(`/users/${encodeURIComponent(userId)}/project-roles`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ role_names: roleNames }),
  });
}

export async function listTeamRoles(teamName: string): Promise<TeamRoleResponse[]> {

  return requestJson<TeamRoleResponse[]>(
    `/teams/${encodeURIComponent(teamName)}/roles`
  );
}

export async function upsertTeamRole(
  teamName: string,
  roleName: string,
  payload: TeamRoleUpsertRequest
): Promise<TeamRoleResponse> {

  return requestJson<TeamRoleResponse>(
    `/teams/${encodeURIComponent(teamName)}/roles/${encodeURIComponent(roleName)}`,
    {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    }
  );
}

export async function deleteTeamRole(teamName: string, roleName: string): Promise<void> {

  await requestJson<{ status: string }>(
    `/teams/${encodeURIComponent(teamName)}/roles/${encodeURIComponent(roleName)}`,
    {
      method: 'DELETE',
    }
  );
}

export async function getUserTeamRoles(
  userId: string,
  teamName: string
): Promise<UserTeamRolesResponse> {

  const params = new URLSearchParams();
  params.set('team', teamName);
  return requestJson<UserTeamRolesResponse>(
    `/users/${encodeURIComponent(userId)}/team-roles?${params.toString()}`
  );
}

export async function putUserTeamRoles(
  userId: string,
  teamName: string,
  roleNames: string[]
): Promise<UserTeamRolesResponse> {

  const params = new URLSearchParams();
  params.set('team', teamName);
  return requestJson<UserTeamRolesResponse>(
    `/users/${encodeURIComponent(userId)}/team-roles?${params.toString()}`,
    {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ role_names: roleNames }),
    }
  );
}
