export type DeployModelCatalogItem = {
  name: string;
  minTokens?: number;
  maxTokens: number;
  vision?: boolean;
  cpuDefaultAllowed?: boolean;
};

export const DEPLOY_MODEL_CATALOG: DeployModelCatalogItem[] = [
  { name: 'deepseek-ai/DeepSeek-R1-Distill-Qwen-1.5B', maxTokens: 4096 },
  { name: 'tiiuae/Falcon3-1B-Base', maxTokens: 4096 },
  { name: 'tiiuae/Falcon3-1B-Instruct', maxTokens: 4096 },
  { name: 'tiiuae/Falcon3-3B-Base', maxTokens: 4096 },
  { name: 'tiiuae/Falcon3-3B-Instruct', maxTokens: 4096 },
  { name: 'HuggingFaceTB/SmolLM-135M', maxTokens: 4096 },
  { name: 'HuggingFaceTB/SmolLM-360M', maxTokens: 4096 },
  { name: 'HuggingFaceTB/SmolLM2-135M-Instruct', maxTokens: 4096 },
  { name: 'HuggingFaceTB/SmolLM2-360M-Instruct', maxTokens: 4096 },
  { name: 'google/gemma-3-1b-it', maxTokens: 4096 },
  { name: 'google/gemma-2-2b-it', maxTokens: 4096 },
  { name: 'google/gemma-3-4b-it', maxTokens: 4096 },
  { name: 'Qwen/QwQ-0.5B', maxTokens: 4096 },
  { name: 'Qwen/Qwen2-0.5B', maxTokens: 4096 },
  { name: 'Qwen/Qwen2-0.5B-Instruct', maxTokens: 4096 },
  { name: 'Qwen/Qwen2.5-0.5B', maxTokens: 4096 },
  { name: 'Qwen/Qwen2.5-0.5B-Instruct', maxTokens: 4096 },
  { name: 'Qwen/Qwen2.5-Coder-0.5B-Instruct', maxTokens: 4096 },
  { name: 'Qwen/Qwen3-0.6B', maxTokens: 4096 },
  { name: 'Qwen/Qwen2.5-1.5B-Instruct', maxTokens: 4096 },
  { name: 'Qwen/Qwen3-1.7B', maxTokens: 4096 },
  { name: 'Qwen/Qwen2.5-3B-Instruct', maxTokens: 4096 },
  { name: 'HuggingFaceTB/SmolVLM-256M-Instruct', minTokens: 256, maxTokens: 8192, vision: true, cpuDefaultAllowed: true },
  { name: 'HuggingFaceTB/SmolVLM-500M-Instruct', minTokens: 256, maxTokens: 4096, vision: true, cpuDefaultAllowed: true },
  { name: 'HuggingFaceTB/SmolVLM2-2.2B-Instruct', minTokens: 256, maxTokens: 8192, vision: true, cpuDefaultAllowed: true },
  { name: 'vikhyatk/moondream2', minTokens: 256, maxTokens: 4096, vision: true, cpuDefaultAllowed: true },
  { name: 'OpenGVLab/InternVL2-1B', minTokens: 512, maxTokens: 4096, vision: true, cpuDefaultAllowed: true },
  { name: 'OpenGVLab/InternVL2-2B', minTokens: 512, maxTokens: 4096, vision: true, cpuDefaultAllowed: true },
  { name: 'Qwen/Qwen2.5-VL-3B-Instruct', minTokens: 512, maxTokens: 4096, vision: true, cpuDefaultAllowed: true },
  { name: 'microsoft/Phi-3.5-vision-instruct', minTokens: 512, maxTokens: 2048, vision: true, cpuDefaultAllowed: true },
];

export const ALLOWED_DEPLOY_MODELS = DEPLOY_MODEL_CATALOG.map((item) => item.name);
const VISION_MODEL_NAME_SET = new Set(
  DEPLOY_MODEL_CATALOG.filter((item) => item.vision).map((item) => item.name.trim().toLowerCase())
);

