import React, { useEffect, useState } from 'react';
import {
  Activity,
  Clock,
  DollarSign,
  Zap,
  Loader2,
} from 'lucide-react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { useCluster } from '../context/ClusterContext';
import { useLanguage } from '../context/LanguageContext';
import {
  getDashboardSummary,
  getInfrastructureConsumptionSeries,
  type DashboardSummary,
} from '../api/prometheus';

type InfraPoint = {
  time: string;
  cpu: number;
  mem: number;
};

const MetricsChartTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-[#111217] border border-[#2c323d] rounded-lg p-3.5 shadow-xl space-y-2 text-xs font-mono select-none pointer-events-none min-w-[180px]">
        <div className="text-[#9fa7b3] border-b border-[#2c323d] pb-1.5 mb-1.5 font-bold flex items-center justify-between">
          <span>{label}</span>
          <span className="text-[9px] bg-[#2c323d] px-1.5 py-0.5 rounded text-white tracking-widest uppercase">metrics</span>
        </div>
        <div className="space-y-1.5">
          {payload.map((item: any, idx: number) => (
            <div key={idx} className="flex items-center justify-between gap-5">
              <div className="flex items-center gap-2 text-slate-200">
                <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: item.color || item.stroke }} />
                <span className="text-[11px] font-medium text-slate-300">{item.name}</span>
              </div>
              <span className="font-bold text-white tabular-nums">
                {typeof item.value === 'number' ? `${item.value.toFixed(1)}%` : item.value}
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  }
  return null;
};

