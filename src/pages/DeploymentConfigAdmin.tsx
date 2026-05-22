import { useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, Loader2, Save, Settings2, ShieldCheck } from 'lucide-react';
import {
  getModelHardwarePolicy,
  updateModelHardwarePolicy,
} from '../api/deployments';
import { verifyCurrentPrincipal, type VerifyResponse } from '../api/security';
import { buildRealtimeSocketUrl, parseRealtimeSocketMessage } from '../api/realtime';
import {
  ALLOWED_DEPLOY_MODELS,
  DEFAULT_CPU_DEPLOY_MODELS,
  modelDisplayNameWithCapability,
} from '../config/modelCatalog';
import {
  collectCpuTypes,
  collectGpuTypes,
  fromBackendModelHardwarePolicy,
  readModelHardwarePolicy,
  saveModelHardwarePolicy,
  toBackendModelHardwarePolicyUpdate,
  type ModelHardwarePolicy,
} from '../config/modelHardwarePolicy';

function sortedUniqueStrings(values: string[]): string[] {
  return Array.from(
    new Set(
      values
        .map((value) => value.trim())
        .filter((value) => value.length > 0)
    )
  ).sort((a, b) => a.localeCompare(b));
}

function normalizeModelSelection(models: string[]): string[] {
  const allowed = new Set(ALLOWED_DEPLOY_MODELS);
  const seen = new Set<string>();

  models.forEach((model) => {
    if (!allowed.has(model)) {
      return;
    }
    seen.add(model);
  });

  return ALLOWED_DEPLOY_MODELS.filter((model) => seen.has(model));
}

function toggleModelInSelection(models: string[], modelName: string): string[] {
  if (models.includes(modelName)) {
    return models.filter((item) => item !== modelName);
  }
  return normalizeModelSelection([...models, modelName]);
}

function getScopedTypeModels(
  source: Record<string, string[]>,
  typeName: string
): string[] {
  return normalizeModelSelection(source[typeName] || []);
}

function upsertScopedTypeModels(
  source: Record<string, string[]>,
  typeName: string,
  models: string[]
): Record<string, string[]> {
  const normalizedType = typeName.trim();
  if (!normalizedType) {
    return source;
  }

  const normalizedModels = normalizeModelSelection(models);
  const next = { ...source };

  if (normalizedModels.length === 0) {
    delete next[normalizedType];
    return next;
  }

  next[normalizedType] = normalizedModels;
  return next;
}

function sanitizeMemoryQuantityInput(raw: string): string {
  return raw.replace(/\s+/g, '').trim();
}

function upsertModelMemoryQuantity(
  source: Record<string, string>,
  modelName: string,
  rawQuantity: string
): Record<string, string> {
  const normalizedModel = modelName.trim();
  if (!normalizedModel || !ALLOWED_DEPLOY_MODELS.includes(normalizedModel)) {
    return source;
  }

  const normalizedQuantity = sanitizeMemoryQuantityInput(rawQuantity);
  const next = { ...source };
  if (!normalizedQuantity) {
    delete next[normalizedModel];
    return next;
  }
  next[normalizedModel] = normalizedQuantity;
  return next;
}

type RealtimeHardwareNode = {
  cpuModel: string | null;
  gpu: {
    model: string;
    count: number;
    requestedCount: number;
    utilizationPercent: number;
  } | null;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  return value as Record<string, unknown>;
}

function toNonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function toRealtimeHardwareNode(raw: unknown): RealtimeHardwareNode | null {
  const item = asRecord(raw);
  if (!item) {
    return null;
  }

  const cpuModel =
    toNonEmptyString(item.cpuModel) ??
    toNonEmptyString(item.cpu_model) ??
    toNonEmptyString(item.cpuProduct) ??
    toNonEmptyString(item.cpu_product);

  const gpuRecord = asRecord(item.gpu);
  const gpuModel =
    toNonEmptyString(gpuRecord?.model) ??
    toNonEmptyString(item.gpuProduct) ??
    toNonEmptyString(item.gpu_product);

  return {
    cpuModel,
    gpu: gpuModel
      ? {
          model: gpuModel,
          count: 1,
          requestedCount: 0,
          utilizationPercent: 0,
        }
      : null,
  };
}

