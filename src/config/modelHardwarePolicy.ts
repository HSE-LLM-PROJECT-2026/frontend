import type { NodeSummary } from '../api/infrastructure';
import {
  ALLOWED_DEPLOY_MODELS,
  DEFAULT_CPU_DEPLOY_MODELS,
  sortedUniqueStrings,
} from './modelCatalog';

const MODEL_HARDWARE_POLICY_STORAGE_KEY = 'platform.modelHardwarePolicy.v1';

export const MODEL_HARDWARE_POLICY_UPDATED_EVENT =
  'platform:model-hardware-policy-updated';

export type HardwareMode = 'cpu' | 'gpu';

export interface ModelHardwarePolicy {
  defaultCpuMemoryRequest: string;
  defaultGpuMemoryRequest: string;
  allCpuModels: string[];
  allGpuModels: string[];
  cpuTypeModels: Record<string, string[]>;
  gpuTypeModels: Record<string, string[]>;
  cpuModelMemoryRequests: Record<string, string>;
  gpuModelMemoryRequests: Record<string, string>;
  updatedAt: string;
}

export interface BackendModelHardwarePolicy {
  default_cpu_memory_request: string;
  default_gpu_memory_request: string;
  all_cpu_models: string[];
  all_gpu_models: string[];
  cpu_type_models: Record<string, string[]>;
  gpu_type_models: Record<string, string[]>;
  cpu_model_memory_requests: Record<string, string>;
  gpu_model_memory_requests: Record<string, string>;
  updated_at?: string;
  updated_by_user_id?: string | null;
  updated_by_user_email?: string | null;
}

export interface BackendModelHardwarePolicyUpdateRequest {
  default_cpu_memory_request: string;
  default_gpu_memory_request: string;
  all_cpu_models: string[];
  all_gpu_models: string[];
  cpu_type_models: Record<string, string[]>;
  gpu_type_models: Record<string, string[]>;
  cpu_model_memory_requests: Record<string, string>;
  gpu_model_memory_requests: Record<string, string>;
}

function createDefaultModelHardwarePolicy(): ModelHardwarePolicy {
  const now = new Date().toISOString();
  return {
    defaultCpuMemoryRequest: '6Gi',
    defaultGpuMemoryRequest: '6Gi',
    allCpuModels: [...DEFAULT_CPU_DEPLOY_MODELS],
    allGpuModels: [...ALLOWED_DEPLOY_MODELS],
    cpuTypeModels: {},
    gpuTypeModels: {},
    cpuModelMemoryRequests: {},
    gpuModelMemoryRequests: {},
    updatedAt: now,
  };
}

function sanitizeMemoryQuantity(value: unknown): string {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  if (!/^\d+(\.\d+)?\s*(Ki|Mi|Gi|Ti|Pi|Ei|K|M|G|T|P|E)?$/i.test(raw)) {
    return '';
  }
  return raw.replace(/\s+/g, '');
}

function sanitizeModelList(values: string[]): string[] {
  const allowed = new Set(ALLOWED_DEPLOY_MODELS);
  return sortedUniqueStrings(values).filter((model) => allowed.has(model));
}

function sanitizeCpuModelList(values: string[]): string[] {
  const allowedCpu = new Set(DEFAULT_CPU_DEPLOY_MODELS);
  return sanitizeModelList(values).filter((model) => allowedCpu.has(model));
}

function sanitizeTypeName(rawType: string): string {
  return rawType.trim();
}

function normalizeTypeModelMap(
  input: unknown,
  options?: {
    allowedModels?: Set<string>;
  }
): Record<string, string[]> {
  if (!input || typeof input !== 'object') {
    return {};
  }

  const allowedModels = options?.allowedModels;
  const result: Record<string, string[]> = {};
  Object.entries(input as Record<string, unknown>).forEach(([rawType, rawModels]) => {
    const typeName = sanitizeTypeName(rawType);
    if (!typeName) {
      return;
    }
    if (!Array.isArray(rawModels)) {
      return;
    }
    const normalizedModels = sanitizeModelList(
      rawModels.filter((value): value is string => typeof value === 'string')
    ).filter((model) => !allowedModels || allowedModels.has(model));
    if (normalizedModels.length === 0) {
      return;
    }
    result[typeName] = normalizedModels;
  });

  return result;
}