export function inferModelSizeMillionsFromName(modelName: string): number | null {
  const raw = String(modelName || '').trim().toLowerCase();
  if (!raw) {
    return null;
  }

  const matches = raw.matchAll(/(\d+(?:\.\d+)?)\s*([mb])(?:[^a-z0-9]|$)/gi);
  const sizes: number[] = [];
  for (const match of matches) {
    const value = Number.parseFloat(match[1] || '');
    const unit = String(match[2] || '').toLowerCase();
    if (!Number.isFinite(value)) {
      continue;
    }
    if (unit === 'b') {
      sizes.push(value * 1000);
      continue;
    }
    if (unit === 'm') {
      sizes.push(value);
    }
  }

  if (sizes.length === 0) {
    return null;
  }
  return Math.max(...sizes);
}

export const DEFAULT_CPU_DEPLOY_MODELS = DEPLOY_MODEL_CATALOG
  .filter((item) => {
    if (item.cpuDefaultAllowed === true) {
      return true;
    }
    const sizeMillions = inferModelSizeMillionsFromName(item.name);
    if (sizeMillions === null) {
      return false;
    }
    return sizeMillions <= 700;
  })
  .map((item) => item.name)
  .filter((modelName) => {
    return modelName.trim().length > 0;
  });

const MODEL_MAX_TOKENS_BY_NAME = new Map(
  DEPLOY_MODEL_CATALOG.map((item) => [item.name, item.maxTokens])
);
const MODEL_MIN_TOKENS_BY_NAME = new Map(
  DEPLOY_MODEL_CATALOG
    .filter((item) => Number.isFinite(item.minTokens))
    .map((item) => [item.name, Number(item.minTokens)])
);

const DEFAULT_MIN_TOKENS = 256;
const DEFAULT_MAX_TOKENS = 4096;

export function sortedUniqueStrings(values: string[]): string[] {
  return Array.from(
    new Set(
      values
        .map((value) => value.trim())
        .filter((value) => value.length > 0)
    )
  ).sort((a, b) => a.localeCompare(b));
}

export function modelMaxTokens(modelName: string): number {
  return MODEL_MAX_TOKENS_BY_NAME.get(modelName) ?? DEFAULT_MAX_TOKENS;
}

export function modelMinTokens(modelName: string): number {
  const min = MODEL_MIN_TOKENS_BY_NAME.get(modelName);
  if (typeof min !== 'number' || !Number.isFinite(min)) {
    return DEFAULT_MIN_TOKENS;
  }
  return Math.max(1, Math.trunc(min));
}

export function allowedMaxTokensForModel(modelName: string): number[] {
  const maxLimit = Math.max(1, Math.trunc(modelMaxTokens(modelName)));
  const minLimit = Math.max(1, Math.min(Math.trunc(modelMinTokens(modelName)), maxLimit));

  if (minLimit === maxLimit) {
    return [maxLimit];
  }

  const allowed: number[] = [];
  let current = minLimit;
  while (current < maxLimit) {
    allowed.push(current);
    const next = current * 2;
    if (next <= current) {
      break;
    }
    current = next;
  }
  if (allowed[allowed.length - 1] !== maxLimit) {
    allowed.push(maxLimit);
  }
  return Array.from(new Set(allowed))
    .filter((value) => value >= minLimit && value <= maxLimit)
    .sort((a, b) => a - b);
}

export function normalizeSelectedMaxTokens(modelName: string, currentValue: number): number {
  const allowed = allowedMaxTokensForModel(modelName);
  if (allowed.includes(currentValue)) {
    return currentValue;
  }
  const lowerOrEqual = allowed.filter((value) => value <= currentValue);
  if (lowerOrEqual.length > 0) {
    return lowerOrEqual[lowerOrEqual.length - 1];
  }
  return allowed[0];
}

export function isVisionModelName(modelName: string): boolean {
  const normalized = String(modelName || '').trim().toLowerCase();
  if (!normalized) {
    return false;
  }
  if (VISION_MODEL_NAME_SET.has(normalized)) {
    return true;
  }
  return (
    normalized.includes('vision')
    || normalized.includes('vlm')
    || normalized.includes('internvl')
    || normalized.includes('moondream')
  );
}

export function modelCapabilityLabel(modelName: string): string {
  return isVisionModelName(modelName) ? 'текст + картинки' : 'только текст';
}

export function modelDisplayNameWithCapability(modelName: string): string {
  return `${modelName} (${modelCapabilityLabel(modelName)})`;
}
