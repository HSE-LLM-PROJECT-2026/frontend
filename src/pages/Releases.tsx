import React, { useState, useEffect } from 'react';
import { 
  Rocket, 
  Pause, 
  Play, 
  RotateCcw, 
  FastForward, 
  CheckCircle2, 
  AlertTriangle, 
  Clock, 
  ArrowRight, 
  Activity, 
  X,
  Plus,
  ArrowUpRight,
  ChevronRight,
  Loader2,
  Globe,
  Settings,
  History,
  TrendingDown,
  BarChart2,
  Trash2,
  RefreshCw
} from 'lucide-react';
import { 
  getReleases, 
  pauseRelease, 
  resumeRelease, 
  rollbackRelease, 
  skipReleaseTo100, 
  startRelease,
  deleteRelease,
  retryRelease,
  getDeployments,
  getTrafficRoutes,
  REAL_CLUSTER_ID,
  mapRealtimeReleaseLike,
  Release,
  Deployment
} from '../api/platform';
import { buildRealtimeSocketUrl, parseRealtimeSocketMessage } from '../api/realtime';
import { isDemoModeEnabled } from '../api/demoMode';

import { useLanguage } from '../context/LanguageContext';
import { useCluster } from '../context/ClusterContext';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';

import { FieldTooltip } from '../components/FieldTooltip';
import { ConfirmDialog } from '../components/ConfirmDialog';

const DEMO_MODE = isDemoModeEnabled();

type PendingReleaseConfirmation =
  | {
      id: string;
      title: string;
      description: string;
      confirmLabel: string;
      variant: 'warning' | 'danger';
      execute: (id: string) => Promise<void>;
    }
  | null;

