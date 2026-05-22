import React, { useEffect, useMemo, useState } from 'react';
import { Shield, Filter, Hexagon, Globe, Loader2 } from 'lucide-react';
import { useCluster } from '../context/ClusterContext';
import { listAuditEvents, type AuditEventResponse } from '../api/security';

type AuditRow = {
  id: string;
  user: string;
  action: string;
  target: string;
  time: string;
  status: 'success' | 'failure';
  clusterId: string;
};

function toAuditRow(item: AuditEventResponse): AuditRow {
  const details = (item.details || {}) as Record<string, unknown>;
  const resourceType = typeof item.resource_type === 'string' && item.resource_type.trim()
    ? item.resource_type
    : 'resource';
  const resourceId = typeof item.resource_id === 'string' && item.resource_id.trim()
    ? item.resource_id
    : '-';

  const clusterFromDetails =
    (typeof details.cluster_id === 'string' && details.cluster_id.trim()) ||
    (typeof details.clusterId === 'string' && details.clusterId.trim()) ||
    null;

  return {
    id: String(item.id),
    user: item.user_email || item.user_id || (item.is_service_account ? 'Service account' : 'Unknown user'),
    action: item.action,
    target: `${resourceType}:${resourceId}`,
    time: new Date(item.created_at).toLocaleString(),
    status: item.result,
    clusterId: clusterFromDetails || 'global',
  };
}

export function AuditLog() {
  const { selectedClusterId } = useCluster();
  const [showFilters, setShowFilters] = useState(false);
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function load(): Promise<void> {
      setLoading(true);
      setError(null);
      try {
        const items = await listAuditEvents({ limit: 200, offset: 0 });
        if (!active) return;
        setRows(items.map(toAuditRow));
      } catch (err) {
        if (!active) return;
        const message = err instanceof Error ? err.message : 'Не удалось загрузить audit log.';
        setError(message);
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
  }, []);

  const filteredLogs = useMemo(() => {
    if (selectedClusterId === 'all') return rows;
    return rows.filter((row) => row.clusterId === selectedClusterId || row.clusterId === 'global');
  }, [rows, selectedClusterId]);

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Audit Log</h1>
          <p className="text-sm text-gray-500 dark:text-slate-400 mt-1">Chronological record of system and user actions.</p>
        </div>
        <button
          onClick={() => setShowFilters(!showFilters)}
          className="px-4 py-2 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors flex items-center gap-2"
        >
          <Filter className="w-4 h-4" />
          Filter Logs
        </button>
      </div>

      {showFilters && (
        <div className="p-4 bg-white dark:bg-slate-950 border border-gray-200 dark:border-slate-800 rounded-xl shadow-sm text-sm text-gray-500 dark:text-slate-400">
          Дополнительные фильтры будут применены после подключения server-side query по user/action/date.
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 text-red-700 px-4 py-3 text-sm">
          {error}
        </div>
      )}

      <div className="bg-white dark:bg-slate-950 border border-gray-200 dark:border-slate-800 rounded-xl shadow-sm overflow-hidden">
        {loading ? (
          <div className="px-6 py-12 text-center">
            <Loader2 className="w-6 h-6 animate-spin text-indigo-500 mx-auto" />
            <p className="text-gray-500 dark:text-slate-400 mt-2">Загружаем audit events...</p>
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="px-6 py-12 text-center text-gray-500 dark:text-slate-400">Событий не найдено.</div>
        ) : (
          <div className="divide-y divide-gray-200 dark:divide-slate-800">
            {filteredLogs.map((log) => (
              <div key={log.id} className="p-4 hover:bg-gray-50 dark:hover:bg-slate-900/50 transition-colors flex items-start gap-4">
                <div className="mt-1">
                  <Shield className={`w-5 h-5 ${log.status === 'success' ? 'text-emerald-500' : 'text-red-500'}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                        {log.user} <span className="text-xs text-gray-500 ml-1">{log.action}</span>
                      </p>
                      <div className="flex items-center gap-1.5 px-1.5 py-0.5 rounded bg-gray-100 dark:bg-slate-900 border border-gray-200 dark:border-slate-800">
                        {log.clusterId === 'global' ? (
                          <Globe className="w-2.5 h-2.5 text-indigo-500" />
                        ) : (
                          <Hexagon className="w-2.5 h-2.5 text-emerald-500" />
                        )}
                        <span className="text-[9px] font-bold text-gray-600 dark:text-slate-400 uppercase">{log.clusterId}</span>
                      </div>
                    </div>
                    <span className="text-xs text-gray-400 dark:text-slate-500 font-medium">{log.time}</span>
                  </div>
                  <p className="text-xs text-indigo-600 dark:text-indigo-400 mt-1 font-mono">{log.target}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
