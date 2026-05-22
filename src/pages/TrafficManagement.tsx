import React, { useEffect, useMemo, useState } from 'react';
import {
  Route as RouteIcon,
  Save,
  Plus,
  Trash2,
  Hexagon,
  Play,
  ArrowRight,
  Loader2,
} from 'lucide-react';
import {
  getDeployments,
  Deployment,
  TrafficRoute,
  RouteBackend,
  getTrafficRoutes,
  updateTrafficRoute,
  createTrafficRoute,
  deleteTrafficRoute,
  testTrafficRoute,
} from '../api/platform';
import { useCluster } from '../context/ClusterContext';
import { useLanguage } from '../context/LanguageContext';
import { ConfirmDialog } from '../components/ConfirmDialog';

function normalizeWeights(backends: RouteBackend[]): RouteBackend[] {
  const total = backends.reduce((sum, backend) => sum + Number(backend.weight || 0), 0);
  if (backends.length === 0) return [];
  if (total === 100) return backends;
  if (total <= 0) {
    const equal = Math.floor(100 / backends.length);
    const remainder = 100 - equal * backends.length;
    return backends.map((backend, idx) => ({
      ...backend,
      weight: equal + (idx === 0 ? remainder : 0),
    }));
  }

  const scaled = backends.map((backend) => ({
    ...backend,
    weight: Math.round((backend.weight / total) * 100),
  }));

  const diff = 100 - scaled.reduce((sum, backend) => sum + backend.weight, 0);
  if (scaled.length > 0) {
    scaled[0] = { ...scaled[0], weight: scaled[0].weight + diff };
  }
  return scaled;
}