function normalizeUpdatedAt(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) {
    return new Date().toISOString();
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return new Date().toISOString();
  }
  return parsed.toISOString();
}

function normalizeModelMemoryMap(
  input: unknown
): Record<string, string> {
  if (!input || typeof input !== 'object') {
    return {};
  }

  const result: Record<string, string> = {};
  Object.entries(input as Record<string, unknown>).forEach(([rawModelName, rawQuantity]) => {
    const modelName = String(rawModelName || '').trim();
    if (!ALLOWED_DEPLOY_MODELS.includes(modelName)) {
      return;
    }
    const quantity = sanitizeMemoryQuantity(rawQuantity);
    if (!quantity) {
      return;
    }
    result[modelName] = quantity;
  });
  return result;
}

export function normalizeModelHardwarePolicy(
  input: Partial<ModelHardwarePolicy> | null | undefined
): ModelHardwarePolicy {
  const defaults = createDefaultModelHardwarePolicy();

  if (!input) {
    return defaults;
  }

  const allCpuModels = Array.isArray(input.allCpuModels)
    ? sanitizeCpuModelList(input.allCpuModels)
    : defaults.allCpuModels;

  const allGpuModels = Array.isArray(input.allGpuModels)
    ? sanitizeModelList(input.allGpuModels)
    : defaults.allGpuModels;

  const defaultCpuMemoryRequest =
    sanitizeMemoryQuantity(input.defaultCpuMemoryRequest) || defaults.defaultCpuMemoryRequest;
  const defaultGpuMemoryRequest =
    sanitizeMemoryQuantity(input.defaultGpuMemoryRequest) || defaults.defaultGpuMemoryRequest;

  return {
    defaultCpuMemoryRequest,
    defaultGpuMemoryRequest,
    allCpuModels,
    allGpuModels,
    cpuTypeModels: normalizeTypeModelMap(input.cpuTypeModels, {
      allowedModels: new Set(DEFAULT_CPU_DEPLOY_MODELS),
    }),
    gpuTypeModels: normalizeTypeModelMap(input.gpuTypeModels),
    cpuModelMemoryRequests: normalizeModelMemoryMap(input.cpuModelMemoryRequests),
    gpuModelMemoryRequests: normalizeModelMemoryMap(input.gpuModelMemoryRequests),
    updatedAt: normalizeUpdatedAt(input.updatedAt),
  };
}

export function fromBackendModelHardwarePolicy(
  input: BackendModelHardwarePolicy
): ModelHardwarePolicy {
  return normalizeModelHardwarePolicy({
    defaultCpuMemoryRequest: input.default_cpu_memory_request,
    defaultGpuMemoryRequest: input.default_gpu_memory_request,
    allCpuModels: input.all_cpu_models,
    allGpuModels: input.all_gpu_models,
    cpuTypeModels: input.cpu_type_models,
    gpuTypeModels: input.gpu_type_models,
    cpuModelMemoryRequests: input.cpu_model_memory_requests,
    gpuModelMemoryRequests: input.gpu_model_memory_requests,
    updatedAt: input.updated_at,
  });
}

export function toBackendModelHardwarePolicyUpdate(
  input: Partial<ModelHardwarePolicy> | null | undefined
): BackendModelHardwarePolicyUpdateRequest {
  const normalized = normalizeModelHardwarePolicy(input);
  return {
    default_cpu_memory_request: normalized.defaultCpuMemoryRequest,
    default_gpu_memory_request: normalized.defaultGpuMemoryRequest,
    all_cpu_models: normalized.allCpuModels,
    all_gpu_models: normalized.allGpuModels,
    cpu_type_models: normalized.cpuTypeModels,
    gpu_type_models: normalized.gpuTypeModels,
    cpu_model_memory_requests: normalized.cpuModelMemoryRequests,
    gpu_model_memory_requests: normalized.gpuModelMemoryRequests,
  };
}

