import { API_BASE_URL } from './deployments';
import { getApiBearerToken } from './security';
import type { DeploymentResponse } from './deployments';
import type { ClusterSummary, NodeSummary } from './infrastructure';
import type {
  CostEntry,
  CostSummary,
  EnergyTelemetry,
  EnergyTimeSeries,
  ModelRate,
  NodeMetrics,
  NodeTokenCost,
} from './finops';

export type RealtimeScope =
  | 'deployments'
  | 'clusters'
  | 'nodes'
  | 'infrastructure'
  | 'costs'
  | 'releases'
  | 'all';

export interface RealtimeCostsPayload {
  cost_history?: CostEntry[];
  model_rates?: ModelRate[];
  cost_summary?: CostSummary;
  electricity_price?: number;
  energy_telemetry?: EnergyTelemetry[];
  energy_history?: EnergyTimeSeries[];
  node_metrics?: NodeMetrics[];
  node_token_cost?: NodeTokenCost[];
}

export interface RealtimeSocketOptions {
  scope: RealtimeScope | RealtimeScope[];
  clusterId?: string | null;
  deploymentId?: string | null;
  intervalSeconds?: number;
}

export interface RealtimeStatePayload {
  deployments?: DeploymentResponse[];
  clusters?: ClusterSummary[];
  nodes_by_cluster?: Record<string, NodeSummary[]>;
  costs?: RealtimeCostsPayload;
  releases?: Record<string, unknown>[];
}

export type RealtimeSocketMessage =
  | {
      type: 'connected';
      scope?: string[];
      interval_seconds?: number;
      cluster_id?: string | null;
      deployment_id?: string | null;
      updated_at?: string;
    }
  | {
      type: 'state_snapshot';
      scope?: string[];
      payload: RealtimeStatePayload;
      updated_at?: string;
    }
  | {
      type: 'heartbeat' | 'pong';
      updated_at?: string;
    }
  | {
      type: 'error';
      status_code?: number;
      message: string;
    };

function toScopeParam(scope: RealtimeSocketOptions['scope']): string {
  if (Array.isArray(scope)) {
    const normalized = scope.map((item) => String(item || '').trim()).filter(Boolean);
    return normalized.join(',');
  }
  return String(scope || '').trim() || 'deployments';
}

function normalizeAccessToken(rawToken: string | null): string | null {
  const token = String(rawToken || '').trim();
  if (!token) return null;
  return token.replace(/^bearer\s+/i, '').trim() || null;
}

export function buildRealtimeSocketUrl(options: RealtimeSocketOptions): string {
  const base = new URL(API_BASE_URL.replace(/\/+$/, ''));
  base.protocol = base.protocol === 'https:' ? 'wss:' : 'ws:';
  base.pathname = `${base.pathname.replace(/\/+$/, '')}/ws/state`;
  base.search = '';

  const params = base.searchParams;
  params.set('scope', toScopeParam(options.scope));

  const clusterId = String(options.clusterId || '').trim();
  if (clusterId) {
    params.set('cluster_id', clusterId);
  }

  const deploymentId = String(options.deploymentId || '').trim();
  if (deploymentId) {
    params.set('deployment_id', deploymentId);
  }

  if (options.intervalSeconds && Number.isFinite(options.intervalSeconds)) {
    params.set('interval_seconds', String(options.intervalSeconds));
  }

  const token = normalizeAccessToken(getApiBearerToken());
  if (token) {
    params.set('token', token);
  }

  return base.toString();
}

export function parseRealtimeSocketMessage(rawData: unknown): RealtimeSocketMessage | null {
  if (typeof rawData !== 'string') {
    return null;
  }
  try {
    const payload = JSON.parse(rawData) as RealtimeSocketMessage;
    if (!payload || typeof payload !== 'object') {
      return null;
    }
    if (typeof (payload as { type?: unknown }).type !== 'string') {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}