function extractRealtimeHardwareNodes(payload: unknown): RealtimeHardwareNode[] {
  const nodesByCluster = asRecord(payload);
  if (!nodesByCluster) {
    return [];
  }
  const allNodes: RealtimeHardwareNode[] = [];
  Object.values(nodesByCluster).forEach((value) => {
    if (!Array.isArray(value)) return;
    value.forEach((node) => {
      const normalized = toRealtimeHardwareNode(node);
      if (!normalized) return;
      allNodes.push(normalized);
    });
  });
  return allNodes;
}

export function DeploymentConfigAdmin() {
  const [principal, setPrincipal] = useState<VerifyResponse | null>(null);
  const [isLoadingPrincipal, setIsLoadingPrincipal] = useState(true);
  const [principalError, setPrincipalError] = useState<string | null>(null);

  const [modelHardwarePolicyDraft, setModelHardwarePolicyDraft] =
    useState<ModelHardwarePolicy>(() => readModelHardwarePolicy());
  const [lastSyncedPolicyPayload, setLastSyncedPolicyPayload] = useState<string>(() =>
    JSON.stringify(toBackendModelHardwarePolicyUpdate(readModelHardwarePolicy()))
  );
  const [isSavingModelHardwarePolicy, setIsSavingModelHardwarePolicy] = useState(false);
  const [isLoadingHardwareTypes, setIsLoadingHardwareTypes] = useState(true);
  const [hardwareTypesError, setHardwareTypesError] = useState<string | null>(null);
  const [cpuTypeOptions, setCpuTypeOptions] = useState<string[]>([]);
  const [gpuTypeOptions, setGpuTypeOptions] = useState<string[]>([]);
  const [selectedCpuType, setSelectedCpuType] = useState('');
  const [selectedGpuType, setSelectedGpuType] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const hasUnsavedPolicyChangesRef = useRef(false);

  const canManageModelPolicies = useMemo(
    () =>
      (principal?.permissions || []).includes('roles:manage') ||
      (principal?.permissions || []).includes('allowed_models:manage'),
    [principal]
  );

  const cpuTypeChoices = useMemo(
    () =>
      sortedUniqueStrings([
        ...cpuTypeOptions,
        ...Object.keys(modelHardwarePolicyDraft.cpuTypeModels || {}),
      ]),
    [cpuTypeOptions, modelHardwarePolicyDraft.cpuTypeModels]
  );

  const gpuTypeChoices = useMemo(
    () =>
      sortedUniqueStrings([
        ...gpuTypeOptions,
        ...Object.keys(modelHardwarePolicyDraft.gpuTypeModels || {}),
      ]),
    [gpuTypeOptions, modelHardwarePolicyDraft.gpuTypeModels]
  );

  const selectedCpuTypeModels = useMemo(
    () =>
      selectedCpuType
        ? getScopedTypeModels(modelHardwarePolicyDraft.cpuTypeModels, selectedCpuType)
        : [],
    [modelHardwarePolicyDraft.cpuTypeModels, selectedCpuType]
  );

  const selectedGpuTypeModels = useMemo(
    () =>
      selectedGpuType
        ? getScopedTypeModels(modelHardwarePolicyDraft.gpuTypeModels, selectedGpuType)
        : [],
    [modelHardwarePolicyDraft.gpuTypeModels, selectedGpuType]
  );

  const draftPolicyPayload = useMemo(
    () => JSON.stringify(toBackendModelHardwarePolicyUpdate(modelHardwarePolicyDraft)),
    [modelHardwarePolicyDraft]
  );
  const hasUnsavedPolicyChanges = useMemo(
    () => draftPolicyPayload !== lastSyncedPolicyPayload,
    [draftPolicyPayload, lastSyncedPolicyPayload]
  );

  useEffect(() => {
    hasUnsavedPolicyChangesRef.current = hasUnsavedPolicyChanges;
  }, [hasUnsavedPolicyChanges]);

  useEffect(() => {
    let active = true;
    setIsLoadingPrincipal(true);

    const loadPrincipal = async () => {
      try {
        const payload = await verifyCurrentPrincipal();
        if (!active) return;
        setPrincipal(payload);
        setPrincipalError(null);
      } catch (err) {
        if (!active) return;
        setPrincipalError(
          err instanceof Error
            ? err.message
            : 'Не удалось определить текущего пользователя.'
        );
      } finally {
        if (active) {
          setIsLoadingPrincipal(false);
        }
      }
    };

    void loadPrincipal();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    const localPolicy = readModelHardwarePolicy();
    setModelHardwarePolicyDraft(localPolicy);
    setLastSyncedPolicyPayload(
      JSON.stringify(toBackendModelHardwarePolicyUpdate(localPolicy))
    );

    const loadPolicy = async (forceApply = false) => {
      try {
        const payload = await getModelHardwarePolicy();
        if (!active) return;
        const normalized = fromBackendModelHardwarePolicy(payload);
        const normalizedPayload = JSON.stringify(
          toBackendModelHardwarePolicyUpdate(normalized)
        );
        setLastSyncedPolicyPayload(normalizedPayload);
        if (!hasUnsavedPolicyChangesRef.current || forceApply) {
          setModelHardwarePolicyDraft(normalized);
        }
        saveModelHardwarePolicy(normalized);
      } catch {
        if (!active) return;
      }
    };

    void loadPolicy(true);

    if (typeof window === 'undefined') {
      return () => {
        active = false;
      };
    }

    const syncFromStorage = () => {
      setModelHardwarePolicyDraft(readModelHardwarePolicy());
    };
    const onFocus = () => {
      void loadPolicy(false);
    };
    const onVisibilityChange = () => {
      if (!document.hidden) {
        void loadPolicy(false);
      }
    };

    window.addEventListener('storage', syncFromStorage);
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      active = false;
      window.removeEventListener('storage', syncFromStorage);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, []);

  useEffect(() => {
    let stopped = false;
    let receivedSnapshot = false;
    let socket: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    const clearReconnectTimer = () => {
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
    };

    const applyHardwareTypesFromSnapshot = (nodesPayload: unknown) => {
      const nodes = extractRealtimeHardwareNodes(nodesPayload);
      setCpuTypeOptions(collectCpuTypes(nodes));
      setGpuTypeOptions(collectGpuTypes(nodes));
      setHardwareTypesError(null);
      setIsLoadingHardwareTypes(false);
      receivedSnapshot = true;
    };

    const scheduleReconnect = () => {
      if (stopped || reconnectTimer) {
        return;
      }
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        connect();
      }, 1500);
    };

    const connect = () => {
      if (stopped) {
        return;
      }
      const wsUrl = buildRealtimeSocketUrl({
        scope: 'infrastructure',
        intervalSeconds: 8,
      });
      socket = new WebSocket(wsUrl);

      socket.onopen = () => {
        if (stopped) return;
        setHardwareTypesError(null);
      };

      socket.onmessage = (event) => {
        if (stopped) return;
        const message = parseRealtimeSocketMessage(event.data);
        if (!message) return;
        if (message.type === 'state_snapshot') {
          applyHardwareTypesFromSnapshot(message.payload?.nodes_by_cluster);
          return;
        }
        if (message.type === 'error') {
          const errorText = String(message.message || '').trim();
          if (errorText) {
            setHardwareTypesError(errorText);
          }
          if (!receivedSnapshot) {
            setIsLoadingHardwareTypes(false);
          }
        }
      };

      socket.onerror = () => {
        if (stopped || receivedSnapshot) return;
        setHardwareTypesError('Realtime connection failed for hardware types.');
        setIsLoadingHardwareTypes(false);
      };

      socket.onclose = () => {
        if (stopped) return;
        scheduleReconnect();
      };
    };

    setIsLoadingHardwareTypes(true);
    connect();

    return () => {
      stopped = true;
      clearReconnectTimer();
      if (socket && socket.readyState <= WebSocket.OPEN) {
        socket.close();
      }
    };
  }, []);

  useEffect(() => {
    if (cpuTypeChoices.length === 0) {
      setSelectedCpuType('');
      return;
    }
    setSelectedCpuType((current) =>
      current && cpuTypeChoices.includes(current) ? current : cpuTypeChoices[0]
    );
  }, [cpuTypeChoices]);

  useEffect(() => {
    if (gpuTypeChoices.length === 0) {
      setSelectedGpuType('');
      return;
    }
    setSelectedGpuType((current) =>
      current && gpuTypeChoices.includes(current) ? current : gpuTypeChoices[0]
    );
  }, [gpuTypeChoices]);

  const handleToggleAllCpuModel = (modelName: string) => {
    setModelHardwarePolicyDraft((current) => ({
      ...current,
      allCpuModels: toggleModelInSelection(current.allCpuModels, modelName),
    }));
  };

  const handleToggleAllGpuModel = (modelName: string) => {
    setModelHardwarePolicyDraft((current) => ({
      ...current,
      allGpuModels: toggleModelInSelection(current.allGpuModels, modelName),
    }));
  };

  const handleToggleCpuTypeModel = (modelName: string) => {
    if (!selectedCpuType) {
      return;
    }
    setModelHardwarePolicyDraft((current) => {
      const currentModels = getScopedTypeModels(current.cpuTypeModels, selectedCpuType);
      return {
        ...current,
        cpuTypeModels: upsertScopedTypeModels(
          current.cpuTypeModels,
          selectedCpuType,
          toggleModelInSelection(currentModels, modelName)
        ),
      };
    });
  };

  const handleToggleGpuTypeModel = (modelName: string) => {
    if (!selectedGpuType) {
      return;
    }
    setModelHardwarePolicyDraft((current) => {
      const currentModels = getScopedTypeModels(current.gpuTypeModels, selectedGpuType);
      return {
        ...current,
        gpuTypeModels: upsertScopedTypeModels(
          current.gpuTypeModels,
          selectedGpuType,
          toggleModelInSelection(currentModels, modelName)
        ),
      };
    });
  };

  const handleClearCpuTypeModels = () => {
    if (!selectedCpuType) {
      return;
    }
    setModelHardwarePolicyDraft((current) => ({
      ...current,
      cpuTypeModels: upsertScopedTypeModels(current.cpuTypeModels, selectedCpuType, []),
    }));
  };

  const handleClearGpuTypeModels = () => {
    if (!selectedGpuType) {
      return;
    }
    setModelHardwarePolicyDraft((current) => ({
      ...current,
      gpuTypeModels: upsertScopedTypeModels(current.gpuTypeModels, selectedGpuType, []),
    }));
  };

  const handleCpuModelMemoryChange = (modelName: string, value: string) => {
    setModelHardwarePolicyDraft((current) => ({
      ...current,
      cpuModelMemoryRequests: upsertModelMemoryQuantity(
        current.cpuModelMemoryRequests,
        modelName,
        value
      ),
    }));
  };

  const handleGpuModelMemoryChange = (modelName: string, value: string) => {
    setModelHardwarePolicyDraft((current) => ({
      ...current,
      gpuModelMemoryRequests: upsertModelMemoryQuantity(
        current.gpuModelMemoryRequests,
        modelName,
        value
      ),
    }));
  };

  const handleSaveModelHardwarePolicy = async () => {
    if (!canManageModelPolicies) {
      setSuccessMessage(null);
      setActionError(
        'Изменение ограничений моделей по железу доступно только с правом allowed_models:manage.'
      );
      return;
    }

    setIsSavingModelHardwarePolicy(true);
    try {
      const savedPayload = await updateModelHardwarePolicy(
        toBackendModelHardwarePolicyUpdate(modelHardwarePolicyDraft)
      );
      const normalized = fromBackendModelHardwarePolicy(savedPayload);
      const saved = saveModelHardwarePolicy(normalized);
      setModelHardwarePolicyDraft(saved);
      setLastSyncedPolicyPayload(JSON.stringify(toBackendModelHardwarePolicyUpdate(saved)));
      setActionError(null);
      setSuccessMessage('Конфиг деплойментов успешно сохранён.');
    } catch (err) {
      setSuccessMessage(null);
      setActionError(
        err instanceof Error
          ? err.message
          : 'Не удалось сохранить конфиг деплойментов.'
      );
    } finally {
      setIsSavingModelHardwarePolicy(false);
    }
  };

  const allErrors = [principalError, hardwareTypesError, actionError].filter(
    Boolean
  ) as string[];

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center gap-2">
        <Settings2 className="w-6 h-6 text-indigo-500" />
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          Конфиг деплойментов
        </h1>
      </div>

      {allErrors.length > 0 && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300 space-y-1">
          {allErrors.map((message, index) => (
            <p key={`${message}-${index}`}>{message}</p>
          ))}
        </div>
      )}

      {successMessage && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300 flex items-start gap-2">
          <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}

      <div className="rounded-xl border border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-950 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 dark:border-slate-800 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-indigo-500" />
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white">
              Ограничения LLM по CPU/GPU
            </h2>
          </div>
          <div className="text-xs text-gray-500 dark:text-slate-400 text-right">
            <div>Обновлено: {new Date(modelHardwarePolicyDraft.updatedAt).toLocaleString()}</div>
            <div>{hasUnsavedPolicyChanges ? 'Есть несохранённые изменения' : 'Синхронизировано с API'}</div>
          </div>
        </div>

        {!canManageModelPolicies && !isLoadingPrincipal && (
          <div className="px-6 pt-4">
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
              Изменение ограничений доступно только с правом <code>allowed_models:manage</code>.
            </div>
          </div>
        )}

        <div className="p-4 space-y-4">
          <div className="text-sm text-gray-600 dark:text-slate-300">
            Выберите из общего списка моделей, что разрешено запускать:
            <span className="font-medium text-gray-900 dark:text-white"> на всех CPU</span>,
            <span className="font-medium text-gray-900 dark:text-white"> на всех GPU</span>,
            а также на конкретных типах CPU/GPU.
          </div>

          <div className="rounded-lg border border-gray-200 dark:border-slate-800 p-4">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">
              Профили моделей
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
              <label className="text-xs text-gray-600 dark:text-slate-300">
                Default CPU RAM
                <input
                  type="text"
                  value={modelHardwarePolicyDraft.defaultCpuMemoryRequest}
                  onChange={(event) =>
                    setModelHardwarePolicyDraft((current) => ({
                      ...current,
                      defaultCpuMemoryRequest: sanitizeMemoryQuantityInput(event.target.value),
                    }))
                  }
                  disabled={!canManageModelPolicies}
                  placeholder="6Gi"
                  className="mt-1 w-full rounded-md border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-gray-900 dark:text-white disabled:opacity-60"
                />
              </label>
              <label className="text-xs text-gray-600 dark:text-slate-300">
                Default GPU RAM
                <input
                  type="text"
                  value={modelHardwarePolicyDraft.defaultGpuMemoryRequest}
                  onChange={(event) =>
                    setModelHardwarePolicyDraft((current) => ({
                      ...current,
                      defaultGpuMemoryRequest: sanitizeMemoryQuantityInput(event.target.value),
                    }))
                  }
                  disabled={!canManageModelPolicies}
                  placeholder="6Gi"
                  className="mt-1 w-full rounded-md border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-gray-900 dark:text-white disabled:opacity-60"
                />
              </label>
            </div>

            <div className="overflow-x-auto rounded-md border border-gray-200 dark:border-slate-800">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 dark:bg-slate-900/40 text-gray-600 dark:text-slate-300">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium">Модель</th>
                    <th className="text-left px-3 py-2 font-medium">CPU RAM</th>
                    <th className="text-left px-3 py-2 font-medium">GPU RAM</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-slate-800">
                  {ALLOWED_DEPLOY_MODELS.map((modelName) => (
                    <tr key={`memory-profile-${modelName}`}>
                      <td className="px-3 py-2 text-gray-800 dark:text-slate-200 break-all">
                        {modelDisplayNameWithCapability(modelName)}
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="text"
                          value={modelHardwarePolicyDraft.cpuModelMemoryRequests[modelName] || ''}
                          onChange={(event) =>
                            handleCpuModelMemoryChange(modelName, event.target.value)
                          }
                          disabled={!canManageModelPolicies}
                          placeholder={modelHardwarePolicyDraft.defaultCpuMemoryRequest}
                          className="w-full rounded-md border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-xs text-gray-900 dark:text-white disabled:opacity-60"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="text"
                          value={modelHardwarePolicyDraft.gpuModelMemoryRequests[modelName] || ''}
                          onChange={(event) =>
                            handleGpuModelMemoryChange(modelName, event.target.value)
                          }
                          disabled={!canManageModelPolicies}
                          placeholder={modelHardwarePolicyDraft.defaultGpuMemoryRequest}
                          className="w-full rounded-md border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-xs text-gray-900 dark:text-white disabled:opacity-60"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-xs text-gray-500 dark:text-slate-400">
              Формат значений: например <code>4Gi</code>, <code>6144Mi</code>.
              Пустое значение в строке модели означает использование default.
            </p>
          </div>

          {isLoadingHardwareTypes && (
            <div className="rounded-lg border border-gray-200 dark:border-slate-800 bg-gray-50 dark:bg-slate-900/40 px-3 py-2 text-xs text-gray-600 dark:text-slate-300 inline-flex items-center gap-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Загружаем типы CPU/GPU из инфраструктуры...
            </div>
          )}

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <div className="rounded-lg border border-gray-200 dark:border-slate-800 p-4">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">
                Все CPU
              </h3>
              <div className="grid grid-cols-1 gap-2 max-h-64 overflow-y-auto pr-1">
                {DEFAULT_CPU_DEPLOY_MODELS.map((modelName) => (
                  <label key={`all-cpu-${modelName}`} className="flex items-start gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={modelHardwarePolicyDraft.allCpuModels.includes(modelName)}
                      onChange={() => handleToggleAllCpuModel(modelName)}
                      disabled={!canManageModelPolicies}
                      className="mt-0.5"
                    />
                    <span className="text-gray-800 dark:text-slate-200 break-all">
                      {modelDisplayNameWithCapability(modelName)}
                    </span>
                  </label>
                ))}
              </div>
            </div>

            <div className="rounded-lg border border-gray-200 dark:border-slate-800 p-4">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">
                Все GPU
              </h3>
              <div className="grid grid-cols-1 gap-2 max-h-64 overflow-y-auto pr-1">
                {ALLOWED_DEPLOY_MODELS.map((modelName) => (
                  <label key={`all-gpu-${modelName}`} className="flex items-start gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={modelHardwarePolicyDraft.allGpuModels.includes(modelName)}
                      onChange={() => handleToggleAllGpuModel(modelName)}
                      disabled={!canManageModelPolicies}
                      className="mt-0.5"
                    />
                    <span className="text-gray-800 dark:text-slate-200 break-all">
                      {modelDisplayNameWithCapability(modelName)}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <div className="rounded-lg border border-gray-200 dark:border-slate-800 p-4">
              <div className="flex items-center justify-between gap-3 mb-3">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
                  Выбранный тип CPU
                </h3>
                <button
                  type="button"
                  onClick={handleClearCpuTypeModels}
                  disabled={!canManageModelPolicies || !selectedCpuType}
                  className="inline-flex items-center gap-1 rounded-md border border-red-200 dark:border-red-500/40 px-2.5 py-1 text-xs text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-500/10 disabled:opacity-50"
                >
                  Очистить
                </button>
              </div>
              <select
                value={selectedCpuType}
                onChange={(event) => setSelectedCpuType(event.target.value)}
                disabled={cpuTypeChoices.length === 0}
                className="w-full rounded-md border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm mb-3"
              >
                {cpuTypeChoices.length === 0 && <option value="">Типы CPU не найдены</option>}
                {cpuTypeChoices.map((typeName) => (
                  <option key={typeName} value={typeName}>
                    {typeName}
                  </option>
                ))}
              </select>
              <div className="grid grid-cols-1 gap-2 max-h-64 overflow-y-auto pr-1">
                {DEFAULT_CPU_DEPLOY_MODELS.map((modelName) => (
                  <label key={`cpu-type-${modelName}`} className="flex items-start gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={selectedCpuTypeModels.includes(modelName)}
                      onChange={() => handleToggleCpuTypeModel(modelName)}
                      disabled={!canManageModelPolicies || !selectedCpuType}
                      className="mt-0.5"
                    />
                    <span className="text-gray-800 dark:text-slate-200 break-all">
                      {modelDisplayNameWithCapability(modelName)}
                    </span>
                  </label>
                ))}
              </div>
            </div>

            <div className="rounded-lg border border-gray-200 dark:border-slate-800 p-4">
              <div className="flex items-center justify-between gap-3 mb-3">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
                  Выбранный тип GPU
                </h3>
                <button
                  type="button"
                  onClick={handleClearGpuTypeModels}
                  disabled={!canManageModelPolicies || !selectedGpuType}
                  className="inline-flex items-center gap-1 rounded-md border border-red-200 dark:border-red-500/40 px-2.5 py-1 text-xs text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-500/10 disabled:opacity-50"
                >
                  Очистить
                </button>
              </div>
              <select
                value={selectedGpuType}
                onChange={(event) => setSelectedGpuType(event.target.value)}
                disabled={gpuTypeChoices.length === 0}
                className="w-full rounded-md border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm mb-3"
              >
                {gpuTypeChoices.length === 0 && <option value="">Типы GPU не найдены</option>}
                {gpuTypeChoices.map((typeName) => (
                  <option key={typeName} value={typeName}>
                    {typeName}
                  </option>
                ))}
              </select>
              <div className="grid grid-cols-1 gap-2 max-h-64 overflow-y-auto pr-1">
                {ALLOWED_DEPLOY_MODELS.map((modelName) => (
                  <label key={`gpu-type-${modelName}`} className="flex items-start gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={selectedGpuTypeModels.includes(modelName)}
                      onChange={() => handleToggleGpuTypeModel(modelName)}
                      disabled={!canManageModelPolicies || !selectedGpuType}
                      className="mt-0.5"
                    />
                    <span className="text-gray-800 dark:text-slate-200 break-all">
                      {modelDisplayNameWithCapability(modelName)}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => void handleSaveModelHardwarePolicy()}
              disabled={!canManageModelPolicies || isSavingModelHardwarePolicy}
              className="inline-flex items-center gap-2 rounded-md bg-indigo-600 text-white px-3 py-2 text-sm font-medium hover:bg-indigo-500 disabled:opacity-50"
            >
              {isSavingModelHardwarePolicy ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              Сохранить ограничения
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
