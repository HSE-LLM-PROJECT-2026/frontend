import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { REAL_CLUSTER_ID } from '../api/platform';
import { getClusters, type ClusterSummary } from '../api/infrastructure';
import { buildRealtimeSocketUrl, parseRealtimeSocketMessage } from '../api/realtime';
import { isDemoModeEnabled } from '../api/demoMode';

const DEMO_MODE = isDemoModeEnabled();

export interface Cluster {
  id: string;
  name: string;
  region: string;
  provider: 'on-premise' | 'cloud';
  status: 'online' | 'degraded' | 'unreachable';
  type: 'gpu' | 'cpu' | 'hybrid';
  lastHeartbeat: string;
  nodeCount: number;
  gpuUsage: number;
  ramUsage: number;
  cpuUsage: number;
}

interface ClusterContextType {
  selectedClusterId: string;
  setSelectedClusterId: (id: string) => void;
  clusters: Cluster[];
}

const ClusterContext = createContext<ClusterContextType | undefined>(undefined);

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  return value as Record<string, unknown>;
}

function toFiniteNumber(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  return fallback;
}

function toNullableFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  return null;
}

function toFixedNumber(value: number, digits = 1): number {
  return Number(value.toFixed(digits));
}

function toPercent(part: number, total: number): number {
  if (total <= 0) return 0;
  const raw = (part / total) * 100;
  return Math.max(0, Math.min(100, toFixedNumber(raw, 1)));
}

function millicoresToCores(millicores: unknown): number {
  return toFixedNumber(toFiniteNumber(millicores) / 1000, 1);
}

function bytesToGi(bytes: unknown): number {
  return toFixedNumber(toFiniteNumber(bytes) / 1024 ** 3, 1);
}

function normalizeClusterSummary(raw: unknown): ClusterSummary | null {
  const item = asRecord(raw);
  if (!item) {
    return null;
  }

  const directId = String(item.id || '').trim();
  if (directId) {
    return {
      id: directId,
      totalNodes: toFiniteNumber(item.totalNodes),
      readyNodes: toFiniteNumber(item.readyNodes),
      totalCpuCores: toFiniteNumber(item.totalCpuCores),
      usedCpuCores: toFiniteNumber(item.usedCpuCores),
      actualCpuCores: toNullableFiniteNumber(item.actualCpuCores),
      actualCpuPercent: toNullableFiniteNumber(item.actualCpuPercent),
      totalRamGi: toFiniteNumber(item.totalRamGi),
      usedRamGi: toFiniteNumber(item.usedRamGi),
      actualRamGi: toNullableFiniteNumber(item.actualRamGi),
      actualRamPercent: toNullableFiniteNumber(item.actualRamPercent),
      totalGpus: toFiniteNumber(item.totalGpus),
      usedGpus: toFiniteNumber(item.usedGpus),
      activeDeployments: toFiniteNumber(item.activeDeployments),
    };
  }

  const backendId = String(item.cluster_id || '').trim();
  const resources = asRecord(item.resources);
  if (!backendId || !resources) {
    return null;
  }

  const cpuAllocatableMillicores = toFiniteNumber(resources.cpu_allocatable_millicores);
  const cpuRequestedMillicores = toFiniteNumber(resources.cpu_requested_millicores);
  const cpuActualMillicores = toNullableFiniteNumber(resources.cpu_actual_usage_millicores);
  const memoryAllocatableBytes = toFiniteNumber(resources.memory_allocatable_bytes);
  const memoryRequestedBytes = toFiniteNumber(resources.memory_requested_bytes);
  const memoryActualBytes = toNullableFiniteNumber(resources.memory_actual_usage_bytes);

  return {
    id: backendId,
    totalNodes: toFiniteNumber(item.nodes_total),
    readyNodes: toFiniteNumber(item.nodes_ready),
    totalCpuCores: millicoresToCores(cpuAllocatableMillicores),
    usedCpuCores: millicoresToCores(cpuRequestedMillicores),
    actualCpuCores:
      cpuActualMillicores === null ? null : millicoresToCores(cpuActualMillicores),
    actualCpuPercent:
      cpuActualMillicores === null
        ? null
        : toPercent(cpuActualMillicores, cpuAllocatableMillicores),
    totalRamGi: bytesToGi(memoryAllocatableBytes),
    usedRamGi: bytesToGi(memoryRequestedBytes),
    actualRamGi: memoryActualBytes === null ? null : bytesToGi(memoryActualBytes),
    actualRamPercent:
      memoryActualBytes === null
        ? null
        : toPercent(memoryActualBytes, memoryAllocatableBytes),
    totalGpus: toFiniteNumber(resources.gpu_allocatable),
    usedGpus: toFiniteNumber(resources.gpu_requested),
    activeDeployments: toFiniteNumber(item.active_deployments),
  };
}