export function TrafficManagement() {
  const { selectedClusterId } = useCluster();
  const { t } = useLanguage();

  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [routes, setRoutes] = useState<TrafficRoute[]>([]);
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isNewRouteOpen, setIsNewRouteOpen] = useState(false);
  const [newRouteName, setNewRouteName] = useState('');
  const [newRouteBackends, setNewRouteBackends] = useState<Array<{ deploymentId: string }>>([]);
  const [testResult, setTestResult] = useState<any>(null);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingBackendRemoveIndex, setPendingBackendRemoveIndex] = useState<number | null>(null);
  const [pendingRouteDeleteId, setPendingRouteDeleteId] = useState<string | null>(null);
  const [isDeleteRoutePending, setIsDeleteRoutePending] = useState(false);

  const selectedRoute = useMemo(
    () => routes.find((route) => route.id === selectedRouteId) ?? null,
    [routes, selectedRouteId]
  );

  const totalWeight = useMemo(
    () => selectedRoute?.backends.reduce((sum, backend) => sum + backend.weight, 0) ?? 0,
    [selectedRoute]
  );

  const selectedNewRouteBackendIds = useMemo(
    () =>
      newRouteBackends
        .map((backend) => backend.deploymentId)
        .filter((value, index, arr) => Boolean(value) && arr.indexOf(value) === index),
    [newRouteBackends]
  );

  async function loadData() {
    setLoading(true);
    setError(null);
    try {
      const [deps, routeList] = await Promise.all([
        getDeployments(selectedClusterId),
        getTrafficRoutes(selectedClusterId),
      ]);

      setDeployments(deps);
      setRoutes(routeList);

      if (routeList.length === 0) {
        setSelectedRouteId(null);
      } else if (!selectedRouteId || !routeList.some((route) => route.id === selectedRouteId)) {
        setSelectedRouteId(routeList[0].id);
      }

      if (newRouteBackends.length === 0 && deps.length > 0) {
        const first = deps[0]?.id;
        const second = deps[1]?.id;
        setNewRouteBackends(second ? [{ deploymentId: first }, { deploymentId: second }] : [{ deploymentId: first }]);
      }
    } catch (e: any) {
      console.error(e);
      setError(e?.message || 'Failed to load traffic data');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedClusterId]);

  const updateSelectedRoute = (updater: (route: TrafficRoute) => TrafficRoute) => {
    if (!selectedRoute) return;
    setRoutes((prev) => prev.map((route) => (route.id === selectedRoute.id ? updater(route) : route)));
  };

  const handleBackendWeightChange = (index: number, value: number) => {
    if (!selectedRoute) return;
    updateSelectedRoute((route) => {
      const next = route.backends.map((backend, backendIndex) =>
        backendIndex === index ? { ...backend, weight: value } : backend
      );
      return { ...route, backends: next };
    });
  };

  const handleRemoveBackend = (index: number) => {
    if (!selectedRoute) return;
    setPendingBackendRemoveIndex(index);
  };

  const confirmRemoveBackend = () => {
    if (!selectedRoute || pendingBackendRemoveIndex === null) return;
    updateSelectedRoute((route) => {
      const next = route.backends.filter((_, backendIndex) => backendIndex !== pendingBackendRemoveIndex);
      return { ...route, backends: normalizeWeights(next) };
    });
    setPendingBackendRemoveIndex(null);
  };

  const handleAddBackend = () => {
    if (!selectedRoute || deployments.length === 0) return;

    const unused = deployments.find(
      (dep) => !selectedRoute.backends.some((backend) => backend.deploymentId === dep.id)
    );
    if (!unused) return;

    updateSelectedRoute((route) => {
      const next = [...route.backends, { deploymentId: unused.id, clusterId: unused.clusterId, weight: 0 }];
      return { ...route, backends: normalizeWeights(next) };
    });
  };

  const handleSave = async () => {
    if (!selectedRoute || totalWeight !== 100 || selectedRoute.backends.length === 0) return;
    setSaving(true);
    setError(null);

    try {
      const normalized = {
        ...selectedRoute,
        backends: normalizeWeights(selectedRoute.backends),
      };
      const updated = await updateTrafficRoute(normalized);
      setRoutes((prev) => prev.map((route) => (route.id === updated.id ? updated : route)));
    } catch (e: any) {
      console.error(e);
      setError(e?.message || 'Failed to save route');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteRoute = async (routeId: string) => {
    setPendingRouteDeleteId(routeId);
  };

  const confirmDeleteRoute = async () => {
    if (!pendingRouteDeleteId) return;
    setIsDeleteRoutePending(true);
    try {
      await deleteTrafficRoute(pendingRouteDeleteId);
      const next = routes.filter((route) => route.id !== pendingRouteDeleteId);
      setRoutes(next);
      setSelectedRouteId(next.length > 0 ? next[0].id : null);
      setTestResult(null);
      setPendingRouteDeleteId(null);
    } catch (e: any) {
      console.error(e);
      setError(e?.message || 'Failed to delete route');
    } finally {
      setIsDeleteRoutePending(false);
    }
  };

  const handleTest = async () => {
    if (!selectedRoute) return;
    setTesting(true);
    setError(null);
    try {
      const result = await testTrafficRoute(selectedRoute);
      setTestResult(result);
    } catch (e: any) {
      console.error(e);
      setError(e?.message || 'Failed to test route');
    } finally {
      setTesting(false);
    }
  };

  const handleCreateRoute = async () => {
    const name = newRouteName.trim();
    if (!name) return;

    const uniqueIds = newRouteBackends
      .map((backend) => backend.deploymentId)
      .filter((value, index, arr) => Boolean(value) && arr.indexOf(value) === index);

    if (uniqueIds.length < 2) {
      setError('Для нового маршрута выберите минимум 2 разные модели.');
      return;
    }

    const resolvedBackends = uniqueIds
      .map((deploymentId) => deployments.find((item) => item.id === deploymentId))
      .filter((dep): dep is Deployment => Boolean(dep))
      .map((dep) => ({ deploymentId: dep.id, clusterId: dep.clusterId, weight: 0 }));

    if (resolvedBackends.length < 2) {
      setError('Не удалось собрать backend-список для нового маршрута.');
      return;
    }

    try {
      const created = await createTrafficRoute({
        name,
        backends: normalizeWeights(resolvedBackends),
      });
      setRoutes((prev) => [created, ...prev]);
      setSelectedRouteId(created.id);
      setIsNewRouteOpen(false);
      setNewRouteName('');
      setNewRouteBackends([]);
      setTestResult(null);
    } catch (e: any) {
      console.error(e);
      setError(e?.message || 'Failed to create route');
    }
  };

  const openNewRouteModal = () => {
    const first = deployments[0]?.id;
    const second = deployments[1]?.id;
    setNewRouteName('');
    setNewRouteBackends(second ? [{ deploymentId: first }, { deploymentId: second }] : first ? [{ deploymentId: first }] : []);
    setIsNewRouteOpen(true);
  };

  const closeNewRouteModal = () => {
    setIsNewRouteOpen(false);
  };

  const handleAddNewRouteBackend = () => {
    const taken = new Set(newRouteBackends.map((backend) => backend.deploymentId));
    const nextDeployment = deployments.find((dep) => !taken.has(dep.id));
    if (!nextDeployment) return;
    setNewRouteBackends((prev) => [...prev, { deploymentId: nextDeployment.id }]);
  };

  const handleChangeNewRouteBackend = (index: number, deploymentId: string) => {
    setNewRouteBackends((prev) =>
      prev.map((backend, backendIndex) => (backendIndex === index ? { ...backend, deploymentId } : backend))
    );
  };

  const handleRemoveNewRouteBackend = (index: number) => {
    setNewRouteBackends((prev) => prev.filter((_, backendIndex) => backendIndex !== index));
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-20">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('traffic')}</h1>
          <p className="text-sm text-gray-500 dark:text-slate-400 mt-1">
            {t('trafficDesc') || 'Configure global ingress routing and cross-cluster traffic splits.'}
          </p>
        </div>
        <button
          onClick={openNewRouteModal}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-semibold transition-colors shadow-sm"
        >
          <Plus className="w-4 h-4" />
          {t('newRoute') || 'New Route'}
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 text-red-700 px-4 py-3 text-sm">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center h-64 border-2 border-dashed border-gray-200 dark:border-slate-800 rounded-xl">
          <Loader2 className="w-6 h-6 animate-spin text-indigo-500" />
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          <div className="lg:col-span-1 space-y-4">
            <div className="bg-white dark:bg-slate-950 border border-gray-200 dark:border-slate-800 rounded-xl shadow-sm overflow-hidden">
              <div className="p-4 border-b border-gray-200 dark:border-slate-800 bg-gray-50/50 dark:bg-slate-900/50">
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  {t('activeRoutes') || 'Active Routes'}
                </h3>
              </div>
              <div className="p-2 space-y-1">
                {routes.map((route) => (
                  <button
                    key={route.id}
                    onClick={() => setSelectedRouteId(route.id)}
                    className={`w-full flex items-center justify-between p-3 rounded-lg transition-colors ${
                      selectedRouteId === route.id
                        ? 'bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400'
                        : 'hover:bg-gray-50 dark:hover:bg-slate-900 text-gray-600 dark:text-slate-400'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <RouteIcon className="w-4 h-4 shrink-0" />
                      <span className="text-sm font-bold truncate">{route.name}</span>
                    </div>
                    <ArrowRight className="w-3.5 h-3.5 opacity-50" />
                  </button>
                ))}
                {routes.length === 0 && (
                  <div className="px-3 py-4 text-xs text-gray-500">No routes yet</div>
                )}
              </div>
            </div>
          </div>

          <div className="lg:col-span-3 space-y-6">
            {selectedRoute ? (
              <div className="bg-white dark:bg-slate-950 border border-gray-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden">
                <div className="p-6 border-b border-gray-200 dark:border-slate-800 flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <h2 className="text-lg font-semibold text-gray-900 dark:text-white truncate">{selectedRoute.name}</h2>
                    <p className="text-xs text-gray-500 mt-0.5">Status: {selectedRoute.status || 'active'}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={handleTest}
                      disabled={testing}
                      className="flex items-center gap-2 px-3 py-1.5 border border-gray-200 dark:border-slate-800 hover:bg-gray-50 dark:hover:bg-slate-900 text-gray-700 dark:text-slate-300 rounded-lg text-xs font-semibold transition-colors"
                    >
                      {testing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                      {t('testRequest') || 'Test Request'}
                    </button>
                    <button
                      onClick={handleSave}
                      disabled={saving || totalWeight !== 100 || selectedRoute.backends.length === 0}
                      className="flex items-center gap-2 px-3 py-1.5 bg-indigo-600 disabled:bg-indigo-400 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold transition-colors shadow-sm"
                    >
                      <Save className="w-3.5 h-3.5" />
                      {saving ? 'Saving...' : t('saveChanges') || 'Save Changes'}
                    </button>
                    <button
                      onClick={() => handleDeleteRoute(selectedRoute.id)}
                      className="flex items-center gap-2 px-3 py-1.5 border border-red-200 text-red-600 hover:bg-red-50 rounded-lg text-xs font-semibold transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Delete
                    </button>
                  </div>
                </div>

                <div className="p-6 space-y-8">
                  <div className="flex items-center gap-4 h-12">
                    {selectedRoute.backends.map((backend, idx) => (
                      <div
                        key={`${backend.deploymentId}-${idx}`}
                        className="h-full rounded-lg relative group overflow-hidden transition-all"
                        style={{ width: `${backend.weight}%` }}
                      >
                        <div className={`absolute inset-0 opacity-20 ${idx % 2 === 0 ? 'bg-indigo-500' : 'bg-emerald-500'}`} />
                        <div className={`absolute inset-0 border-b-2 ${idx % 2 === 0 ? 'border-indigo-500' : 'border-emerald-500'}`} />
                        <div className="absolute inset-0 flex items-center justify-center">
                          <span className="text-[10px] font-bold text-gray-900 dark:text-white">{backend.weight}%</span>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="text-xs font-semibold">
                    Total: <span className={totalWeight === 100 ? 'text-emerald-600' : 'text-red-600'}>{totalWeight}%</span>
                  </div>

                  <div className="space-y-4">
                    <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">
                      {t('backendsWeights') || 'Backends & Weights'}
                    </h3>
                    <div className="space-y-3">
                      {selectedRoute.backends.map((backend, idx) => (
                        <div
                          key={`${backend.deploymentId}-${idx}`}
                          className="flex items-center gap-4 p-4 bg-gray-50/50 dark:bg-slate-900/50 border border-gray-200 dark:border-slate-800 rounded-xl"
                        >
                          <div className="w-10 h-10 rounded-lg bg-white dark:bg-slate-800 border border-gray-100 dark:border-slate-700 flex items-center justify-center shadow-sm">
                            <Hexagon className={`w-5 h-5 ${idx % 2 === 0 ? 'text-indigo-500' : 'text-emerald-500'}`} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                                {deployments.find((d) => d.id === backend.deploymentId)?.modelName || backend.deploymentId}
                              </span>
                              <span className="px-1.5 py-0.5 rounded text-[8px] font-semibold uppercase bg-indigo-100 text-indigo-600">
                                {backend.clusterId}
                              </span>
                            </div>
                            <div className="text-[10px] text-gray-500 font-medium">
                              {t('deployment') || 'Deployment'}: {backend.deploymentId}
                            </div>
                          </div>
                          <div className="w-32 flex items-center gap-3">
                            <input
                              type="range"
                              className="w-full h-1 bg-gray-200 dark:bg-slate-800 rounded-full appearance-none accent-indigo-500"
                              min={0}
                              max={100}
                              value={backend.weight}
                              onChange={(event) =>
                                handleBackendWeightChange(idx, Math.max(0, Math.min(100, Number(event.target.value))))
                              }
                            />
                            <span className="text-xs font-semibold text-gray-900 dark:text-white min-w-[30px]">
                              {backend.weight}%
                            </span>
                          </div>
                          <button onClick={() => handleRemoveBackend(idx)} className="p-2 text-gray-400 hover:text-red-500 transition-colors">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      ))}

                      <button
                        onClick={handleAddBackend}
                        className="w-full py-3 border-2 border-dashed border-gray-200 dark:border-slate-800 rounded-xl text-xs font-bold text-gray-500 hover:border-indigo-500 hover:text-indigo-500 transition-all flex items-center justify-center gap-2"
                      >
                        <Plus className="w-4 h-4" />
                        {t('addCrossClusterBackend') || 'Add Cross-cluster Backend'}
                      </button>
                    </div>
                  </div>

                  {testResult && (
                    <div className="p-4 bg-slate-900 rounded-xl border border-slate-800 animate-in zoom-in-95 duration-200">
                      <div className="flex items-center justify-between mb-3 pb-2 border-b border-slate-800">
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                          {t('testRequestTrace') || 'Test Request Trace'}
                        </span>
                        <span className="text-[10px] text-slate-600 font-mono">ID: {testResult.id}</span>
                      </div>
                      <div className="flex items-center gap-8">
                        <div>
                          <div className="text-[10px] text-slate-500 uppercase font-bold tracking-tighter mb-1">
                            {t('servedBy') || 'Served By'}
                          </div>
                          <div className="text-sm font-bold text-white">{testResult.deployment}</div>
                        </div>
                        <div>
                          <div className="text-[10px] text-slate-500 uppercase font-bold tracking-tighter mb-1">
                            {t('cluster')}
                          </div>
                          <div className="text-sm font-bold text-indigo-400">{testResult.cluster}</div>
                        </div>
                        <div>
                          <div className="text-[10px] text-slate-500 uppercase font-bold tracking-tighter mb-1">
                            {t('latency')}
                          </div>
                          <div className="text-sm font-bold text-emerald-400">{testResult.latency.toFixed(0)}ms</div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center h-64 border-2 border-dashed border-gray-200 dark:border-slate-800 rounded-xl">
                <span className="text-gray-500 font-medium">{t('selectRouteConfig') || 'Select a route to configure traffic'}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {isNewRouteOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-slate-950 rounded-xl border border-gray-200 dark:border-slate-800 shadow-xl w-full max-w-md overflow-hidden flex flex-col">
            <div className="p-6 border-b border-gray-200 dark:border-slate-800 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{t('createNewRoute') || 'Create New Route'}</h3>
              <button
                onClick={closeNewRouteModal}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 p-2 rounded-lg bg-gray-100 dark:bg-slate-800 transition-colors"
              >
                <Plus className="w-5 h-5 rotate-45" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="text-sm font-medium text-gray-700 dark:text-slate-300 block mb-1">{t('routeName') || 'Route Name'}</label>
                <input
                  type="text"
                  value={newRouteName}
                  onChange={(event) => setNewRouteName(event.target.value)}
                  placeholder="e.g., smollm2"
                  className="w-full rounded-lg border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:text-white"
                />
              </div>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-gray-700 dark:text-slate-300 block">Backend Deployments (2+)</label>
                  <span className="text-xs text-gray-500">
                    Выбрано: {selectedNewRouteBackendIds.length}
                  </span>
                </div>

                <div className="space-y-2">
                  {newRouteBackends.map((backend, idx) => {
                    const selectedInOtherRows = new Set(
                      newRouteBackends
                        .filter((_, rowIndex) => rowIndex !== idx)
                        .map((row) => row.deploymentId)
                    );

                    return (
                      <div key={`new-route-backend-${idx}`} className="flex items-center gap-2">
                        <select
                          value={backend.deploymentId}
                          onChange={(event) => handleChangeNewRouteBackend(idx, event.target.value)}
                          className="flex-1 rounded-lg border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:text-white"
                        >
                          {deployments.map((dep) => (
                            <option
                              key={dep.id}
                              value={dep.id}
                              disabled={selectedInOtherRows.has(dep.id)}
                            >
                              {dep.modelName} ({dep.clusterId})
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={() => handleRemoveNewRouteBackend(idx)}
                          disabled={newRouteBackends.length <= 1}
                          className="p-2 rounded-lg border border-gray-300 dark:border-slate-700 text-gray-500 hover:text-red-600 hover:border-red-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                          title="Удалить модель из нового маршрута"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    );
                  })}
                </div>

                <button
                  type="button"
                  onClick={handleAddNewRouteBackend}
                  disabled={newRouteBackends.length >= deployments.length}
                  className="w-full py-2 border border-dashed border-gray-300 dark:border-slate-700 rounded-lg text-xs font-semibold text-gray-600 dark:text-slate-300 hover:border-indigo-500 hover:text-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
                >
                  <Plus className="w-4 h-4" />
                  Добавить модель
                </button>
              </div>
              <p className="text-xs text-gray-500">
                Для создания маршрута нужно выбрать минимум 2 разные модели.
              </p>
            </div>
            <div className="p-6 border-t border-gray-200 dark:border-slate-800 bg-gray-50/50 dark:bg-slate-900/50 flex justify-end gap-3">
              <button
                onClick={closeNewRouteModal}
                className="px-4 py-2 border border-gray-300 dark:border-slate-700 rounded-lg text-sm font-medium transition-colors hover:bg-gray-50 dark:text-white"
              >
                {t('cancel')}
              </button>
              <button
                onClick={handleCreateRoute}
                disabled={newRouteName.trim().length === 0 || selectedNewRouteBackendIds.length < 2}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium transition-colors shadow-sm"
              >
                {t('createNewRoute') || 'Create Route'}
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={pendingBackendRemoveIndex !== null}
        title="Удалить backend из маршрута?"
        description="После удаления backend не забудьте сохранить изменения маршрута."
        confirmLabel="Удалить backend"
        cancelLabel="Отмена"
        variant="warning"
        onCancel={() => setPendingBackendRemoveIndex(null)}
        onConfirm={confirmRemoveBackend}
      />

      <ConfirmDialog
        open={Boolean(pendingRouteDeleteId)}
        title="Удалить маршрут?"
        description={
          pendingRouteDeleteId
            ? `Маршрут ${pendingRouteDeleteId} будет удален без возможности восстановления.`
            : undefined
        }
        confirmLabel="Удалить маршрут"
        cancelLabel="Отмена"
        variant="danger"
        isLoading={isDeleteRoutePending}
        onCancel={() => setPendingRouteDeleteId(null)}
        onConfirm={confirmDeleteRoute}
      />
    </div>
  );
}
