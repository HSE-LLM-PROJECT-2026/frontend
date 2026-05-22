import { API_BASE_URL, getApiBearerToken } from './deployments';
import { handleUnauthorizedResponse } from './security';
import { isDemoModeEnabled } from './demoMode';

export type CostPeriod = '24h' | '7d' | '30d';

export type CostEntry = {
  id: string;
  deploymentId: string;
  modelName: string;
  team: string;
  product: string;
  inputTokens: number;
  outputTokens: number;
  cost: number;
  timestamp: string;
};

export type ModelRate = {
  modelName: string;
  inputPricePer1M: number;
  outputPricePer1M: number;
  wattsPerReplica: number;
};

export type EnergyTelemetry = {
  deployment_id: string;
  model_name: string;
  model_version: string;
  inference_mode: 'cpu' | 'gpu';
  cluster_id: string;
  node_name: string;
  device_type: string;
  timestamp: string;
  power_watts_current: number;
  gpu_utilization_percent: number;
  cpu_utilization_percent: number;
  ram_used_bytes: number;
  vram_used_bytes: number;
  energy_kwh_1h: number;
  energy_kwh_24h: number;
  energy_kwh_period: number;
  uptime_seconds: number;
  requests_count: number;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  tokens_per_second: number;
  energy_per_request_wh: number;
  energy_per_1k_tokens_wh: number;
  cost_per_request: number;
  cost_per_1k_tokens: number;
  electricity_price_per_kwh: number;
  currency: 'RUB';
  cost_1h: number;
  cost_24h: number;
  cost_period_total: number;
  data_source: string;
  is_estimated: boolean;
  last_updated_at: string;
  sampling_interval_sec: number;
};

export type EnergyTimeSeries = {
  timestamp: string;
  power_watts: number;
  cost: number;
};

export type NodeMetrics = {
  node_name: string;
  cpu_percent: number;
  ram_percent: number;
  gpu_percent: number;
  power_watts: number;
  status: 'online' | 'offline';
};

export type NodeTokenCost = {
  node_name: string;
  period: CostPeriod;
  deployments_count: number;
  total_tokens: number;
  total_cost_rub: number;
  cost_per_1k_tokens_rub?: number | null;
  is_estimated: boolean;
  estimated_reason?: string | null;
  currency: 'RUB';
};

export type CostSummary = {
  totalCost: number;
  inferenceCost: number;
  energyCost: number;
  totalTokens: number;
  chartData: Array<{ date: string; cost: number }>;
  avgCostPerRequest: number;
};

type ElectricityPriceResponse = {
  price: number;
  currency: 'RUB';
};

const DEMO_MODE = isDemoModeEnabled();
let demoElectricityPrice = 8.1;
const DEMO_MODEL_RATES: ModelRate[] = [
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
    inputPricePer1M: 20,
    outputPricePer1M: 24.5,
    wattsPerReplica: 450,
  },
  {
    modelName: 'HuggingFaceTB/SmolVLM2-2.2B-Instruct',
    inputPricePer1M: 24,
    outputPricePer1M: 28,
    wattsPerReplica: 480,
  },
];

const DEMO_NODE_METRICS: NodeMetrics[] = [
  { node_name: 'gpu-worker-1', cpu_percent: 53, ram_percent: 59, gpu_percent: 76, power_watts: 720, status: 'online' },
  { node_name: 'worker-1', cpu_percent: 42, ram_percent: 44, gpu_percent: 0, power_watts: 182, status: 'online' },
  { node_name: 'worker-2', cpu_percent: 32, ram_percent: 30, gpu_percent: 0, power_watts: 154, status: 'online' },
  { node_name: 'gpu-worker-2', cpu_percent: 49, ram_percent: 57, gpu_percent: 52, power_watts: 688, status: 'online' },
  { node_name: 'worker-3', cpu_percent: 43, ram_percent: 47, gpu_percent: 0, power_watts: 168, status: 'online' },
  { node_name: 'srv-small-1', cpu_percent: 34, ram_percent: 38, gpu_percent: 0, power_watts: 132, status: 'online' },
  { node_name: 'srv-small-2', cpu_percent: 24, ram_percent: 27, gpu_percent: 0, power_watts: 118, status: 'online' },
];

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function demoSeries(period: CostPeriod): EnergyTimeSeries[] {
  const points = period === '24h' ? 48 : period === '7d' ? 84 : 120;
  const stepMinutes = period === '24h' ? 30 : period === '7d' ? 120 : 360;
  const basePower = DEMO_NODE_METRICS.reduce((acc, node) => acc + node.power_watts, 0);
  const series: EnergyTimeSeries[] = [];
  for (let idx = points - 1; idx >= 0; idx -= 1) {
    const timestamp = new Date(Date.now() - idx * stepMinutes * 60 * 1000);
    const drift = Math.sin(idx * 0.35) * 120 + Math.cos(idx * 0.11) * 64;
    const power = Math.max(220, Number((basePower + drift).toFixed(2)));
    const hours = stepMinutes / 60;
    const cost = Number(((power / 1000) * demoElectricityPrice * hours).toFixed(6));
    series.push({
      timestamp: timestamp.toISOString(),
      power_watts: power,
      cost,
    });
  }
  return series;
}