function mapCluster(summary: ClusterSummary): Cluster {
  const cpuUsage =
    summary.actualCpuPercent !== null
      ? Number(summary.actualCpuPercent)
      : summary.totalCpuCores > 0
        ? (summary.usedCpuCores / summary.totalCpuCores) * 100
        : 0;

  const ramUsage =
    summary.actualRamPercent !== null
      ? Number(summary.actualRamPercent)
      : summary.totalRamGi > 0
        ? (summary.usedRamGi / summary.totalRamGi) * 100
        : 0;

  const gpuUsage =
    summary.totalGpus > 0 ? (summary.usedGpus / summary.totalGpus) * 100 : 0;

  const displayName =
    summary.id === REAL_CLUSTER_ID || summary.id === 'default'
      ? 'msk-1'
      : summary.id;

  return {
    id: summary.id,
    name: displayName,
    region: 'Moscow',
    provider: 'on-premise',
    status: summary.readyNodes > 0 ? 'online' : 'degraded',
    type: summary.totalGpus > 0 ? 'hybrid' : 'cpu',
    lastHeartbeat: new Date().toISOString(),
    nodeCount: Number(summary.totalNodes ?? 0),
    gpuUsage: Number(gpuUsage.toFixed(1)),
    ramUsage: Number(ramUsage.toFixed(1)),
    cpuUsage: Number(cpuUsage.toFixed(1)),
  };
}

export function ClusterProvider({ children }: { children: ReactNode }) {
  const [clusters, setClusters] = useState<Cluster[]>([]);
  const [selectedClusterId, setSelectedClusterId] = useState<string>(REAL_CLUSTER_ID);

  useEffect(() => {
    let active = true;
    let socket: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    const clearReconnectTimer = () => {
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
    };

    const applyClusterSummaries = (summaries: ClusterSummary[]) => {
      if (summaries.length === 0) {
        return;
      }
      const mapped = summaries.map(mapCluster);
      setClusters(mapped);
      setSelectedClusterId((current) => {
        if (current === 'all') {
          return current;
        }
        if (mapped.some((cluster) => cluster.id === current)) {
          return current;
        }
        return mapped[0]?.id || REAL_CLUSTER_ID;
      });
    };

    const loadClustersOnce = async () => {
      try {
        const summaries = await getClusters();
        if (!active) return;
        applyClusterSummaries(summaries);
      } catch {
        // Keep current cluster snapshot if backend is temporarily unavailable.
      }
    };

    if (DEMO_MODE) {
      void loadClustersOnce();
      return () => {
        active = false;
        clearReconnectTimer();
      };
    }

    const scheduleReconnect = () => {
      if (!active || reconnectTimer) {
        return;
      }
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        connect();
      }, 1500);
    };

    const connect = () => {
      if (!active) {
        return;
      }
      const wsUrl = buildRealtimeSocketUrl({
        scope: 'clusters',
        intervalSeconds: 5,
      });
      socket = new WebSocket(wsUrl);

      socket.onmessage = (event) => {
        if (!active) return;
        const message = parseRealtimeSocketMessage(event.data);
        if (!message || message.type !== 'state_snapshot') return;
        const rawClusters = Array.isArray(message.payload?.clusters)
          ? message.payload.clusters
          : null;
        if (!rawClusters) return;
        const normalized = rawClusters
          .map((item) => normalizeClusterSummary(item))
          .filter((item): item is ClusterSummary => Boolean(item));
        applyClusterSummaries(normalized);
      };

      socket.onclose = () => {
        if (!active) return;
        scheduleReconnect();
      };
    };

    void loadClustersOnce();
    connect();
    return () => {
      active = false;
      clearReconnectTimer();
      if (socket && socket.readyState <= WebSocket.OPEN) {
        socket.close();
      }
    };
  }, []);

  return (
    <ClusterContext.Provider value={{ selectedClusterId, setSelectedClusterId, clusters }}>
      {children}
    </ClusterContext.Provider>
  );
}

export function useCluster() {
  const context = useContext(ClusterContext);
  if (context === undefined) {
    throw new Error('useCluster must be used within a ClusterProvider');
  }
  return context;
}
