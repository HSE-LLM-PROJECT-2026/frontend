import React, { useState, useEffect } from 'react';
import { Rocket, CheckCircle2, CircleDashed, Loader2, Copy, Check } from 'lucide-react';
import { createDeployment, mapRealtimeDeploymentLike, Deployment } from '../api/platform';
import { ALLOWED_DEPLOY_MODELS, modelDisplayNameWithCapability } from '../config/modelCatalog';
import { buildRealtimeSocketUrl, parseRealtimeSocketMessage } from '../api/realtime';
import { isDemoModeEnabled } from '../api/demoMode';

import { useCluster } from '../context/ClusterContext';

import { FieldTooltip } from '../components/FieldTooltip';
import { useLanguage } from '../context/LanguageContext';

const DEMO_MODE = isDemoModeEnabled();

type ValidationMetrics = {
  ttft: number;
  tps: number;
  tpot: number;
  queue: number;
  kvCache: number;
  errorRate: number;
};

type ValidationProfile = {
  id: string;
  name: string;
  description: string;
  metrics: ValidationMetrics;
  isBuiltIn?: boolean;
};

const VALIDATION_PROFILE_STORAGE_KEY = 'llmops.validation.customProfiles';

const BUILTIN_VALIDATION_PROFILES: ValidationProfile[] = [
  {
    id: 'performance',
    name: 'Ultra-Low Latency',
    description: 'SLO: 200ms',
    isBuiltIn: true,
    metrics: { ttft: 200, tps: 100, tpot: 15, queue: 50, kvCache: 70, errorRate: 0.1 }
  },
  {
    id: 'balanced',
    name: 'Balanced Throughput',
    description: 'SLO: 500ms',
    isBuiltIn: true,
    metrics: { ttft: 500, tps: 50, tpot: 50, queue: 200, kvCache: 85, errorRate: 1 }
  },
  {
    id: 'cost',
    name: 'Cost Optimized',
    description: 'SLO: 1s',
    isBuiltIn: true,
    metrics: { ttft: 1000, tps: 20, tpot: 100, queue: 500, kvCache: 95, errorRate: 2 }
  }
];