function buildUrl(path: string): string {
  return `${API_BASE_URL.replace(/\/+$/, '')}${path}`;
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
    if (Array.isArray(body?.detail) && body.detail.length > 0) {
      return body.detail
        .map((item) => item?.msg || item?.message || JSON.stringify(item))
        .filter(Boolean)
        .join('; ');
    }
  } catch {
    // Use fallback below.
  }
  return `Backend вернул ошибку ${response.status}.`;
}

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(buildUrl(path), withAuthHeaders(init));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'network error';
    throw new Error(`Backend недоступен: ${message}`);
  }

  if (handleUnauthorizedResponse(response)) {
    throw new Error('Сессия истекла. Войдите снова.');
  }
  if (!response.ok) {
    throw new Error(await parseErrorMessage(response));
  }
  return (await response.json()) as T;
}

export async function getCostHistory(): Promise<CostEntry[]> {
  if (DEMO_MODE) {
    const energy = demoSeries('24h');
    return energy.map((point, index) => {
      const wave = Math.sin(index * 0.41);
      const inputTokens = Math.max(1_200, Math.round(18_000 + wave * 2_600));
      const outputTokens = Math.max(900, Math.round(11_000 + wave * 1_900));
      const cost = Number((19 + wave * 3.4).toFixed(3));
      return {
        id: `demo-cost-${index}`,
        deploymentId: index % 2 === 0 ? 'dep-smollm2-msk' : 'dep-qwen-spb',
        modelName:
          index % 2 === 0
            ? 'HuggingFaceTB/SmolLM2-1.7B-Instruct'
            : 'Qwen/Qwen2.5-3B-Instruct',
        team: index % 2 === 0 ? 'Data Science' : 'Search',
        product: index % 2 === 0 ? 'Assistant API' : 'Semantic Search',
        inputTokens,
        outputTokens,
        cost,
        timestamp: point.timestamp,
      };
    });
  }
  return fetchJson<CostEntry[]>('/costs/history');
}

export async function getModelRates(): Promise<ModelRate[]> {
  if (DEMO_MODE) {
    return deepClone(DEMO_MODEL_RATES);
  }
  return fetchJson<ModelRate[]>('/costs/model-rates');
}

export async function getCostSummary(): Promise<CostSummary> {
  if (DEMO_MODE) {
    const history = await getCostHistory();
    const totalCost = history.reduce((acc, item) => acc + item.cost, 0);
    const totalTokens = history.reduce(
      (acc, item) => acc + Number(item.inputTokens || 0) + Number(item.outputTokens || 0),
      0
    );
    return {
      totalCost: Number(totalCost.toFixed(3)),
      inferenceCost: Number((totalCost * 0.81).toFixed(3)),
      energyCost: Number((totalCost * 0.19).toFixed(3)),
      totalTokens,
      chartData: history.map((item) => ({
        date: item.timestamp.slice(0, 16),
        cost: item.cost,
      })),
      avgCostPerRequest: Number((totalCost / Math.max(1, history.length * 24)).toFixed(6)),
    };
  }
  return fetchJson<CostSummary>('/costs/summary');
}

export async function getElectricityPrice(): Promise<number> {
  if (DEMO_MODE) {
    return demoElectricityPrice;
  }
  const payload = await fetchJson<ElectricityPriceResponse>('/costs/electricity-price');
  return payload.price;
}

export async function updateModelRate(
  modelName: string,
  inputPrice: number,
  outputPrice: number,
  watts: number
): Promise<void> {
  if (DEMO_MODE) {
    const existing = DEMO_MODEL_RATES.find((item) => item.modelName === modelName);
    if (existing) {
      existing.inputPricePer1M = Number(inputPrice);
      existing.outputPricePer1M = Number(outputPrice);
      existing.wattsPerReplica = Number(watts);
    } else {
      DEMO_MODEL_RATES.push({
        modelName,
        inputPricePer1M: Number(inputPrice),
        outputPricePer1M: Number(outputPrice),
        wattsPerReplica: Number(watts),
      });
    }
    return;
  }
  await fetchJson<ModelRate>('/costs/model-rates', {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      modelName,
      inputPricePer1M: inputPrice,
      outputPricePer1M: outputPrice,
      wattsPerReplica: watts,
    }),
  });
}