export function readModelHardwarePolicy(): ModelHardwarePolicy {
  if (typeof window === 'undefined') {
    return createDefaultModelHardwarePolicy();
  }

  const raw = window.localStorage.getItem(MODEL_HARDWARE_POLICY_STORAGE_KEY);
  if (!raw) {
    const defaults = createDefaultModelHardwarePolicy();
    window.localStorage.setItem(MODEL_HARDWARE_POLICY_STORAGE_KEY, JSON.stringify(defaults));
    return defaults;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<ModelHardwarePolicy>;
    const normalized = normalizeModelHardwarePolicy(parsed);
    window.localStorage.setItem(MODEL_HARDWARE_POLICY_STORAGE_KEY, JSON.stringify(normalized));
    return normalized;
  } catch {
    const defaults = createDefaultModelHardwarePolicy();
    window.localStorage.setItem(MODEL_HARDWARE_POLICY_STORAGE_KEY, JSON.stringify(defaults));
    return defaults;
  }
}

export function saveModelHardwarePolicy(
  input: Partial<ModelHardwarePolicy>
): ModelHardwarePolicy {
  const providedUpdatedAt = typeof input.updatedAt === 'string' ? input.updatedAt : '';
  const normalized = normalizeModelHardwarePolicy({
    ...input,
    updatedAt: providedUpdatedAt.trim() || new Date().toISOString(),
  });

  if (typeof window !== 'undefined') {
    window.localStorage.setItem(MODEL_HARDWARE_POLICY_STORAGE_KEY, JSON.stringify(normalized));
    window.dispatchEvent(new CustomEvent(MODEL_HARDWARE_POLICY_UPDATED_EVENT));
  }

  return normalized;
}

function normalizeCpuType(cpuModel: string): string {
  return cpuModel.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function inferCpuTypeFromNode(
  node: Pick<NodeSummary, 'cpuModel' | 'gpu'>
): string | null {
  if (node.gpu) {
    return null;
  }

  const fromCpuModel = normalizeCpuType(String(node.cpuModel || ''));
  return fromCpuModel || null;
}

export function inferGpuTypeFromNode(node: Pick<NodeSummary, 'gpu'>): string | null {
  const model = node.gpu?.model?.trim();
  return model || null;
}

export function collectCpuTypes(
  nodes: Array<Pick<NodeSummary, 'cpuModel' | 'gpu'>>
): string[] {
  return sortedUniqueStrings(
    nodes
      .map((node) => inferCpuTypeFromNode(node))
      .filter((item): item is string => Boolean(item))
  );
}

export function collectGpuTypes(
  nodes: Array<Pick<NodeSummary, 'gpu'>>
): string[] {
  return sortedUniqueStrings(
    nodes
      .map((node) => inferGpuTypeFromNode(node))
      .filter((item): item is string => Boolean(item))
  );
}

export function resolveModelsForHardwarePolicy(
  policyInput: Partial<ModelHardwarePolicy> | null | undefined,
  params: {
    mode: HardwareMode;
    nodes: NodeSummary[];
    selectedNodeName?: string | null;
  }
): string[] {
  const policy = normalizeModelHardwarePolicy(policyInput);
  const mode = params.mode;
  const selectedNodeName = (params.selectedNodeName || '').trim();

  const baseModels =
    mode === 'cpu' ? [...policy.allCpuModels] : [...policy.allGpuModels];

  const scopedRules = mode === 'cpu' ? policy.cpuTypeModels : policy.gpuTypeModels;

  const typeSet = new Set<string>();

  if (selectedNodeName) {
    const selectedNode = params.nodes.find((node) => node.name === selectedNodeName);
    if (selectedNode) {
      const selectedType =
        mode === 'cpu'
          ? inferCpuTypeFromNode(selectedNode)
          : inferGpuTypeFromNode(selectedNode);
      if (selectedType) {
        typeSet.add(selectedType);
      }
    }
  }

  if (typeSet.size === 0) {
    if (mode === 'cpu') {
      collectCpuTypes(params.nodes).forEach((item) => typeSet.add(item));
    } else {
      collectGpuTypes(params.nodes).forEach((item) => typeSet.add(item));
    }
  }

  const merged = new Set(baseModels);
  Array.from(typeSet).forEach((typeName) => {
    const scoped = scopedRules[typeName] || [];
    scoped.forEach((model) => merged.add(model));
  });

  return sortedUniqueStrings(Array.from(merged));
}