export function Dashboard() {
  const { selectedClusterId } = useCluster();
  const { t } = useLanguage();
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [infraSeries, setInfraSeries] = useState<InfraPoint[]>([]);
  const [lastDataAtIso, setLastDataAtIso] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function load(): Promise<void> {
      setLoading(true);
      setError(null);
      try {
        const [dashboardSummary, infra] = await Promise.all([
          getDashboardSummary({ clusterId: selectedClusterId }),
          getInfrastructureConsumptionSeries({ clusterId: selectedClusterId }),
        ]);
        if (!active) return;

        setSummary(dashboardSummary);
        const points: InfraPoint[] = infra.map((point) => ({
          time: new Date(point.timestampMs).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          cpu: Number(point.cpuPercent ?? 0),
          mem: Number(point.ramPercent ?? 0),
        }));
        setInfraSeries(points);

        const summaryTs = Date.parse(String(dashboardSummary.generatedAt || ''));
        const infraLatestTs = infra.reduce((maxTs, point) => {
          if (typeof point.timestampMs === 'number' && Number.isFinite(point.timestampMs)) {
            return Math.max(maxTs, point.timestampMs);
          }
          return maxTs;
        }, 0);
        const latestTs = Math.max(Number.isFinite(summaryTs) ? summaryTs : 0, infraLatestTs);
        setLastDataAtIso(latestTs > 0 ? new Date(latestTs).toISOString() : null);
      } catch (err) {
        if (!active) return;
        const message = err instanceof Error ? err.message : 'Не удалось загрузить дашборд.';
        setError(message);
        setLastDataAtIso(null);
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void load();
    return () => {
      active = false;
    };
  }, [selectedClusterId]);

  const latencyValue = summary?.latencyMs ?? null;
  const throughputValue = summary?.throughputRps ?? null;
  const uptimeValue = summary?.uptimePercent24h ?? null;
  const costValue = summary?.cost24hRub ?? 0;

  const lastDataAtText = lastDataAtIso
    ? new Date(lastDataAtIso).toLocaleString('ru-RU', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '-';
  const lastDataSubtext = `Последняя запись: ${lastDataAtText}`;

  const uptimeSubtext =
    summary?.uptimeStatus === 'stable'
      ? 'Stable'
      : summary?.uptimeStatus === 'degraded'
        ? 'Degraded'
        : '-';

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('metricsDashboard')}</h1>
          <p className="text-sm text-gray-500 dark:text-slate-400 mt-1">{t('metricsSub')}</p>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 text-red-700 px-4 py-3 text-sm">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Задержка"
          value={latencyValue === null ? 'N/A' : `${Math.round(latencyValue)}ms`}
          subtitle={lastDataSubtext}
          icon={Clock}
          color="emerald"
        />
        <StatCard
          title="Пропускная способность"
          value={
            throughputValue === null
              ? 'N/A'
              : `${Math.round(throughputValue).toLocaleString('ru-RU')} req/s`
          }
          subtitle={lastDataSubtext}
          icon={Zap}
          color="blue"
        />
        <StatCard
          title="Uptime"
          value={uptimeValue === null ? 'N/A' : `${uptimeValue.toFixed(2)}%`}
          subtitle={uptimeSubtext === '-' ? lastDataSubtext : `${uptimeSubtext} • ${lastDataSubtext}`}
          icon={Activity}
          color="indigo"
        />
        <StatCard
          title="Затраты (24ч)"
          value={`${Number(costValue || 0).toLocaleString('ru-RU')} ₽`}
          subtitle={lastDataSubtext}
          icon={DollarSign}
          color="amber"
        />
      </div>

      <div className="bg-[#111217] border border-[#2c323d] rounded-xl p-6 shadow-lg flex flex-col h-[520px]">
        <div className="flex items-center justify-between mb-6 border-b border-[#2c323d] pb-4">
          <div className="flex items-center gap-3">
            <div className="w-2.5 h-2.5 bg-[#f97316] rounded-full" />
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-200">{t('metricsOverview')}</h2>
          </div>
          <span className="text-[10px] text-slate-500 font-mono uppercase tracking-wider">Real data from Prometheus</span>
        </div>

        <div className="flex-1 rounded-lg bg-[#181b1f] border border-[#2c323d] p-5 relative overflow-hidden flex flex-col justify-between">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-[#dae1e7] text-[11px] font-mono uppercase tracking-wider">Metric: infrastructure utilization</h3>
            <div className="flex items-center gap-4 text-[10px] font-mono text-[#9fa7b3]">
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm bg-[#5794f2]" /> CPU avg</span>
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm bg-[#73bf69]" /> RAM avg</span>
            </div>
          </div>

          <div className="h-[350px] w-full">
            {infraSeries.length === 0 ? (
              <div className="h-full flex items-center justify-center text-sm text-slate-400">Нет данных Prometheus за выбранный интервал.</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={infraSeries} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid stroke="#2c323d" strokeDasharray="1 5" vertical />
                  <XAxis dataKey="time" stroke="#9fa7b3" fontSize={10} fontFamily="monospace" tickLine axisLine dy={5} />
                  <YAxis stroke="#9fa7b3" fontSize={10} fontFamily="monospace" tickLine axisLine tickFormatter={(v) => `${v}%`} />
                  <Tooltip content={<MetricsChartTooltip />} cursor={{ stroke: '#5794f2', strokeWidth: 1.5, strokeDasharray: '2 2' }} />
                  <Line
                    type="monotone"
                    dataKey="cpu"
                    name="CPU Utilization"
                    stroke="#5794f2"
                    strokeWidth={2}
                    dot={{ r: 2, strokeWidth: 1, fill: '#181b1f' }}
                    activeDot={{ r: 4, strokeWidth: 0 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="mem"
                    name="Memory Resident"
                    stroke="#73bf69"
                    strokeWidth={2}
                    dot={{ r: 2, strokeWidth: 1, fill: '#181b1f' }}
                    activeDot={{ r: 4, strokeWidth: 0 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ title, value, subtitle, icon: Icon, color }: any) {
  const colorClasses = {
    blue: 'bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400',
    indigo: 'bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400',
    emerald: 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
    amber: 'bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400',
  };

  return (
    <div className="bg-white dark:bg-slate-950 border border-gray-200 dark:border-slate-800 rounded-xl p-6 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium text-gray-500 dark:text-slate-400">{title}</h3>
        <div className={`p-2 rounded-xl ${colorClasses[color as keyof typeof colorClasses]}`}>
          <Icon className="w-5 h-5" />
        </div>
      </div>
      <div className="flex items-baseline gap-2">
        <span className="text-2xl font-bold text-gray-900 dark:text-white tabular-nums">{value}</span>
      </div>
      <p className="mt-2 text-xs text-gray-500 dark:text-slate-400">{subtitle || '-'}</p>
    </div>
  );
}
