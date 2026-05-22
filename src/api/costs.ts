import { API_BASE_URL } from './deployments';
import {
  getApiBearerToken as getSharedApiBearerToken,
  handleUnauthorizedResponse,
} from './security';

const COSTS_API_UNAVAILABLE_MESSAGE =
  'Сервис расчета стоимости недоступен.';

export type CostPeriod = '24h' | '7d' | '30d';
export type CostDataSource = 'backend';

export interface CostRegion {
  id: string;
  label: string;
  currency: 'RUB';
  default_price_per_kwh: number;
}

export interface CostCalculatorQuery {
  period: CostPeriod;
  region: string;
  cluster_id: string | 'all';
  team: string | 'all';
  electricity_price_per_kwh: number;
  pue: number;
  currency: 'RUB';
}

export interface CostCalculatorSummary {
  total_cost: number;
  total_energy_kwh: number;
  total_requests: number;
  total_tokens: number;
  average_power_watts: number;
  cost_per_1k_tokens: number;
  cost_per_request: number;
  period_hours: number;
}

export interface CostCalculatorTimeseriesPoint {
  timestamp: string;
  label: string;
  total_cost: number;
  deployment_costs: Record<string, number>;
}

export interface DeploymentCostBreakdown {
  deployment_id: string;
  deployment_name: string;
  model_name: string;
  team: string;
  cluster_id: string;
  device_type: 'cpu' | 'gpu';
  avg_power_watts: number;
  uptime_hours: number;
  energy_kwh: number;
  energy_cost: number;
  total_cost: number;
  requests: number;
  tokens: number;
  share_percent: number;
}

export interface CostSlice {
  key: string;
  label: string;
  total_cost: number;
  share_percent: number;
}

export interface CostCalculatorReport {
  source: CostDataSource;
  generated_at: string;
  query: CostCalculatorQuery;
  summary: CostCalculatorSummary;
  deployments: DeploymentCostBreakdown[];
  timeseries: CostCalculatorTimeseriesPoint[];
  team_breakdown: CostSlice[];
  cluster_breakdown: CostSlice[];
  available_teams: string[];
  available_clusters: string[];
  info_message?: string | null;
}

export const COST_REGIONS: CostRegion[] = [
  {
    id: 'moscow-1',
    label: 'Moscow Region',
    currency: 'RUB',
    default_price_per_kwh: 8.2,
  },
  {
    id: 'spb-1',
    label: 'Saint Petersburg',
    currency: 'RUB',
    default_price_per_kwh: 7.8,
  },
  {
    id: 'kazan-1',
    label: 'Kazan',
    currency: 'RUB',
    default_price_per_kwh: 6.9,
  },
  {
    id: 'ekb-1',
    label: 'Yekaterinburg',
    currency: 'RUB',
    default_price_per_kwh: 6.5,
  },
];

function withAuthHeaders(init?: RequestInit): RequestInit {
  const headers = new Headers(init?.headers);
  if (!headers.has('Authorization')) {
    const token = getSharedApiBearerToken();
    if (token) {
      headers.set('Authorization', token);
    }
  }
  return {
    ...init,
    headers,
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function round(value: number, fractionDigits = 2): number {
  return Number(value.toFixed(fractionDigits));
}

async function parseErrorMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { detail?: string };
    if (typeof body.detail === 'string' && body.detail.trim()) {
      return body.detail;
    }
  } catch {
    // ignore parse errors
  }
  return `Запрос завершился с ошибкой, статус ${response.status}.`;
}

function normalizeQuery(query: CostCalculatorQuery): CostCalculatorQuery {
  return {
    period: query.period,
    region: query.region,
    cluster_id: query.cluster_id || 'all',
    team: query.team || 'all',
    electricity_price_per_kwh: clamp(query.electricity_price_per_kwh, 0.1, 1000),
    pue: clamp(query.pue, 1, 3),
    currency: 'RUB',
  };
}

function buildUrl(path: string): string {
  return `${API_BASE_URL.replace(/\/+$/, '')}${path}`;
}

export async function getCostCalculatorReport(
  rawQuery: CostCalculatorQuery
): Promise<CostCalculatorReport> {
  const query = normalizeQuery(rawQuery);

  let response: Response;
  try {
    response = await fetch(
      buildUrl('/costs/calculator/report'),
      withAuthHeaders({
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(query),
      })
    );
  } catch {
    throw new Error(COSTS_API_UNAVAILABLE_MESSAGE);
  }

  if (response.status === 401 || response.status === 403) {
    handleUnauthorizedResponse(response);
  }

  if (!response.ok) {
    throw new Error(await parseErrorMessage(response));
  }

  const payload = (await response.json()) as CostCalculatorReport;
  if (!payload || typeof payload !== 'object') {
    throw new Error('Сервис расчета стоимости вернул неожиданный ответ.');
  }
  return payload;
}