export function Releases() {
  const { t } = useLanguage();
  const { selectedClusterId } = useCluster();
  const [releases, setReleases] = useState<Release[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRelease, setSelectedRelease] = useState<Release | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [pendingConfirmation, setPendingConfirmation] = useState<PendingReleaseConfirmation>(null);
  const [isActionPending, setIsActionPending] = useState(false);

  const fetchData = async () => {
    try {
      setLoading(true);
      const data = await getReleases(selectedClusterId);
      setReleases(data);
    } catch (error) {
      console.error('Failed to load releases:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchData();
  }, [selectedClusterId]);

  useEffect(() => {
    if (DEMO_MODE || selectedClusterId !== REAL_CLUSTER_ID) {
      return;
    }

    let socket: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let stopped = false;

    const connect = () => {
      if (stopped) return;
      const wsUrl = buildRealtimeSocketUrl({
        scope: 'releases',
        intervalSeconds: 3,
      });
      socket = new WebSocket(wsUrl);

      socket.onmessage = (event) => {
        const message = parseRealtimeSocketMessage(event.data);
        if (!message || message.type !== 'state_snapshot') return;
        const rawReleases = Array.isArray(message.payload?.releases) ? message.payload.releases : null;
        if (!rawReleases) return;
        const mapped = rawReleases.map((item) => mapRealtimeReleaseLike(item));
        setReleases(mapped);
        setSelectedRelease((current) =>
          current ? mapped.find((release) => release.id === current.id) || null : null
        );
        setLoading(false);
      };

      socket.onclose = () => {
        if (stopped) return;
        reconnectTimer = setTimeout(connect, 3000);
      };
    };

    connect();

    return () => {
      stopped = true;
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
      }
      if (socket && socket.readyState <= WebSocket.OPEN) {
        socket.close();
      }
    };
  }, [selectedClusterId]);

  const runAction = async (action: (id: string) => Promise<void>, id: string) => {
    setIsActionPending(true);
    try {
      await action(id);
      await fetchData();
      const updated = await getReleases(selectedClusterId);
      setReleases(updated);
      if (selectedRelease?.id === id) {
        setSelectedRelease(updated.find((r) => r.id === id) || null);
      }
    } finally {
      setIsActionPending(false);
    }
  };

  const handleAction = async (action: (id: string) => Promise<void>, id: string) => {
    const selected = releases.find((release) => release.id === id);
    const releaseLabel = selected ? `${selected.name} (${selected.id})` : id;

    if (action === deleteRelease) {
      setPendingConfirmation({
        id,
        title: 'Удалить релиз?',
        description: `Релиз ${releaseLabel} будет удален без возможности восстановления.`,
        confirmLabel: 'Удалить',
        variant: 'danger',
        execute: deleteRelease,
      });
      return;
    }

    if (action === rollbackRelease) {
      setPendingConfirmation({
        id,
        title: 'Выполнить rollback релиза?',
        description: `Для релиза ${releaseLabel} трафик будет немедленно возвращен на исходную версию.`,
        confirmLabel: 'Rollback',
        variant: 'warning',
        execute: rollbackRelease,
      });
      return;
    }

    if (action === skipReleaseTo100) {
      setPendingConfirmation({
        id,
        title: 'Перевести релиз сразу на 100%?',
        description: `Для релиза ${releaseLabel} это обойдет промежуточные шаги и проверки стратегии.`,
        confirmLabel: 'Перевести на 100%',
        variant: 'warning',
        execute: skipReleaseTo100,
      });
      return;
    }

    await runAction(action, id);
  };

  const confirmPendingAction = async () => {
    if (!pendingConfirmation) return;
    const { execute, id } = pendingConfirmation;
    setPendingConfirmation(null);
    await runAction(execute, id);
  };

  return (
    <div className="max-w-7xl mx-auto pb-20 relative">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-3">
             <Rocket className="w-8 h-8 text-indigo-600" />
             {t('releases')}
          </h1>
          <p className="text-sm text-gray-500 mt-1">
             {t('releasesSub')}
          </p>
        </div>
        
        <button 
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium shadow-sm transition-all shadow-indigo-500/10"
        >
          <Plus className="w-4 h-4" />
          {t('startRelease')}
        </button>
      </div>

      {/* Main Table */}
      <div className="bg-white dark:bg-slate-950 border border-gray-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50 dark:bg-slate-900/50 text-xs font-semibold uppercase tracking-wider text-gray-500 border-b border-gray-200 dark:border-slate-800">
                <th className="px-6 py-4">{t('release') || 'Release'}</th>
                <th className="px-6 py-4">{t('status')}</th>
                <th className="px-6 py-4 text-center">{t('rolloutProgress') || 'Rollout Progress'}</th>
                <th className="px-6 py-4">{t('sloHealth') || 'SLO / Health'}</th>
                <th className="px-6 py-4 text-right">{t('started') || 'Started'}</th>
                <th className="px-6 py-4 text-right">{t('actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-slate-900">
              {loading && releases.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-8 py-20 text-center">
                    <Loader2 className="w-8 h-8 animate-spin text-indigo-500 mx-auto" />
                  </td>
                </tr>
              ) : (
                releases.map(rel => (
                  <tr 
                    key={rel.id} 
                    onClick={() => setSelectedRelease(rel)}
                    className={cn(
                      "group cursor-pointer transition-colors",
                      selectedRelease?.id === rel.id ? "bg-indigo-50/50 dark:bg-indigo-500/5" : "hover:bg-gray-50 dark:hover:bg-slate-900/50"
                    )}
                  >
                    <td className="px-8 py-5">
                      <div className="flex flex-col">
                        <span className="text-sm font-black text-gray-900 dark:text-white uppercase tracking-tight">
                           {rel.name}
                        </span>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-[10px] font-bold text-gray-400 uppercase">{rel.sourceId}</span>
                          <ArrowRight className="w-3 h-3 text-gray-300" />
                          <span className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 uppercase">{rel.targetId}</span>
                        </div>
                      </div>
                    </td>
                    <td className="px-8 py-5">
                       <StatusBadge status={rel.status} />
                    </td>
                    <td className="px-8 py-5">
                       <div className="flex flex-col items-center gap-1.5">
                          <div className="w-24 h-1.5 bg-gray-100 dark:bg-slate-800 rounded-full overflow-hidden">
                             <motion.div 
                               initial={{ width: 0 }}
                               animate={{ width: `${rel.currentPercent}%` }}
                               className={cn(
                                 "h-full rounded-full",
                                 rel.status === 'rolled-back' ? 'bg-red-500' : 'bg-indigo-500'
                               )} 
                             />
                          </div>
                          <span className="text-[10px] font-black text-gray-900 dark:text-white">{rel.currentPercent}%</span>
                       </div>
                    </td>
                    <td className="px-8 py-5">
                       <div className="flex flex-col">
                          <div className="flex items-center gap-2">
                             <span className={cn(
                               "text-sm font-black",
                               rel.sloHealthy ? "text-emerald-600" : "text-red-600"
                             )}>
                                {(100 - rel.currentMetrics.errorRate).toFixed(2)}%
                             </span>
                             {rel.sloHealthy ? (
                               <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                             ) : (
                               <AlertTriangle className="w-3.5 h-3.5 text-red-500 animate-pulse" />
                             )}
                          </div>
                          <span className="text-[10px] text-gray-400 font-bold uppercase tracking-tighter">p99: {rel.currentMetrics.latencyP99}ms</span>
                       </div>
                    </td>
                    <td className="px-8 py-5 text-right">
                       <span className="text-[10px] font-bold text-gray-400 uppercase">
                          {new Date(rel.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                       </span>
                    </td>
                    <td className="px-8 py-5 text-right">
                       <div className="flex items-center justify-end gap-2">
                         <button
                           onClick={(e) => {
                             e.stopPropagation();
                             handleAction(deleteRelease, rel.id);
                           }}
                           className="p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-md transition-colors"
                         >
                           <Trash2 className="w-4 h-4" />
                         </button>
                         <button
                           onClick={(e) => {
                             e.stopPropagation();
                             setSelectedRelease(rel);
                           }}
                           className="px-3 py-1.5 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-800 rounded-md text-xs font-semibold text-gray-700 dark:text-gray-300 transition-colors shadow-sm"
                         >
                           Edit
                         </button>
                       </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Side Panel */}
      <AnimatePresence>
        {selectedRelease && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedRelease(null)}
              className="fixed inset-0 bg-slate-950/20 backdrop-blur-sm z-40"
            />
            <motion.div 
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed right-0 top-0 h-full w-full max-w-2xl bg-white dark:bg-slate-950 border-l border-gray-200 dark:border-slate-800 z-50 shadow-2xl overflow-y-auto"
            >
              <ReleaseDetails 
                release={selectedRelease} 
                onClose={() => setSelectedRelease(null)} 
                onAction={handleAction}
              />
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Create Modal */}
      <AnimatePresence>
        {showCreateModal && (
          <CreateReleaseModal 
            onClose={() => setShowCreateModal(false)} 
            onCreated={fetchData} 
          />
        )}
      </AnimatePresence>

      <ConfirmDialog
        open={Boolean(pendingConfirmation)}
        title={pendingConfirmation?.title || ''}
        description={pendingConfirmation?.description}
        confirmLabel={pendingConfirmation?.confirmLabel}
        cancelLabel="Отмена"
        variant={pendingConfirmation?.variant || 'warning'}
        isLoading={isActionPending}
        onCancel={() => setPendingConfirmation(null)}
        onConfirm={confirmPendingAction}
      />
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const { t } = useLanguage();
  const config: any = {
    rolling: { bg: 'bg-indigo-50 text-indigo-600 border-indigo-100 dark:bg-indigo-500/10 dark:text-indigo-400 dark:border-indigo-500/20', icon: Activity, animate: true },
    paused: { bg: 'bg-amber-50 text-amber-600 border-amber-100 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20', icon: Pause },
    succeeded: { bg: 'bg-emerald-50 text-emerald-600 border-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20', icon: CheckCircle2 },
    rolledback: { bg: 'bg-red-50 text-red-600 border-red-100 dark:bg-red-500/10 dark:text-red-400 dark:border-red-500/20', icon: RotateCcw },
    failed: { bg: 'bg-red-50 text-red-600 border-red-100 dark:bg-red-500/10 dark:text-red-400 dark:border-red-500/20', icon: AlertTriangle }
  };

  const key = status.replace('-', '');
  const cfg = config[key] || config.rolling;
  const Icon = cfg.icon;

  return (
    <div className={cn(
      "flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[10px] font-semibold uppercase tracking-wider",
      cfg.bg
    )}>
      <Icon className={cn("w-3.5 h-3.5", cfg.animate && "animate-spin")} style={cfg.animate ? { animationDuration: '3s' } : {}}/>
      {t(status.replace('-', '')) || status.replace('-', ' ')}
    </div>
  );
}

function ReleaseDetails({ release: rel, onClose, onAction }: { release: Release, onClose: () => void, onAction: any }) {
  const { t } = useLanguage();

  return (
    <div className="flex flex-col h-full">
      <div className="p-8 border-b border-gray-100 dark:border-slate-800 flex items-center justify-between bg-gray-50/50 dark:bg-slate-900/30">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-indigo-600 text-white rounded-xl shadow-lg shadow-indigo-500/10">
            <Rocket className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">{rel.name}</h2>
            <div className="flex items-center gap-2 mt-1">
               <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">ID: {rel.id}</span>
               <div className="w-1 h-1 rounded-full bg-gray-300" />
               <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">{rel.strategy}</span>
            </div>
          </div>
        </div>
        <button 
          onClick={onClose}
          className="p-2 hover:bg-gray-200 dark:hover:bg-slate-800 rounded-lg transition-colors"
        >
          <X className="w-5 h-5 text-gray-400" />
        </button>
      </div>

      <div className="flex-1 p-8 overflow-y-auto space-y-10 custom-scrollbar">
        {/* Progress & Quick Actions */}
        <div className="space-y-6">
           <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400">Rollout Progress</h3>
              <div className="text-xs font-semibold text-indigo-600 tabular-nums">
                 {rel.currentPercent}% target reached
              </div>
           </div>
           
           <div className="h-3 bg-gray-100 dark:bg-slate-900 rounded-full overflow-hidden p-0.5 border border-gray-200 dark:border-slate-800">
              <motion.div 
                 initial={{ width: 0 }}
                 animate={{ width: `${rel.currentPercent}%` }}
                 className={cn(
                   "h-full rounded-full transition-all duration-300 relative",
                   rel.status === 'rolled-back' ? 'bg-red-500' : 'bg-indigo-600'
                 )}
              >
                 <div className="absolute inset-0 bg-white/20 animate-pulse" />
              </motion.div>
           </div>

           {(rel.status === 'rolling' || rel.status === 'paused') && (
             <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mt-4">
                <ButtonAction 
                  icon={rel.status === 'paused' ? Play : Pause} 
                  label={rel.status === 'paused' ? t('resume') : t('pause')}
                  onClick={() => onAction(rel.status === 'paused' ? resumeRelease : pauseRelease, rel.id)}
                  color={rel.status === 'paused' ? 'indigo' : 'amber'}
                />
                <ButtonAction 
                  icon={RotateCcw} 
                  label={t('rollback')} 
                  onClick={() => onAction(rollbackRelease, rel.id)}
                  color="red"
                />
                <ButtonAction 
                  icon={FastForward} 
                  label={t('skipTo100')} 
                  onClick={() => onAction(skipReleaseTo100, rel.id)}
                  color="emerald"
                />
             </div>
           )}

           {(rel.status === 'rolled-back') && (
             <div className="grid grid-cols-2 gap-3 mt-4">
                <ButtonAction 
                  icon={RefreshCw} 
                  label={t('retry') || 'Retry Rollout'} 
                  onClick={() => onAction(retryRelease, rel.id)}
                  color="indigo"
                />
                <ButtonAction 
                  icon={Trash2} 
                  label={t('delete') || 'Delete Release'} 
                  onClick={() => onAction(deleteRelease, rel.id)}
                  color="red"
                />
             </div>
           )}

           {(rel.status === 'succeeded' || rel.status === 'failed') && (
             <div className="mt-4">
                <ButtonAction 
                  icon={Trash2} 
                  label={t('delete') || 'Delete Release'} 
                  onClick={() => onAction(deleteRelease, rel.id)}
                  color="red"
                />
             </div>
           )}
        </div>

        {/* Real-time Metrics */}
        <div className="space-y-4">
           <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400">Live Comparison</h3>
           <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <MetricCard 
                title="SOURCE VERSION" 
                metrics={rel.sourceMetrics} 
                isTarget={false}
                label={rel.sourceCluster || rel.sourceId}
              />
              <MetricCard 
                title="TARGET VERSION" 
                metrics={rel.currentMetrics} 
                isTarget={true}
                label={rel.targetCluster || rel.targetId}
              />
           </div>
        </div>

        {/* Timeline */}
        <div className="space-y-6">
           <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400">{t('timeline')}</h3>
           <div className="relative pl-8 space-y-8 before:absolute before:left-[11px] before:top-2 before:bottom-2 before:w-0.5 before:bg-gray-100 dark:before:bg-slate-800">
             {rel.steps.map((step, idx) => (
                <div key={idx} className="relative group">
                   <div className={cn(
                     "absolute -left-10 w-6 h-6 rounded-lg flex items-center justify-center border-4 border-white dark:border-slate-950 z-10",
                     step.status === 'completed' ? "bg-emerald-500" :
                     step.status === 'active' ? "bg-indigo-600 animate-pulse" : "bg-gray-200 dark:bg-slate-800"
                   )}>
                      {step.status === 'completed' && <CheckCircle2 className="w-3 h-3 text-white" />}
                   </div>
                   
                   <div className={cn(
                     "p-5 rounded-xl border transition-all",
                     step.status === 'active' ? "bg-indigo-50/50 dark:bg-indigo-500/5 border-indigo-200 dark:border-indigo-500/20" : "bg-white dark:bg-slate-950 border-gray-100 dark:border-slate-900"
                   )}>
                      <div className="flex items-center justify-between mb-3">
                         <span className="text-sm font-semibold uppercase tracking-wider">{step.percent}% Traffic Shift</span>
                         {step.timestamp && (
                            <span className="text-[10px] font-semibold text-gray-400 uppercase">{new Date(step.timestamp).toLocaleTimeString()}</span>
                         )}
                      </div>
                      
                      {step.metrics && (
                        <div className="flex items-center gap-4">
                           <div className="flex items-center gap-1">
                              <Activity className="w-3.5 h-3.5 text-gray-400" />
                              <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">{step.metrics.latencyP99}ms</span>
                           </div>
                           <div className="flex items-center gap-1">
                              <AlertTriangle className="w-3.5 h-3.5 text-gray-400" />
                              <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">{step.metrics.errorRate}%</span>
                           </div>
                        </div>
                      )}
                   </div>
                </div>
             ))}
           </div>
        </div>

        {/* Event Log */}
        <div className="space-y-4">
           <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400">{t('events')}</h3>
           <div className="bg-gray-50 dark:bg-slate-900/50 rounded-xl p-6 space-y-4 border border-gray-100 dark:border-slate-800">
              {rel.events.map((ev, idx) => (
                <div key={idx} className="flex gap-4 group">
                   <span className="text-[10px] font-semibold text-gray-400 uppercase w-12 pt-1">{new Date(ev.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                   <div className="flex-1">
                      <p className="text-xs font-semibold text-gray-700 dark:text-slate-300">{ev.message}</p>
                   </div>
                </div>
              ))}
           </div>
        </div>
      </div>
    </div>
  );
}

function MetricCard({ title, metrics, isTarget, label }: { title: string, metrics: any, isTarget: boolean, label: string }) {
  return (
    <div className={cn(
      "p-6 rounded-xl border shadow-sm",
      isTarget ? "bg-indigo-50/30 dark:bg-indigo-500/5 border-indigo-100 dark:border-indigo-500/20" : "bg-white dark:bg-slate-950 border-gray-100 dark:border-slate-900"
    )}>
       <div className="flex items-center justify-between mb-4">
          <h4 className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">{title}</h4>
          <span className="text-[10px] font-semibold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider">{label}</span>
       </div>
       
       <div className="space-y-4">
          <div className="flex items-center justify-between">
             <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-gray-400" />
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">p99 Latency</span>
             </div>
             <span className="text-lg font-bold text-gray-900 dark:text-white">{metrics.latencyP99}ms</span>
          </div>
          <div className="flex items-center justify-between">
             <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-gray-400" />
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Error Rate</span>
             </div>
             <span className={cn(
               "text-lg font-bold",
               metrics.errorRate > 5 ? "text-red-600" : "text-emerald-600"
             )}>{metrics.errorRate}%</span>
          </div>
          <div className="flex items-center justify-between">
             <div className="flex items-center gap-2">
                <TrendingDown className="w-4 h-4 text-gray-400" />
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Throughput</span>
             </div>
             <span className="text-lg font-bold text-gray-900 dark:text-white">{metrics.throughput} rps</span>
          </div>
       </div>
    </div>
  );
}

function ButtonAction({ icon: Icon, label, onClick, color }: any) {
  const colors: any = {
    indigo: 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-indigo-500/10',
    amber: 'bg-amber-50 text-amber-600 hover:bg-amber-100 border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20',
    red: 'bg-red-50 text-red-600 hover:bg-red-100 border-red-200 dark:bg-red-500/10 dark:text-red-400 dark:border-red-500/20',
    emerald: 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20',
    slate: 'bg-slate-50 text-slate-600 hover:bg-slate-100 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700'
  };

  return (
    <button 
      onClick={onClick}
      className={cn(
        "flex flex-col items-center justify-center p-3 rounded-xl border transition-all active:scale-95 shadow-sm",
        colors[color]
      )}
    >
      <Icon className="w-5 h-5 mb-1.5" />
      <span className="text-[10px] font-semibold uppercase tracking-wider">{label}</span>
    </button>
  );
}

function CreateReleaseModal({ onClose, onCreated }: { onClose: () => void, onCreated: () => void }) {
  const { t } = useLanguage();
  const { selectedClusterId } = useCluster();
  const [loading, setLoading] = useState(false);
  const [loadingOptions, setLoadingOptions] = useState(true);
  const [routes, setRoutes] = useState<any[]>([]);
  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [sloSelection, setSloSelection] = useState({
    latency: true,
    errors: true,
  });
  
  const [formData, setFormData] = useState({
    name: '',
    routeId: '',
    sourceId: '',
    targetId: '',
    strategy: 'step' as const,
    sloLatency: 300,
    sloErrors: 1.0,
  });

  const buildAutoReleaseName = (routeId: string, targetId: string, deps: Deployment[]) => {
    const targetDeployment = deps.find((item) => item.id === targetId);
    const baseRaw = targetDeployment?.modelName || routeId || 'release';
    const base = baseRaw
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48) || 'release';
    const now = new Date();
    const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(
      now.getDate()
    ).padStart(2, '0')}-${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(
      2,
      '0'
    )}`;
    return `${base}-${stamp}`;
  };

  const deriveSourceTarget = (
    routeId: string,
    deps: Deployment[],
    routeList: any[],
    preferredTargetId?: string
  ) => {
    const route = routeList.find((item) => item.id === routeId);
    const routeBackends = Array.isArray(route?.backends) ? route.backends : [];
    const backendByWeight = [...routeBackends].sort(
      (left: any, right: any) => Number(right?.weight ?? 0) - Number(left?.weight ?? 0)
    );

    const sourceFromRoute =
      backendByWeight.find((item: any) =>
        deps.some((deployment) => deployment.id === item?.deploymentId)
      )?.deploymentId || '';

    const targetFromRoute =
      backendByWeight.find(
        (item: any) =>
          item?.deploymentId &&
          item.deploymentId !== sourceFromRoute &&
          deps.some((deployment) => deployment.id === item.deploymentId)
      )?.deploymentId || '';

    const fallbackTarget =
      deps.find((item) => item.id !== sourceFromRoute)?.id || deps[0]?.id || '';

    const resolvedTarget =
      (preferredTargetId &&
        preferredTargetId !== sourceFromRoute &&
        deps.some((item) => item.id === preferredTargetId) &&
        preferredTargetId) ||
      targetFromRoute ||
      fallbackTarget;

    const fallbackSource = deps.find((item) => item.id !== resolvedTarget)?.id || deps[0]?.id || '';
    const resolvedSource = sourceFromRoute || fallbackSource;

    return {
      sourceId: resolvedSource,
      targetId: resolvedTarget,
    };
  };

  useEffect(() => {
    async function load() {
      setLoadingOptions(true);
      try {
        const deps = await getDeployments(selectedClusterId);
        const routeList = await getTrafficRoutes(selectedClusterId);

        setDeployments(deps);
        setRoutes(routeList);

        const initialRouteId = routeList[0]?.id || '';
        const derived = deriveSourceTarget(initialRouteId, deps, routeList);

        setFormData((prev) => {
          const nextName = prev.name || buildAutoReleaseName(initialRouteId, derived.targetId, deps);
          return {
            ...prev,
            name: nextName,
            routeId: initialRouteId,
            sourceId: derived.sourceId,
            targetId: derived.targetId,
          };
        });
      } catch (error) {
        console.error('Failed to load release form options:', error);
      } finally {
        setLoadingOptions(false);
      }
    }
    void load();
  }, [selectedClusterId]);

  useEffect(() => {
    if (!formData.routeId || routes.length === 0 || deployments.length === 0) return;
    const derived = deriveSourceTarget(formData.routeId, deployments, routes, formData.targetId);
    if (derived.sourceId === formData.sourceId && derived.targetId === formData.targetId) return;

    setFormData((prev) => ({
      ...prev,
      sourceId: derived.sourceId,
      targetId: derived.targetId,
      name: prev.name || buildAutoReleaseName(prev.routeId, derived.targetId, deployments),
    }));
  }, [formData.routeId, routes, deployments, formData.targetId, formData.sourceId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);

    if (!formData.routeId) {
      setSubmitError('Сначала выбери route alias.');
      return;
    }
    if (!formData.targetId) {
      setSubmitError('Target deployment не определён. Выбери его вручную.');
      return;
    }
    if (!sloSelection.latency && !sloSelection.errors) {
      setSubmitError('Выбери хотя бы одну SLO-метрику для auto-rollback.');
      return;
    }

    const releaseName =
      formData.name.trim() || buildAutoReleaseName(formData.routeId, formData.targetId, deployments);

    const payload: Record<string, unknown> = {
      name: releaseName,
      routeId: formData.routeId,
      sourceId: formData.sourceId,
      targetId: formData.targetId,
      strategy: formData.strategy,
    };

    if (sloSelection.latency) {
      payload.sloLatency = formData.sloLatency;
    }
    if (sloSelection.errors) {
      payload.sloErrors = formData.sloErrors;
    }

    setLoading(true);
    try {
      await startRelease(payload);
      onCreated();
      onClose();
    } catch (err) {
      console.error(err);
      setSubmitError('Не удалось запустить релиз. Проверь параметры и попробуй ещё раз.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-md z-[100] flex items-center justify-center p-4">
       <motion.div 
         initial={{ scale: 0.95, opacity: 0 }}
         animate={{ scale: 1, opacity: 1 }}
         className="bg-white dark:bg-slate-950 border border-gray-200 dark:border-slate-800 rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl"
       >
          <div className="p-6 border-b border-gray-100 dark:border-slate-900 bg-gray-50/50 dark:bg-slate-900/30 flex items-center justify-between">
             <div>
                <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-3">
                   <Rocket className="w-6 h-6 text-indigo-600" />
                   Initiate Rollout
                </h2>
                <p className="text-xs text-gray-500 font-medium uppercase tracking-wider mt-1">Automatic progressive deployment pipeline</p>
             </div>
             <button onClick={onClose} className="p-2 hover:bg-gray-200 dark:hover:bg-slate-800 rounded-lg transition-colors">
                <X className="w-5 h-5 text-gray-400" />
             </button>
          </div>
          
          <form onSubmit={handleSubmit} className="p-8 space-y-6 max-h-[70vh] overflow-y-auto custom-scrollbar">
             <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                   <label className="text-xs font-semibold uppercase tracking-wider text-gray-500">Release Name</label>
                   <input 
                     value={formData.name}
                     onChange={e => setFormData({...formData, name: e.target.value})}
                     className="w-full bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-lg px-4 py-2 text-sm font-medium text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
                     placeholder="Авто (если оставить пустым)"
                   />
                </div>
                <div className="space-y-2">
                   <label className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                     Strategy
                     <FieldTooltip content="Controls how traffic is shifted. 'Step-by-step' safely ramps traffic. 'Instant' immediately routes 100%." />
                   </label>
                   <select 
                     value={formData.strategy}
                     onChange={e => setFormData({...formData, strategy: e.target.value as any})}
                     className="w-full bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-lg px-4 py-2 text-sm font-medium text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
                   >
                      <option value="step">Step-by-step (Pause after each step)</option>
                      <option value="instant">Instant (Immediate 100% switch)</option>
                   </select>
                </div>
             </div>

             <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-wider text-gray-500">Traffic Route Alias</label>
                <select
                  required
                  value={formData.routeId}
                  onChange={e => setFormData({...formData, routeId: e.target.value})}
                  disabled={loadingOptions || routes.length === 0}
                  className="w-full bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-lg px-4 py-2 text-sm font-medium text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  {loadingOptions && <option value="">Идёт загрузка...</option>}
                  {!loadingOptions && routes.length === 0 && <option value="">Нет доступных route alias</option>}
                  {!loadingOptions && routes.length > 0 && <option value="">Select route alias...</option>}
                  {routes.map(route => (
                    <option key={route.id} value={route.id}>
                      {route.name} ({route.backends?.length || 0} backends)
                    </option>
                  ))}
                </select>
             </div>

             {/* Source & Target */}
             <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-slate-50 dark:bg-slate-900/40 p-4 rounded-xl border border-gray-150 dark:border-slate-800/80">
                <div className="space-y-2">
                   <label className="text-xs font-bold uppercase tracking-wider text-gray-500 block">Source Deployment (Откуда идём)</label>
                   <select 
                     value={formData.sourceId}
                     disabled
                     className="w-full bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-lg px-3 py-2 text-xs font-semibold text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
                   >
                      {loadingOptions && <option value="">Идёт загрузка...</option>}
                      {!loadingOptions && !formData.sourceId && <option value="">Определяется автоматически...</option>}
                      {deployments.map(d => (
                         <option key={d.id} value={d.id}>{d.modelName} [{d.id.slice(-5)}] (Replicas: {d.replicas}, Cluster: {d.clusterId})</option>
                      ))}
                   </select>
                </div>

                <div className="space-y-2">
                   <label className="text-xs font-bold uppercase tracking-wider text-gray-500 block">Target Deployment (Куда идём)</label>
                   <select 
                     required
                     value={formData.targetId}
                     onChange={e => {
                       setFormData({
                         ...formData, 
                          targetId: e.target.value,
                         name: formData.name || buildAutoReleaseName(formData.routeId, e.target.value, deployments)
                       });
                     }}
                     disabled={loadingOptions || deployments.length === 0}
                     className="w-full bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-lg px-3 py-2 text-xs font-semibold text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
                   >
                      {loadingOptions && <option value="">Идёт загрузка...</option>}
                      {!loadingOptions && deployments.length === 0 && <option value="">Нет доступных deployment</option>}
                      {!loadingOptions && deployments.length > 0 && <option value="">Select target...</option>}
                      {deployments
                        .filter((d) => d.id !== formData.sourceId)
                        .map(d => (
                         <option key={d.id} value={d.id}>{d.modelName} [{d.id.slice(-5)}] ({d.clusterId})</option>
                      ))}
                   </select>
                </div>
             </div>

             <div className="pt-6 border-t border-gray-100 dark:border-slate-900">
                <div className="flex items-center justify-between mb-4">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-400">SLO Thresholds (Auto-Rollback)</h4>
                  {!sloSelection.latency && !sloSelection.errors && (
                    <span className="text-[10px] font-semibold text-red-500 uppercase tracking-wide">Select at least one metric</span>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-5">
                  <label className="flex items-start gap-3 p-3 rounded-lg border border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-900 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={sloSelection.latency}
                      onChange={(e) => setSloSelection((prev) => ({ ...prev, latency: e.target.checked }))}
                      className="mt-0.5 rounded text-indigo-600 focus:ring-indigo-500 h-4 w-4 border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                    />
                    <div>
                      <div className="text-xs font-bold text-gray-900 dark:text-white uppercase tracking-wide">Latency (p95)</div>
                      <div className="text-[11px] text-gray-500 dark:text-slate-400">Rollback if response latency grows above threshold.</div>
                    </div>
                  </label>
                  <label className="flex items-start gap-3 p-3 rounded-lg border border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-900 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={sloSelection.errors}
                      onChange={(e) => setSloSelection((prev) => ({ ...prev, errors: e.target.checked }))}
                      className="mt-0.5 rounded text-indigo-600 focus:ring-indigo-500 h-4 w-4 border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                    />
                    <div>
                      <div className="text-xs font-bold text-gray-900 dark:text-white uppercase tracking-wide">Error Rate</div>
                      <div className="text-[11px] text-gray-500 dark:text-slate-400">Rollback if HTTP/model errors exceed threshold.</div>
                    </div>
                  </label>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {sloSelection.latency && (
                    <div className="space-y-2">
                      <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Max Latency (ms)</label>
                      <div className="relative">
                        <input 
                          type="number"
                          min={50}
                          step={10}
                          value={formData.sloLatency}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              sloLatency: Number(e.target.value),
                            })
                          }
                          className="w-full bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-lg pl-3 pr-8 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-red-500"
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-semibold text-gray-400">ms</span>
                      </div>
                    </div>
                  )}
                  {sloSelection.errors && (
                    <div className="space-y-2">
                      <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Max Error Rate (%)</label>
                      <div className="relative">
                        <input 
                          type="number"
                          min={0.1}
                          step={0.1}
                          value={formData.sloErrors}
                          onChange={e => setFormData({...formData, sloErrors: Number(e.target.value)})}
                          className="w-full bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-lg pl-10 pr-4 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-red-500"
                        />
                        <AlertTriangle className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-semibold text-gray-400">%</span>
                      </div>
                    </div>
                  )}
                </div>
             </div>

             {submitError && (
               <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
                 {submitError}
               </div>
             )}

             <button 
               type="submit"
               disabled={loading || loadingOptions || !formData.routeId || !formData.targetId || (!sloSelection.latency && !sloSelection.errors)}
               className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-semibold transition-all shadow-md shadow-indigo-500/10 flex items-center justify-center gap-2 disabled:opacity-50"
             >
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : (
                   <>
                     <Rocket className="w-4 h-4" />
                     Launch Rollout
                   </>
                )}
             </button>
          </form>
       </motion.div>
    </div>
  );
}