export async function updateElectricityPrice(price: number): Promise<void> {
  if (DEMO_MODE) {
    demoElectricityPrice = Number(price);
    return;
  }
  await fetchJson<ElectricityPriceResponse>('/costs/electricity-price', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ price }),
  });
}

export async function getEnergyTelemetry(): Promise<EnergyTelemetry[]> {
  if (DEMO_MODE) {
    return DEMO_NODE_METRICS.map((node, index) => {
      const now = new Date(Date.now() - index * 45_000).toISOString();
      return {
        deployment_id: index % 2 === 0 ? 'dep-smollm2-msk' : 'dep-qwen-spb',
        model_name:
          index % 2 === 0
            ? 'HuggingFaceTB/SmolLM2-1.7B-Instruct'
            : 'Qwen/Qwen2.5-3B-Instruct',
        model_version: 'latest',
        inference_mode: node.gpu_percent > 0 ? 'gpu' : 'cpu',
        cluster_id: node.node_name.includes('spb')
          ? 'spb-1'
          : node.node_name.includes('srv-small')
          ? 'ekb-1'
          : 'msk-1',
        node_name: node.node_name,
        device_type: node.gpu_percent > 0 ? 'gpu' : 'cpu',
        timestamp: now,
        power_watts_current: node.power_watts,
        gpu_utilization_percent: node.gpu_percent,
        cpu_utilization_percent: node.cpu_percent,
        ram_used_bytes: Math.round(node.ram_percent * 2.4 * 1024 ** 3),
        vram_used_bytes: Math.round(node.gpu_percent * 0.52 * 1024 ** 3),
        energy_kwh_1h: Number((node.power_watts / 1000).toFixed(4)),
        energy_kwh_24h: Number(((node.power_watts / 1000) * 24).toFixed(4)),
        energy_kwh_period: Number(((node.power_watts / 1000) * 24).toFixed(4)),
        uptime_seconds: 86400 * 9,
        requests_count: 4200 + index * 390,
        prompt_tokens: 520000 + index * 24000,
        completion_tokens: 410000 + index * 18000,
        total_tokens: 930000 + index * 42000,
        tokens_per_second: Number((67 + index * 4.2).toFixed(2)),
        energy_per_request_wh: Number((node.power_watts / 1000 / 62).toFixed(6)),
        energy_per_1k_tokens_wh: Number((node.power_watts / 18).toFixed(6)),
        cost_per_request: Number(((node.power_watts / 1000) * demoElectricityPrice / 62).toFixed(6)),
        cost_per_1k_tokens: Number(((node.power_watts / 1000) * demoElectricityPrice / 18).toFixed(6)),
        electricity_price_per_kwh: demoElectricityPrice,
        currency: 'RUB',
        cost_1h: Number(((node.power_watts / 1000) * demoElectricityPrice).toFixed(6)),
        cost_24h: Number(((node.power_watts / 1000) * demoElectricityPrice * 24).toFixed(6)),
        cost_period_total: Number(((node.power_watts / 1000) * demoElectricityPrice * 24).toFixed(6)),
        data_source: 'demo-simulator',
        is_estimated: false,
        last_updated_at: now,
        sampling_interval_sec: 30,
      };
    });
  }
  return fetchJson<EnergyTelemetry[]>('/energy/telemetry');
}

export async function getEnergyHistory(period: string): Promise<EnergyTimeSeries[]> {
  if (DEMO_MODE) {
    const normalized: CostPeriod =
      period === '7d' || period === '30d' || period === '24h' ? period : '24h';
    return demoSeries(normalized);
  }
  const params = new URLSearchParams({ period });
  return fetchJson<EnergyTimeSeries[]>(`/energy/history?${params.toString()}`);
}

export async function getNodeMetrics(): Promise<NodeMetrics[]> {
  if (DEMO_MODE) {
    return deepClone(DEMO_NODE_METRICS);
  }
  return fetchJson<NodeMetrics[]>('/energy/nodes');
}

export async function getNodeTokenCost(period: CostPeriod = '24h'): Promise<NodeTokenCost[]> {
  if (DEMO_MODE) {
    const multiplier = period === '7d' ? 7 : period === '30d' ? 30 : 1;
    return DEMO_NODE_METRICS.map((node) => ({
      node_name: node.node_name,
      period,
      deployments_count: node.gpu_percent > 0 ? 2 : 1,
      total_tokens: Math.round((630_000 + node.cpu_percent * 7_800) * multiplier),
      total_cost_rub: Number(((92 + node.power_watts * 0.031) * multiplier).toFixed(2)),
      cost_per_1k_tokens_rub: Number((0.17 + node.cpu_percent * 0.0018).toFixed(4)),
      is_estimated: false,
      estimated_reason: null,
      currency: 'RUB',
    }));
  }
  const params = new URLSearchParams({ period });
  return fetchJson<NodeTokenCost[]>(`/costs/node-token-cost?${params.toString()}`);
}