export function DeployModel() {
  const { clusters } = useCluster();
  const { t } = useLanguage();
  const [isDeploying, setIsDeploying] = useState(false);
  const [deploymentId, setDeploymentId] = useState<string | null>(null);
  const [deployment, setDeployment] = useState<Deployment | null>(null);
  const [copied, setCopied] = useState(false);
  const [deployedMetrics, setDeployedMetrics] = useState<any>(null);

  const deployClusters = clusters.filter(c => c.id !== 'all');
  const defaultModelName =
    ALLOWED_DEPLOY_MODELS.includes('HuggingFaceTB/SmolLM2-135M-Instruct')
      ? 'HuggingFaceTB/SmolLM2-135M-Instruct'
      : ALLOWED_DEPLOY_MODELS[0] || 'HuggingFaceTB/SmolLM2-135M-Instruct';

  const [isMultiCluster, setIsMultiCluster] = useState(false);
  const [selectedClusters, setSelectedClusters] = useState<Record<string, number>>(
    deployClusters.reduce((acc, c) => ({ ...acc, [c.id]: 1 }), {})
  );
  const [clusterValidationProfiles, setClusterValidationProfiles] = useState<Record<string, string>>(
    deployClusters.reduce((acc, c) => ({ ...acc, [c.id]: 'performance' }), {})
  );
  const [validationProfiles, setValidationProfiles] = useState<ValidationProfile[]>(BUILTIN_VALIDATION_PROFILES);
  const [isValidationProfileModalOpen, setIsValidationProfileModalOpen] = useState(false);
  const [modalSelectedProfileId, setModalSelectedProfileId] = useState('performance');
  const [applyProfileToAllClusters, setApplyProfileToAllClusters] = useState(true);
  const [profileTargetClusterId, setProfileTargetClusterId] = useState(deployClusters[0]?.id || 'msk-1');
  const [newProfileName, setNewProfileName] = useState('');
  const [newProfileDescription, setNewProfileDescription] = useState('');
  const [newProfileMetrics, setNewProfileMetrics] = useState<ValidationMetrics>({
    ttft: 350,
    tps: 60,
    tpot: 40,
    queue: 120,
    kvCache: 80,
    errorRate: 0.8
  });

  const [formData, setFormData] = useState({
    modelName: defaultModelName,
    clusterId: deployClusters[0]?.id || 'msk-1',
    replicas: 1,
    team: 'Data Science',
    product: '',
    validation: false,
    sloConfig: 'performance'
  });

  const activeValidationProfile =
    validationProfiles.find((p) => p.id === formData.sloConfig) || BUILTIN_VALIDATION_PROFILES[0];

  const getSloMetrics = () => activeValidationProfile.metrics;

  const applyValidationProfile = (profileId: string, applyToAll: boolean, targetClusterId: string) => {
    const availableClusterIds = isMultiCluster
      ? Object.keys(selectedClusters)
      : [formData.clusterId];
    const validTarget = availableClusterIds.includes(targetClusterId)
      ? targetClusterId
      : availableClusterIds[0];

    setClusterValidationProfiles((prev) => {
      const next = { ...prev };
      let changed = false;
      if (applyToAll) {
        availableClusterIds.forEach((clusterId) => {
          if (next[clusterId] !== profileId) {
            next[clusterId] = profileId;
            changed = true;
          }
        });
      } else {
        if (next[validTarget] !== profileId) {
          next[validTarget] = profileId;
          changed = true;
        }
      }
      return changed ? next : prev;
    });

    setFormData((prev) => ({ ...prev, sloConfig: profileId }));
  };

  const handleCreateValidationProfile = () => {
    const trimmedName = newProfileName.trim();
    if (!trimmedName) return;
    const slug = trimmedName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
    const profileId = `custom-${slug || 'profile'}-${Date.now()}`;
    const newProfile: ValidationProfile = {
      id: profileId,
      name: trimmedName,
      description: newProfileDescription.trim() || 'Custom profile',
      metrics: { ...newProfileMetrics }
    };

    setValidationProfiles((prev) => [...prev, newProfile]);
    setModalSelectedProfileId(profileId);
    setNewProfileName('');
    setNewProfileDescription('');
  };

  useEffect(() => {
    try {
      const raw = localStorage.getItem(VALIDATION_PROFILE_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return;
      const customProfiles: ValidationProfile[] = parsed
        .filter((item: any) => item && typeof item.id === 'string' && item.metrics)
        .map((item: any) => ({
          id: item.id,
          name: typeof item.name === 'string' ? item.name : 'Custom profile',
          description: typeof item.description === 'string' ? item.description : 'Custom profile',
          metrics: {
            ttft: Number(item.metrics.ttft) || 500,
            tps: Number(item.metrics.tps) || 50,
            tpot: Number(item.metrics.tpot) || 50,
            queue: Number(item.metrics.queue) || 200,
            kvCache: Number(item.metrics.kvCache) || 80,
            errorRate: Number(item.metrics.errorRate) || 1
          }
        }));
      setValidationProfiles([...BUILTIN_VALIDATION_PROFILES, ...customProfiles]);
    } catch (error) {
      console.warn('Failed to restore custom validation profiles:', error);
    }
  }, []);

  useEffect(() => {
    const customProfiles = validationProfiles.filter((p) => !p.isBuiltIn);
    localStorage.setItem(VALIDATION_PROFILE_STORAGE_KEY, JSON.stringify(customProfiles));
  }, [validationProfiles]);

  useEffect(() => {
    setClusterValidationProfiles((prev) => {
      const next = { ...prev };
      let changed = false;
      deployClusters.forEach((cluster) => {
        if (!next[cluster.id]) {
          next[cluster.id] = formData.sloConfig;
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [clusters, formData.sloConfig]);

  useEffect(() => {
    setProfileTargetClusterId(formData.clusterId);
  }, [formData.clusterId]);

  useEffect(() => {
    setModalSelectedProfileId(formData.sloConfig);
  }, [formData.sloConfig]);

  useEffect(() => {
    if (ALLOWED_DEPLOY_MODELS.length === 0) {
      return;
    }
    if (!ALLOWED_DEPLOY_MODELS.includes(formData.modelName)) {
      setFormData((prev) => ({ ...prev, modelName: defaultModelName }));
    }
  }, [defaultModelName, formData.modelName]);

  const toggleCluster = (clusterId: string) => {
    setSelectedClusters(prev => {
      const next = { ...prev };
      if (clusterId in next && Object.keys(next).length > 1) {
        delete next[clusterId];
      } else if (!(clusterId in next)) {
        next[clusterId] = 1;
      }
      return next;
    });
  };

  const updateClusterReplicas = (clusterId: string, reps: number) => {
    setSelectedClusters(prev => ({ ...prev, [clusterId]: reps }));
  };

  const handleDeploy = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsDeploying(true);
    setDeploymentId(null);
    setDeployment(null);
    
    const clusterGroups: any[] = isMultiCluster 
      ? Object.entries(selectedClusters).map(([id, reps]) => ({
          clusterId: id,
          replicas: Number(reps),
          status: 'pending' as const,
          progress: 0
        }))
      : [];

    const totalReplicas: number = isMultiCluster 
      ? (Object.values(selectedClusters) as number[]).reduce((a: number, b: number) => a + b, 0)
      : Number(formData.replicas);

    try {
      const newDep = await createDeployment({
        modelName: formData.modelName,
        modelVersion: 'latest',
        clusterId: isMultiCluster ? 'multi' : formData.clusterId,
        replicas: totalReplicas,
        team: formData.team,
        product: formData.product,
        isMultiCluster,
        clusterGroups
      });
      setDeploymentId(newDep.id);
      if (DEMO_MODE) {
        setDeployment({
          ...newDep,
          status: 'running',
          message: 'Deployment ready',
        });
        setIsDeploying(false);
      } else {
        setDeployment(newDep);
      }
    } catch (err) {
      console.error(err);
      setIsDeploying(false);
    }
  };

  useEffect(() => {
    if (!deploymentId || DEMO_MODE) return;

    let stopped = false;
    let completed = false;
    let socket: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    const clearReconnectTimer = () => {
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
    };

    const applyDeploymentSnapshot = (payload: unknown) => {
      if (!Array.isArray(payload) || payload.length === 0) {
        return;
      }
      const mapped = mapRealtimeDeploymentLike(payload[0]);
      setDeployment(mapped);
      if (mapped.status === 'running' || mapped.status === 'failed') {
        completed = true;
        setIsDeploying(false);
        clearReconnectTimer();
        if (socket && socket.readyState <= WebSocket.OPEN) {
          socket.close();
        }
      }
    };

    const connect = () => {
      if (stopped || completed) return;
      const wsUrl = buildRealtimeSocketUrl({
        scope: 'deployments',
        deploymentId,
        intervalSeconds: 1,
      });
      socket = new WebSocket(wsUrl);

      socket.onmessage = (event) => {
        if (stopped || completed) return;
        const message = parseRealtimeSocketMessage(event.data);
        if (!message) return;
        if (message.type === 'error') {
          if (message.status_code === 401 || message.status_code === 403) {
            completed = true;
            setIsDeploying(false);
            clearReconnectTimer();
            if (socket && socket.readyState <= WebSocket.OPEN) {
              socket.close();
            }
          }
          return;
        }
        if (message.type !== 'state_snapshot') return;
        applyDeploymentSnapshot(message.payload?.deployments);
      };

      socket.onclose = () => {
        if (stopped || completed) return;
        reconnectTimer = setTimeout(() => {
          reconnectTimer = null;
          connect();
        }, 1500);
      };
    };

    connect();

    return () => {
      stopped = true;
      clearReconnectTimer();
      if (socket && socket.readyState <= WebSocket.OPEN) {
        socket.close();
      }
    };
  }, [deploymentId]);

  const handleCopy = () => {
    const cmd = `curl http://${formData.clusterId}:11434/api/chat -d '{"model":"${formData.modelName}","messages":[{"role":"user","content":"Hello"}]}'`;
    navigator.clipboard.writeText(cmd);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const getStepStatus = (stepIndex: number) => {
    if (!deployment) return 'pending';
    const s = deployment.status;
    if (s === 'failed') return 'failed';
    
    if (stepIndex === 1) {
      if (s === 'pending') return 'active';
      return 'done';
    }
    if (stepIndex === 2) {
      if (s === 'pending') return 'pending';
      if (s === 'pulling') return 'active';
      return 'done';
    }
    if (formData.validation) {
      if (stepIndex === 3) {
         if (s === 'pending' || s === 'pulling') return 'pending';
         if (s === 'running') return 'done';
         return 'active';
      }
      if (stepIndex === 4) {
        if (s === 'running') return 'done';
        return 'pending';
      }
    } else {
      if (stepIndex === 3) {
        if (s === 'running') return 'done';
        return 'pending';
      }
    }
    return 'pending';
  };

  const StepIcon = ({ status }: { status: string }) => {
    if (status === 'done') return <CheckCircle2 className="w-6 h-6 text-emerald-500" />;
    if (status === 'active') return <Loader2 className="w-6 h-6 text-indigo-500 animate-spin" />;
    if (status === 'failed') return <CircleDashed className="w-6 h-6 text-red-500" />;
    return <CircleDashed className="w-6 h-6 text-gray-300 dark:text-slate-600" />;
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('deploy')}</h1>
          <p className="text-gray-500 dark:text-slate-400 mt-1">{t('deployModelDesc') || 'Configure and deploy a new LLM to your clusters'}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-white dark:bg-slate-950 rounded-xl border border-gray-200 dark:border-slate-800 p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">{t('configuration') || 'Configuration'}</h2>
            <form onSubmit={handleDeploy} className="space-y-4">
              <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-slate-900 rounded-lg border border-gray-200 dark:border-slate-800">
                <div className="flex flex-col">
                  <span className="text-sm font-bold text-gray-900 dark:text-white leading-none">{t('multiCluster')}</span>
                  <span className="text-[10px] text-gray-500 mt-1 uppercase tracking-tighter">{t('deployToMultiple')}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setIsMultiCluster(!isMultiCluster)}
                  className={`relative inline-flex h-5 w-10 items-center rounded-full transition-colors ${isMultiCluster ? 'bg-indigo-600' : 'bg-gray-300 dark:bg-slate-700'}`}
                >
                  <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${isMultiCluster ? 'translate-x-5.5' : 'translate-x-1'}`} />
                </button>
              </div>

              <div className="grid grid-cols-1 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
                    {t('modelName')}
                    <FieldTooltip content={t('modelTooltip') || "Select the underlying foundation model to deploy."} />
                  </label>
                  <select 
                    value={formData.modelName}
                    onChange={(e) => setFormData({...formData, modelName: e.target.value})}
                    className="w-full rounded-lg border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:text-white"
                  >
                    {ALLOWED_DEPLOY_MODELS.map((modelName) => (
                      <option key={modelName} value={modelName}>
                        {modelDisplayNameWithCapability(modelName)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {!isMultiCluster ? (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
                      {t('targetCluster') || 'Target Cluster'}
                      <FieldTooltip content={t('targetClusterTooltip') || "The physical Kubernetes cluster where the model will be deployed."} />
                    </label>
                    <select 
                      value={formData.clusterId}
                      onChange={(e) => setFormData({...formData, clusterId: e.target.value})}
                      className="w-full rounded-lg border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:text-white"
                    >
                      {deployClusters.map(c => (
                        <option key={c.id} value={c.id}>{c.name} ({c.region})</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
                      {t('replicas')}
                      <FieldTooltip content={t('replicasTooltip') || "Initial number of model instances. Will be adjusted by autoscaling if configured."} />
                    </label>
                    <input 
                      type="number" 
                      value={formData.replicas}
                      onChange={(e) => setFormData({...formData, replicas: Number(e.target.value)})}
                      className="w-full rounded-lg border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:text-white"
                    />
                  </div>
                </>
              ) : (
                <div className="space-y-3">
                  <label className="block text-sm font-medium text-gray-700 dark:text-slate-300">
                    {t('selectClustersReplicas') || 'Select Clusters & Replicas'}
                    <FieldTooltip content={t('allocateReplicasTooltip') || "Allocate replicas across multiple clusters for high availability and overflow routing."} />
                  </label>
                  {deployClusters.map(c => (
                    <div key={c.id} className="flex items-center justify-between p-2 rounded-lg border border-gray-200 dark:border-slate-800 hover:bg-gray-50 dark:hover:bg-slate-900/50 transition-colors">
                      <div className="flex items-center gap-2">
                        <input 
                          type="checkbox" 
                          checked={c.id in selectedClusters}
                          onChange={() => toggleCluster(c.id)}
                          className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                        />
                        <span className="text-sm font-medium text-gray-900 dark:text-white">{c.name}</span>
                      </div>
                      <input 
                        type="number" 
                        disabled={!(c.id in selectedClusters)}
                        value={selectedClusters[c.id] || 0}
                        onChange={(e) => updateClusterReplicas(c.id, Number(e.target.value))}
                        className="w-16 rounded-md border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:text-white"
                      />
                    </div>
                  ))}
                </div>
              )}

              <div className="border-t border-gray-100 dark:border-slate-800 pt-4 mt-4">
                <div className="flex items-center justify-between mb-3 text-sm font-medium text-gray-900 dark:text-white">
                  <span>
                    {t('preDeployValidation')}
                    <FieldTooltip content={t('preDeployValidationTooltip') || "Run a load test before traffic shifting. Deployment is blocked if metrics fail."} />
                  </span>
                  <button
                    type="button"
                    onClick={() => setFormData({...formData, validation: !formData.validation})}
                    className={`relative inline-flex h-4 w-8 items-center rounded-full transition-colors ${formData.validation ? 'bg-emerald-500' : 'bg-gray-300 dark:bg-slate-700'}`}
                  >
                    <span className={`inline-block h-2.5 w-2.5 transform rounded-full bg-white transition-transform ${formData.validation ? 'translate-x-4.5' : 'translate-x-1'}`} />
                  </button>
                </div>
                {formData.validation && (() => {
                  const currentMetrics = getSloMetrics();
                  return (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 dark:border-slate-800 bg-gray-50 dark:bg-slate-900 px-3 py-2">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                            {activeValidationProfile.name}
                          </p>
                          <p className="text-xs text-gray-500 dark:text-slate-400 truncate">
                            {activeValidationProfile.description}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setIsValidationProfileModalOpen(true)}
                          className="shrink-0 rounded-md border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-100 dark:border-indigo-500/30 dark:bg-indigo-500/10 dark:text-indigo-300 dark:hover:bg-indigo-500/20"
                        >
                          {t('manageProfiles') || 'Manage Profiles'}
                        </button>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        {(isMultiCluster ? Object.keys(selectedClusters) : [formData.clusterId]).map((clusterId) => {
                          const profileId = clusterValidationProfiles[clusterId] || formData.sloConfig;
                          const profileName =
                            validationProfiles.find((profile) => profile.id === profileId)?.name || profileId;
                          return (
                            <span
                              key={clusterId}
                              className="text-[10px] font-semibold bg-slate-100 dark:bg-slate-800/90 text-slate-600 dark:text-slate-300 px-2 py-1 rounded"
                            >
                              {clusterId}: {profileName}
                            </span>
                          );
                        })}
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <span className="text-[10px] font-semibold bg-gray-100 dark:bg-slate-800 text-gray-500 px-2 py-1 rounded">TTFT &lt; {currentMetrics.ttft}ms</span>
                        <span className="text-[10px] font-semibold bg-gray-100 dark:bg-slate-800 text-gray-500 px-2 py-1 rounded">TPS &gt; {currentMetrics.tps}</span>
                        <span className="text-[10px] font-semibold bg-gray-100 dark:bg-slate-800 text-gray-500 px-2 py-1 rounded">TPOT &lt; {currentMetrics.tpot}ms</span>
                        <span className="text-[10px] font-semibold bg-gray-100 dark:bg-slate-800 text-gray-500 px-2 py-1 rounded">Queue &lt; {currentMetrics.queue}</span>
                        <span className="text-[10px] font-semibold bg-gray-100 dark:bg-slate-800 text-gray-500 px-2 py-1 rounded">KV-cache &lt; {currentMetrics.kvCache}%</span>
                        <span className="text-[10px] font-semibold bg-gray-100 dark:bg-slate-800 text-gray-500 px-2 py-1 rounded">Error rate &lt; {currentMetrics.errorRate}%</span>
                      </div>
                    </div>
                  );
                })()}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
                  {t('team')}
                  <FieldTooltip content={t('teamTooltip') || "Assign this deployment to a team for access control and billing."} />
                </label>
                <select 
                  value={formData.team}
                  onChange={(e) => setFormData({...formData, team: e.target.value})}
                  className="w-full rounded-lg border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:text-white"
                >
                  <option value="Data Science">Data Science</option>
                  <option value="Backend API">Backend API</option>
                  <option value="Analytics">Analytics</option>
                  <option value="R&D">R&D</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">{t('product')}</label>
                <input 
                  type="text" 
                  value={formData.product}
                  onChange={(e) => setFormData({...formData, product: e.target.value})}
                  placeholder="e.g. Smart Assistant"
                  className="w-full rounded-lg border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:text-white"
                />
              </div>

              <button 
                type="submit"
                disabled={isDeploying || !formData.product}
                className="w-full mt-6 flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 dark:disabled:bg-indigo-800 text-white px-4 py-2.5 rounded-lg text-sm font-medium transition-colors"
              >
                {isDeploying ? <Loader2 className="w-4 h-4 animate-spin" /> : <Rocket className="w-4 h-4" />}
                {t('deployModelBtn') || 'Deploy Model'}
              </button>
            </form>
          </div>
        </div>

        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white dark:bg-slate-950 rounded-xl border border-gray-200 dark:border-slate-800 p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-6">{t('preDeployPipeline') || 'Pre-deploy Pipeline'}</h2>
            
            <div className="space-y-8">
              {(() => {
                const groupsToDisplay = deployment?.clusterGroups || (isMultiCluster ? Object.entries(selectedClusters).map(([cid, reps]) => ({
                  clusterId: cid,
                  replicas: Number(reps),
                  status: (isDeploying ? 'pending' : 'pending') as any,
                  progress: 0,
                  pods: Array.from({ length: Number(reps) }).map((_, idx) => ({
                    name: `pod-${cid.split('-')[0]}-${101 + idx}`,
                    status: (isDeploying ? 'pending' : 'pending') as any,
                    progress: 0,
                    stage: isDeploying ? 'Scheduling...' : 'Selected (Draft)'
                  }))
                })) : []);

                if (!isMultiCluster) {
                  return (
                    <div className="relative">
                      <div className="absolute left-3 top-8 bottom-0 w-0.5 bg-gray-200 dark:bg-slate-800"></div>
                      
                      <div className="space-y-6 relative">
                        <div className="flex gap-4">
                          <div className="relative z-10 bg-white dark:bg-slate-950">
                            <StepIcon status={getStepStatus(1)} />
                          </div>
                          <div className="pt-0.5">
                            <h3 className="text-sm font-medium text-gray-900 dark:text-white">{t('creatingPod') || 'Creating pod'}</h3>
                            <p className="text-xs text-gray-500 dark:text-slate-400 mt-1 uppercase tracking-tighter">{t('cluster')}: {formData.clusterId}</p>
                          </div>
                        </div>

                        <div className="flex gap-4">
                          <div className="relative z-10 bg-white dark:bg-slate-950">
                            <StepIcon status={getStepStatus(2)} />
                          </div>
                          <div className="pt-0.5">
                            <h3 className="text-sm font-medium text-gray-900 dark:text-white">{t('pullingModel') || 'Pulling model'}</h3>
                            <p className="text-xs text-gray-500 dark:text-slate-400 mt-1">{t('downloadingWeights') || 'Downloading weights'}</p>
                          </div>
                        </div>

                        {formData.validation && (
                          <div className="flex gap-4">
                            <div className="relative z-10 bg-white dark:bg-slate-950">
                              <StepIcon status={getStepStatus(3)} />
                            </div>
                            <div className="pt-0.5">
                              <h3 className="text-sm font-medium text-gray-900 dark:text-white">SLO Validation</h3>
                              <p className="text-xs text-gray-500 dark:text-slate-400 mt-1 mb-2">Checking threshold metrics against '{formData.sloConfig}' profile</p>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-w-sm font-mono text-[10px]">
                                <div className="flex items-center justify-between bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-1.5 rounded">
                                   <span className="text-slate-500">TTFT &lt; {getSloMetrics().ttft}ms</span>
                                   {getStepStatus(3) === 'done' ? <span className="text-emerald-500 font-bold">PASS</span> : <span className="text-slate-400">-</span>}
                                </div>
                                <div className="flex items-center justify-between bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-1.5 rounded">
                                   <span className="text-slate-500">TPS &gt; {getSloMetrics().tps}</span>
                                   {getStepStatus(3) === 'done' ? <span className="text-emerald-500 font-bold">PASS</span> : <span className="text-slate-400">-</span>}
                                </div>
                                <div className="flex items-center justify-between bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-1.5 rounded">
                                   <span className="text-slate-500">TPOT &lt; {getSloMetrics().tpot}ms</span>
                                   {getStepStatus(3) === 'done' ? <span className="text-emerald-500 font-bold">PASS</span> : <span className="text-slate-400">-</span>}
                                </div>
                                <div className="flex items-center justify-between bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-1.5 rounded">
                                   <span className="text-slate-500">QUEUE &lt; {getSloMetrics().queue}</span>
                                   {getStepStatus(3) === 'done' ? <span className="text-emerald-500 font-bold">PASS</span> : <span className="text-slate-400">-</span>}
                                </div>
                                <div className="flex items-center justify-between bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-1.5 rounded">
                                   <span className="text-slate-500">KV &lt; {getSloMetrics().kvCache}%</span>
                                   {getStepStatus(3) === 'done' ? <span className="text-emerald-500 font-bold">PASS</span> : <span className="text-slate-400">-</span>}
                                </div>
                                <div className="flex items-center justify-between bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-1.5 rounded">
                                   <span className="text-slate-500">ERR &lt; {getSloMetrics().errorRate}%</span>
                                   {getStepStatus(3) === 'done' ? <span className="text-emerald-500 font-bold">PASS</span> : <span className="text-slate-400">-</span>}
                                </div>
                              </div>
                            </div>
                          </div>
                        )}

                        <div className="flex gap-4">
                          <div className="relative z-10 bg-white dark:bg-slate-950">
                            <StepIcon status={getStepStatus(formData.validation ? 4 : 3)} />
                          </div>
                          <div className="pt-0.5">
                            <h3 className="text-sm font-medium text-gray-900 dark:text-white">{t('modelReady') || 'Model ready'}</h3>
                            <p className="text-xs text-gray-500 dark:text-slate-400 mt-1 text-emerald-500 font-bold uppercase tracking-widest text-[10px]">{t('servingTraffic') || 'Serving Traffic'}</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                }

                return (
                  <div className="space-y-6">
                    {groupsToDisplay.map((group) => {
                      const pods = group.pods || Array.from({ length: group.replicas }).map((_, idx) => ({
                        name: `pod-${group.clusterId.split('-')[0]}-${101 + idx}`,
                        status: group.status,
                        progress: group.progress,
                        stage: group.status === 'running' ? 'Healthy' : group.status === 'pulling' ? 'Downloading model...' : 'Scheduling'
                      }));

                      return (
                        <div key={group.clusterId} className="p-5 bg-gray-50 dark:bg-slate-900/50 rounded-xl border border-gray-200 dark:border-slate-800 space-y-4">
                          {/* Cluster Header */}
                          <div className="flex items-center justify-between border-b border-gray-100 dark:border-slate-800/60 pb-3">
                            <div className="flex items-center gap-2.5">
                              <div className={`w-2.5 h-2.5 rounded-full ${group.status === 'running' ? 'bg-emerald-500 animate-pulse' : 'bg-indigo-500 animate-bounce'}`}></div>
                              <div>
                                <span className="text-sm font-bold text-gray-900 dark:text-white block">{group.clusterId}</span>
                                <span className="text-[10px] text-gray-400 font-medium uppercase tracking-wider">{group.replicas} {group.replicas === 1 ? 'Pod' : 'Pods'} Allocated</span>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] font-bold text-gray-500 dark:text-slate-400 bg-gray-100 dark:bg-slate-800 px-2 py-0.5 rounded uppercase">
                                {group.status}
                              </span>
                            </div>
                          </div>

                          {/* Cluster Progress Bar */}
                          <div className="space-y-1">
                            <div className="flex justify-between text-[10px] font-semibold text-gray-500">
                              <span>{t('overallClusterProgress') || 'Overall Cluster Progress'}</span>
                              <span>{group.progress}%</span>
                            </div>
                            <div className="w-full h-1.5 bg-gray-200 dark:bg-slate-800 rounded-full overflow-hidden">
                              <div 
                                className="h-full bg-indigo-500 transition-all duration-1000" 
                                style={{ width: `${group.progress}%` }}
                              ></div>
                            </div>
                          </div>

                          {/* Pods Deployment Checklist */}
                          <div className="space-y-2 mt-4">
                            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">{t('podsDeploymentStatus') || 'Individual Replica Pod Details'}</span>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                              {pods.map((pod, pIdx) => (
                                <div key={pIdx} className="p-3 bg-white dark:bg-slate-950 border border-gray-200/60 dark:border-slate-800/60 rounded-lg space-y-2">
                                  {/* Pod Name and Status Header */}
                                  <div className="flex items-center justify-between text-[11px] font-mono">
                                    <div className="flex items-center gap-1.5 font-sans">
                                      {pod.status === 'running' ? (
                                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                                      ) : pod.status === 'pulling' ? (
                                        <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-ping"></span>
                                      ) : (
                                        <span className="w-1.5 h-1.5 rounded-full bg-gray-300 dark:bg-slate-700"></span>
                                      )}
                                      <span className="font-semibold text-gray-700 dark:text-slate-300 font-mono text-[10px]">{pod.name}</span>
                                    </div>
                                    <span className={`text-[8px] px-1.5 py-0.2 rounded font-semibold uppercase ${
                                      pod.status === 'running' ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' :
                                      pod.status === 'pulling' ? 'bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400' :
                                      'bg-gray-100 dark:bg-slate-800 text-gray-500 dark:text-slate-400'
                                    }`}>
                                      {pod.status}
                                    </span>
                                  </div>

                                  {/* Pod mini metric / progress */}
                                  <div className="space-y-1">
                                    <div className="w-full h-1 bg-gray-100 dark:bg-slate-800 rounded-full overflow-hidden">
                                      <div 
                                        className={`h-full transition-all duration-1000 ${pod.status === 'running' ? 'bg-emerald-500' : 'bg-indigo-500'}`}
                                        style={{ width: `${pod.progress}%` }}
                                      ></div>
                                    </div>
                                    <div className="flex justify-between text-[9px] text-gray-400">
                                      <span className="truncate max-w-[130px]" title={pod.stage || pod.status}>
                                        {pod.stage || (pod.status === 'running' ? 'Ready' : pod.status === 'pulling' ? 'Downloading...' : 'Scheduling...')}
                                      </span>
                                      <span className="font-mono">{pod.progress}%</span>
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>

            {deployment?.status === 'running' && (
              <div className="mt-8 space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="p-4 bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 rounded-lg flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 mt-0.5" />
                  <div>
                    <h4 className="text-sm font-medium text-emerald-800 dark:text-emerald-400">{t('modelReadyServing') || 'Model is ready and serving requests'}</h4>
                    <p className="text-xs text-emerald-600 dark:text-emerald-500 mt-1">{t('youCanNowSendAPI') || 'You can now send API requests to the cluster.'}</p>
                  </div>
                </div>

                <div className="relative group">
                  <div className="absolute right-2 top-2">
                    <button 
                      onClick={handleCopy}
                      className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-md transition-colors"
                    >
                      {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                    </button>
                  </div>
                  <pre className="bg-slate-950 text-slate-300 p-4 rounded-lg text-xs font-mono overflow-x-auto border border-slate-800">
                    <code>
                      curl http://{formData.clusterId}:11434/api/chat -d '{`{"model":"${formData.modelName}","messages":[{"role":"user","content":"Hello"}]}`}'
                    </code>
                  </pre>
                </div>
              </div>
            )}
            
            {deployment?.status === 'failed' && (
              <div className="mt-8 p-4 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-lg flex items-start gap-3">
                <CircleDashed className="w-5 h-5 text-red-600 dark:text-red-400 mt-0.5" />
                <div>
                  <h4 className="text-sm font-medium text-red-800 dark:text-red-400">{t('deploymentFailed') || 'Deployment failed'}</h4>
                  <p className="text-xs text-red-600 dark:text-red-500 mt-1">{deployment.message || (t('unknownErrorOccurred') || 'Unknown error occurred')}</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {isValidationProfileModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-3xl rounded-2xl border border-gray-200 bg-white shadow-xl dark:border-slate-800 dark:bg-slate-950">
            <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4 dark:border-slate-800">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                  {t('validationProfiles') || 'Validation Profiles'}
                </h3>
                <p className="text-xs text-gray-500 dark:text-slate-400 mt-1">
                  {t('chooseOrCreateValidationProfile') || 'Choose existing profile or create a new one.'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsValidationProfileModalOpen(false)}
                className="rounded-md border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-900"
              >
                {t('close') || 'Close'}
              </button>
            </div>

            <div className="grid gap-6 p-6 lg:grid-cols-2">
              <div className="space-y-3">
                <h4 className="text-sm font-semibold text-gray-900 dark:text-white">
                  {t('existingProfiles') || 'Existing profiles'}
                </h4>
                <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
                  {validationProfiles.map((profile) => (
                    <label
                      key={profile.id}
                      className={`flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2 transition-colors ${
                        modalSelectedProfileId === profile.id
                          ? 'border-indigo-300 bg-indigo-50 dark:border-indigo-500/40 dark:bg-indigo-500/10'
                          : 'border-gray-200 bg-white hover:bg-gray-50 dark:border-slate-800 dark:bg-slate-950 dark:hover:bg-slate-900/60'
                      }`}
                    >
                      <input
                        type="radio"
                        name="validation-profile"
                        className="mt-1"
                        checked={modalSelectedProfileId === profile.id}
                        onChange={() => setModalSelectedProfileId(profile.id)}
                      />
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-gray-900 dark:text-white">{profile.name}</p>
                        <p className="text-xs text-gray-500 dark:text-slate-400">{profile.description}</p>
                      </div>
                    </label>
                  ))}
                </div>

                <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-slate-800 dark:bg-slate-900">
                  <h5 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400">
                    {t('applySettings') || 'Apply settings'}
                  </h5>
                  <div className="mt-2 space-y-2">
                    <label className="flex items-center gap-2 text-xs text-gray-700 dark:text-slate-300">
                      <input
                        type="checkbox"
                        checked={applyProfileToAllClusters}
                        onChange={(e) => setApplyProfileToAllClusters(e.target.checked)}
                      />
                      {t('applyToAllClusters') || 'Apply to all selected clusters'}
                    </label>
                    {!applyProfileToAllClusters && (
                      <div>
                        <label className="mb-1 block text-[11px] text-gray-500 dark:text-slate-400">
                          {t('targetCluster') || 'Target Cluster'}
                        </label>
                        <select
                          value={profileTargetClusterId}
                          onChange={(e) => setProfileTargetClusterId(e.target.value)}
                          className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                        >
                          {(isMultiCluster ? Object.keys(selectedClusters) : [formData.clusterId]).map((clusterId) => (
                            <option key={clusterId} value={clusterId}>
                              {clusterId}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <h4 className="text-sm font-semibold text-gray-900 dark:text-white">
                  {t('createNewProfile') || 'Create new profile'}
                </h4>
                <input
                  type="text"
                  placeholder={t('profileName') || 'Profile name'}
                  value={newProfileName}
                  onChange={(e) => setNewProfileName(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                />
                <input
                  type="text"
                  placeholder={t('description') || 'Description'}
                  value={newProfileDescription}
                  onChange={(e) => setNewProfileDescription(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                />
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <label className="mb-1 block text-gray-500 dark:text-slate-400">TTFT (ms)</label>
                    <input type="number" value={newProfileMetrics.ttft} onChange={(e) => setNewProfileMetrics({ ...newProfileMetrics, ttft: Number(e.target.value) })} className="w-full rounded border border-gray-300 bg-white px-2 py-1.5 dark:border-slate-700 dark:bg-slate-950 dark:text-white" />
                  </div>
                  <div>
                    <label className="mb-1 block text-gray-500 dark:text-slate-400">TPS</label>
                    <input type="number" value={newProfileMetrics.tps} onChange={(e) => setNewProfileMetrics({ ...newProfileMetrics, tps: Number(e.target.value) })} className="w-full rounded border border-gray-300 bg-white px-2 py-1.5 dark:border-slate-700 dark:bg-slate-950 dark:text-white" />
                  </div>
                  <div>
                    <label className="mb-1 block text-gray-500 dark:text-slate-400">TPOT (ms)</label>
                    <input type="number" value={newProfileMetrics.tpot} onChange={(e) => setNewProfileMetrics({ ...newProfileMetrics, tpot: Number(e.target.value) })} className="w-full rounded border border-gray-300 bg-white px-2 py-1.5 dark:border-slate-700 dark:bg-slate-950 dark:text-white" />
                  </div>
                  <div>
                    <label className="mb-1 block text-gray-500 dark:text-slate-400">Queue</label>
                    <input type="number" value={newProfileMetrics.queue} onChange={(e) => setNewProfileMetrics({ ...newProfileMetrics, queue: Number(e.target.value) })} className="w-full rounded border border-gray-300 bg-white px-2 py-1.5 dark:border-slate-700 dark:bg-slate-950 dark:text-white" />
                  </div>
                  <div>
                    <label className="mb-1 block text-gray-500 dark:text-slate-400">KV-cache (%)</label>
                    <input type="number" value={newProfileMetrics.kvCache} onChange={(e) => setNewProfileMetrics({ ...newProfileMetrics, kvCache: Number(e.target.value) })} className="w-full rounded border border-gray-300 bg-white px-2 py-1.5 dark:border-slate-700 dark:bg-slate-950 dark:text-white" />
                  </div>
                  <div>
                    <label className="mb-1 block text-gray-500 dark:text-slate-400">Error rate (%)</label>
                    <input type="number" value={newProfileMetrics.errorRate} onChange={(e) => setNewProfileMetrics({ ...newProfileMetrics, errorRate: Number(e.target.value) })} className="w-full rounded border border-gray-300 bg-white px-2 py-1.5 dark:border-slate-700 dark:bg-slate-950 dark:text-white" />
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleCreateValidationProfile}
                  disabled={!newProfileName.trim()}
                  className="w-full rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm font-semibold text-indigo-700 hover:bg-indigo-100 disabled:opacity-50 dark:border-indigo-500/30 dark:bg-indigo-500/10 dark:text-indigo-300 dark:hover:bg-indigo-500/20"
                >
                  {t('createProfile') || 'Create Profile'}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-gray-100 px-6 py-4 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setIsValidationProfileModalOpen(false)}
                className="rounded-md border border-gray-200 px-3 py-2 text-xs font-medium text-gray-600 hover:bg-gray-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-900"
              >
                {t('cancel') || 'Cancel'}
              </button>
              <button
                type="button"
                onClick={() => {
                  applyValidationProfile(modalSelectedProfileId, applyProfileToAllClusters, profileTargetClusterId);
                  setIsValidationProfileModalOpen(false);
                }}
                className="rounded-md bg-indigo-600 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-700"
              >
                {t('apply') || 'Apply'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
