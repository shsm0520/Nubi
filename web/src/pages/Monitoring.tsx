import { useState, useEffect, useCallback } from "react";
import { getHosts, type ProxyHost } from "@/api/hosts";
import { useWebSocket } from "@/hooks/useWebSocket";
import {
  getLogStats,
  getRecentLogs,
  type LogStatsResponse,
  type LogEntry,
} from "@/api/logs";

interface HostStats {
  domain: string;
  enabled: boolean;
  maintenance: boolean;
  hasLoadBalancing: boolean;
  backendCount: number;
}

// Simple world map coordinates for countries
const countryCoords: Record<string, { x: number; y: number }> = {
  US: { x: 20, y: 40 },
  EU: { x: 48, y: 35 },
  AS: { x: 70, y: 45 },
  KR: { x: 82, y: 38 },
  JP: { x: 88, y: 38 },
  CN: { x: 75, y: 40 },
  LOCAL: { x: 50, y: 50 },
  XX: { x: 50, y: 60 },
};

export function Monitoring() {
  const { nginxStatus: status, metrics, connect } = useWebSocket();
  const [hosts, setHosts] = useState<ProxyHost[]>([]);
  const [loading, setLoading] = useState(true);
  const [hostStats, setHostStats] = useState<HostStats[]>([]);
  const [logStats, setLogStats] = useState<LogStatsResponse | null>(null);
  const [recentLogs, setRecentLogs] = useState<LogEntry[]>([]);
  const [activeTab, setActiveTab] = useState<
    "overview" | "geo" | "ips" | "ua" | "logs"
  >("overview");
  const [logFilter, setLogFilter] = useState("");
  const [autoRefresh, setAutoRefresh] = useState(false);

  // Connect WebSocket on mount
  useEffect(() => {
    connect();
  }, [connect]);

  // Fetch hosts
  useEffect(() => {
    fetchHosts();
    const interval = setInterval(fetchHosts, 30000);
    return () => clearInterval(interval);
  }, []);

  // Fetch log stats
  const fetchLogStats = useCallback(async () => {
    try {
      const stats = await getLogStats();
      setLogStats(stats);
      setRecentLogs(stats.recentLogs || []);
    } catch (err) {
      console.error("Failed to fetch log stats:", err);
    }
  }, []);

  useEffect(() => {
    fetchLogStats();
    const interval = setInterval(fetchLogStats, autoRefresh ? 5000 : 60000);
    return () => clearInterval(interval);
  }, [fetchLogStats, autoRefresh]);

  const fetchHosts = async () => {
    try {
      const data = await getHosts();
      setHosts(data.hosts || []);
      setHostStats(
        (data.hosts || []).map((h: ProxyHost) => ({
          domain: h.domain,
          enabled: h.enabled,
          maintenance: h.maintenance,
          hasLoadBalancing: h.backends && h.backends.length > 1,
          backendCount: h.backends?.length || 1,
        }))
      );
      setLoading(false);
    } catch (err) {
      console.error("Failed to fetch hosts:", err);
      setLoading(false);
    }
  };

  const refreshLogs = async () => {
    try {
      const data = await getRecentLogs(100);
      setRecentLogs(data.logs || []);
    } catch (err) {
      console.error("Failed to refresh logs:", err);
    }
  };

  // Calculate stats
  const totalHosts = hosts.length;
  const activeHosts = hosts.filter((h) => h.enabled && !h.maintenance).length;
  const maintenanceHosts = hosts.filter((h) => h.maintenance).length;
  const disabledHosts = hosts.filter((h) => !h.enabled).length;
  const loadBalancedHosts = hosts.filter(
    (h) => h.backends && h.backends.length > 1
  ).length;

  // Filter logs
  const filteredLogs = recentLogs.filter(
    (log) =>
      !logFilter ||
      log.ip.includes(logFilter) ||
      log.path.toLowerCase().includes(logFilter.toLowerCase()) ||
      log.userAgent.toLowerCase().includes(logFilter.toLowerCase())
  );

  // Get status color
  const getStatusColor = (status: number) => {
    if (status >= 200 && status < 300) return "text-green-400";
    if (status >= 300 && status < 400) return "text-blue-400";
    if (status >= 400 && status < 500) return "text-yellow-400";
    if (status >= 500) return "text-red-400";
    return "text-slate-400";
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="text-slate-400">Loading monitoring data...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Monitoring</h1>
          <p className="mt-1 text-slate-400">
            Real-time system metrics and traffic analytics
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 text-sm text-slate-400">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="h-4 w-4 rounded border-slate-600 bg-slate-800"
            />
            Auto-refresh
          </label>
          <button
            onClick={() => {
              fetchLogStats();
              refreshLogs();
            }}
            className="rounded-lg border border-slate-600 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-800"
          >
            🔄 Refresh
          </button>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="flex gap-1 rounded-lg border border-slate-700 bg-slate-800/50 p-1">
        {[
          { id: "overview", label: "📊 Overview", icon: "📊" },
          { id: "geo", label: "🌍 Geographic", icon: "🌍" },
          { id: "ips", label: "🔢 IP Stats", icon: "🔢" },
          { id: "ua", label: "🖥️ User Agents", icon: "🖥️" },
          { id: "logs", label: "📜 Logs", icon: "📜" },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as typeof activeTab)}
            className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition ${
              activeTab === tab.id
                ? "bg-nubi-accent text-nubi-background"
                : "text-slate-300 hover:bg-slate-700"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Overview Tab */}
      {activeTab === "overview" && (
        <div className="space-y-6">
          {/* System Status Cards */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl border border-slate-700 bg-slate-900 p-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-400">Nginx Status</span>
                <span
                  className={`h-3 w-3 rounded-full ${
                    status?.running ? "bg-green-500" : "bg-red-500"
                  }`}
                />
              </div>
              <p className="mt-2 text-2xl font-bold">
                {status?.running ? "Running" : "Stopped"}
              </p>
              <p className="text-sm text-slate-500">
                {status?.version || "Unknown"}
              </p>
            </div>

            <div className="rounded-xl border border-slate-700 bg-slate-900 p-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-400">Total Requests</span>
                <span className="text-xl">📈</span>
              </div>
              <p className="mt-2 text-2xl font-bold">
                {logStats?.totalRequests?.toLocaleString() || 0}
              </p>
              <p className="text-sm text-slate-500">
                {logStats?.uniqueIPs || 0} unique IPs
              </p>
            </div>

            <div className="rounded-xl border border-slate-700 bg-slate-900 p-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-400">
                  Active Connections
                </span>
                <span className="text-xl">🔗</span>
              </div>
              <p className="mt-2 text-2xl font-bold">
                {metrics?.activeConnections ?? 0}
              </p>
              <p className="text-sm text-slate-500">Current</p>
            </div>

            <div className="rounded-xl border border-slate-700 bg-slate-900 p-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-400">Nubi Uptime</span>
                <span className="text-xl">⏱️</span>
              </div>
              <p className="mt-2 text-2xl font-bold">
                {metrics?.uptimeString || "N/A"}
              </p>
              <p className="text-sm text-slate-500">Service uptime</p>
            </div>
          </div>

          {/* Status Code Distribution */}
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="rounded-xl border border-slate-700 bg-slate-900 p-6">
              <h2 className="text-lg font-semibold mb-4">
                Status Code Distribution
              </h2>
              <div className="space-y-3">
                {Object.entries(logStats?.statusCodes || {})
                  .sort(([a], [b]) => Number(a) - Number(b))
                  .map(([code, count]) => {
                    const total = logStats?.totalRequests || 1;
                    const percent = (count / total) * 100;
                    return (
                      <div key={code}>
                        <div className="flex justify-between mb-1">
                          <span
                            className={`text-sm font-mono ${getStatusColor(
                              Number(code)
                            )}`}
                          >
                            {code}
                          </span>
                          <span className="text-sm text-slate-400">
                            {count.toLocaleString()} ({percent.toFixed(1)}%)
                          </span>
                        </div>
                        <div className="h-2 rounded-full bg-slate-700">
                          <div
                            className={`h-2 rounded-full transition-all ${
                              Number(code) < 300
                                ? "bg-green-500"
                                : Number(code) < 400
                                ? "bg-blue-500"
                                : Number(code) < 500
                                ? "bg-yellow-500"
                                : "bg-red-500"
                            }`}
                            style={{ width: `${Math.min(percent, 100)}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                {Object.keys(logStats?.statusCodes || {}).length === 0 && (
                  <p className="text-slate-500 text-sm">No data available</p>
                )}
              </div>
            </div>

            <div className="rounded-xl border border-slate-700 bg-slate-900 p-6">
              <h2 className="text-lg font-semibold mb-4">Host Status</h2>
              <div className="space-y-4">
                <div>
                  <div className="flex justify-between mb-1">
                    <span className="text-sm text-slate-300">Active</span>
                    <span className="text-sm text-green-400">
                      {activeHosts}
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-700">
                    <div
                      className="h-2 rounded-full bg-green-500"
                      style={{
                        width:
                          totalHosts > 0
                            ? `${(activeHosts / totalHosts) * 100}%`
                            : "0%",
                      }}
                    />
                  </div>
                </div>
                <div>
                  <div className="flex justify-between mb-1">
                    <span className="text-sm text-slate-300">Maintenance</span>
                    <span className="text-sm text-yellow-400">
                      {maintenanceHosts}
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-700">
                    <div
                      className="h-2 rounded-full bg-yellow-500"
                      style={{
                        width:
                          totalHosts > 0
                            ? `${(maintenanceHosts / totalHosts) * 100}%`
                            : "0%",
                      }}
                    />
                  </div>
                </div>
                <div>
                  <div className="flex justify-between mb-1">
                    <span className="text-sm text-slate-300">Disabled</span>
                    <span className="text-sm text-slate-400">
                      {disabledHosts}
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-700">
                    <div
                      className="h-2 rounded-full bg-slate-500"
                      style={{
                        width:
                          totalHosts > 0
                            ? `${(disabledHosts / totalHosts) * 100}%`
                            : "0%",
                      }}
                    />
                  </div>
                </div>
                <div>
                  <div className="flex justify-between mb-1">
                    <span className="text-sm text-slate-300">
                      Load Balanced
                    </span>
                    <span className="text-sm text-blue-400">
                      {loadBalancedHosts}
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-700">
                    <div
                      className="h-2 rounded-full bg-blue-500"
                      style={{
                        width:
                          totalHosts > 0
                            ? `${(loadBalancedHosts / totalHosts) * 100}%`
                            : "0%",
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Geographic Tab */}
      {activeTab === "geo" && (
        <div className="space-y-6">
          {/* World Map Heatmap */}
          <div className="rounded-xl border border-slate-700 bg-slate-900 p-6">
            <h2 className="text-lg font-semibold mb-4">
              🌍 Global Traffic Heatmap
            </h2>
            <div className="relative bg-slate-800 rounded-lg p-4 aspect-[2/1] overflow-hidden">
              {/* Simple SVG World Map */}
              <svg viewBox="0 0 100 50" className="w-full h-full opacity-30">
                <ellipse cx="25" cy="25" rx="15" ry="10" fill="#4b5563" />
                <ellipse cx="50" cy="22" rx="12" ry="12" fill="#4b5563" />
                <ellipse cx="75" cy="25" rx="18" ry="12" fill="#4b5563" />
                <ellipse cx="85" cy="40" rx="8" ry="5" fill="#4b5563" />
              </svg>

              {/* Heatmap dots */}
              {logStats?.countries?.map((country, idx) => {
                const coords = countryCoords[country.code] || countryCoords.XX;
                const size = Math.min(Math.max(country.percent / 5, 2), 8);
                const opacity = Math.min(country.percent / 30 + 0.3, 1);
                return (
                  <div
                    key={idx}
                    className="absolute transform -translate-x-1/2 -translate-y-1/2 animate-pulse"
                    style={{
                      left: `${coords.x}%`,
                      top: `${coords.y}%`,
                    }}
                    title={`${country.country}: ${
                      country.requests
                    } requests (${country.percent.toFixed(1)}%)`}
                  >
                    <div
                      className="rounded-full bg-nubi-accent"
                      style={{
                        width: `${size * 4}px`,
                        height: `${size * 4}px`,
                        opacity,
                        boxShadow: `0 0 ${
                          size * 2
                        }px ${size}px rgba(255, 204, 0, ${opacity * 0.5})`,
                      }}
                    />
                  </div>
                );
              })}

              {(!logStats?.countries || logStats.countries.length === 0) && (
                <div className="absolute inset-0 flex items-center justify-center text-slate-500">
                  No geographic data available
                </div>
              )}
            </div>
          </div>

          {/* Country Stats Table */}
          <div className="rounded-xl border border-slate-700 bg-slate-900 p-6">
            <h2 className="text-lg font-semibold mb-4">Traffic by Region</h2>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-700 text-left text-sm text-slate-400">
                    <th className="pb-3 pr-4">Region</th>
                    <th className="pb-3 pr-4 text-right">Requests</th>
                    <th className="pb-3 pr-4 text-right">Percentage</th>
                    <th className="pb-3">Distribution</th>
                  </tr>
                </thead>
                <tbody>
                  {logStats?.countries?.map((country, idx) => (
                    <tr key={idx} className="border-b border-slate-800 text-sm">
                      <td className="py-3 pr-4">
                        <span className="font-medium">{country.country}</span>
                        <span className="ml-2 text-slate-500">
                          ({country.code})
                        </span>
                      </td>
                      <td className="py-3 pr-4 text-right font-mono">
                        {country.requests.toLocaleString()}
                      </td>
                      <td className="py-3 pr-4 text-right">
                        {country.percent.toFixed(1)}%
                      </td>
                      <td className="py-3">
                        <div className="h-2 w-full max-w-32 rounded-full bg-slate-700">
                          <div
                            className="h-2 rounded-full bg-nubi-accent"
                            style={{
                              width: `${Math.min(country.percent, 100)}%`,
                            }}
                          />
                        </div>
                      </td>
                    </tr>
                  ))}
                  {(!logStats?.countries ||
                    logStats.countries.length === 0) && (
                    <tr>
                      <td
                        colSpan={4}
                        className="py-8 text-center text-slate-500"
                      >
                        No data available
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* IP Stats Tab */}
      {activeTab === "ips" && (
        <div className="space-y-6">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-xl border border-slate-700 bg-slate-900 p-4">
              <p className="text-sm text-slate-400">Total Requests</p>
              <p className="text-2xl font-bold">
                {logStats?.totalRequests?.toLocaleString() || 0}
              </p>
            </div>
            <div className="rounded-xl border border-slate-700 bg-slate-900 p-4">
              <p className="text-sm text-slate-400">Unique IPs</p>
              <p className="text-2xl font-bold">
                {logStats?.uniqueIPs?.toLocaleString() || 0}
              </p>
            </div>
            <div className="rounded-xl border border-slate-700 bg-slate-900 p-4">
              <p className="text-sm text-slate-400">Avg Requests/IP</p>
              <p className="text-2xl font-bold">
                {logStats?.uniqueIPs
                  ? (logStats.totalRequests / logStats.uniqueIPs).toFixed(1)
                  : 0}
              </p>
            </div>
          </div>

          <div className="rounded-xl border border-slate-700 bg-slate-900 p-6">
            <h2 className="text-lg font-semibold mb-4">Top IP Addresses</h2>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-700 text-left text-sm text-slate-400">
                    <th className="pb-3 pr-4">#</th>
                    <th className="pb-3 pr-4">IP Address</th>
                    <th className="pb-3 pr-4">Region</th>
                    <th className="pb-3 pr-4 text-right">Requests</th>
                    <th className="pb-3">Share</th>
                  </tr>
                </thead>
                <tbody>
                  {logStats?.topIPs?.map((ip, idx) => {
                    const percent = (
                      (ip.requests / (logStats?.totalRequests || 1)) *
                      100
                    ).toFixed(1);
                    return (
                      <tr
                        key={idx}
                        className="border-b border-slate-800 text-sm"
                      >
                        <td className="py-3 pr-4 text-slate-500">{idx + 1}</td>
                        <td className="py-3 pr-4 font-mono">{ip.ip}</td>
                        <td className="py-3 pr-4 text-slate-400">
                          {ip.country}
                        </td>
                        <td className="py-3 pr-4 text-right font-mono">
                          {ip.requests.toLocaleString()}
                        </td>
                        <td className="py-3">
                          <div className="flex items-center gap-2">
                            <div className="h-2 w-20 rounded-full bg-slate-700">
                              <div
                                className="h-2 rounded-full bg-blue-500"
                                style={{
                                  width: `${Math.min(Number(percent), 100)}%`,
                                }}
                              />
                            </div>
                            <span className="text-xs text-slate-400">
                              {percent}%
                            </span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {(!logStats?.topIPs || logStats.topIPs.length === 0) && (
                    <tr>
                      <td
                        colSpan={5}
                        className="py-8 text-center text-slate-500"
                      >
                        No IP data available
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* User Agents Tab */}
      {activeTab === "ua" && (
        <div className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="rounded-xl border border-slate-700 bg-slate-900 p-6">
              <h2 className="text-lg font-semibold mb-4">
                Browser Distribution
              </h2>
              <div className="space-y-3">
                {(() => {
                  const browserCounts: Record<string, number> = {};
                  logStats?.topUserAgents?.forEach((ua) => {
                    browserCounts[ua.browser] =
                      (browserCounts[ua.browser] || 0) + ua.requests;
                  });
                  const total =
                    Object.values(browserCounts).reduce((a, b) => a + b, 0) ||
                    1;
                  return Object.entries(browserCounts)
                    .sort(([, a], [, b]) => b - a)
                    .map(([browser, count]) => {
                      const percent = (count / total) * 100;
                      return (
                        <div key={browser}>
                          <div className="flex justify-between mb-1">
                            <span className="text-sm text-slate-300">
                              {browser}
                            </span>
                            <span className="text-sm text-slate-400">
                              {percent.toFixed(1)}%
                            </span>
                          </div>
                          <div className="h-2 rounded-full bg-slate-700">
                            <div
                              className="h-2 rounded-full bg-purple-500"
                              style={{ width: `${percent}%` }}
                            />
                          </div>
                        </div>
                      );
                    });
                })()}
              </div>
            </div>

            <div className="rounded-xl border border-slate-700 bg-slate-900 p-6">
              <h2 className="text-lg font-semibold mb-4">OS Distribution</h2>
              <div className="space-y-3">
                {(() => {
                  const osCounts: Record<string, number> = {};
                  logStats?.topUserAgents?.forEach((ua) => {
                    osCounts[ua.os] = (osCounts[ua.os] || 0) + ua.requests;
                  });
                  const total =
                    Object.values(osCounts).reduce((a, b) => a + b, 0) || 1;
                  return Object.entries(osCounts)
                    .sort(([, a], [, b]) => b - a)
                    .map(([os, count]) => {
                      const percent = (count / total) * 100;
                      return (
                        <div key={os}>
                          <div className="flex justify-between mb-1">
                            <span className="text-sm text-slate-300">{os}</span>
                            <span className="text-sm text-slate-400">
                              {percent.toFixed(1)}%
                            </span>
                          </div>
                          <div className="h-2 rounded-full bg-slate-700">
                            <div
                              className="h-2 rounded-full bg-cyan-500"
                              style={{ width: `${percent}%` }}
                            />
                          </div>
                        </div>
                      );
                    });
                })()}
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-slate-700 bg-slate-900 p-6">
            <h2 className="text-lg font-semibold mb-4">Top User Agents</h2>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-700 text-left text-sm text-slate-400">
                    <th className="pb-3 pr-4">Browser</th>
                    <th className="pb-3 pr-4">OS</th>
                    <th className="pb-3 pr-4 text-right">Requests</th>
                    <th className="pb-3">User Agent</th>
                  </tr>
                </thead>
                <tbody>
                  {logStats?.topUserAgents?.slice(0, 15).map((ua, idx) => (
                    <tr key={idx} className="border-b border-slate-800 text-sm">
                      <td className="py-3 pr-4">
                        <span className="rounded-full bg-purple-900/50 px-2 py-0.5 text-xs text-purple-400">
                          {ua.browser}
                        </span>
                      </td>
                      <td className="py-3 pr-4">
                        <span className="rounded-full bg-cyan-900/50 px-2 py-0.5 text-xs text-cyan-400">
                          {ua.os}
                        </span>
                      </td>
                      <td className="py-3 pr-4 text-right font-mono">
                        {ua.requests.toLocaleString()}
                      </td>
                      <td className="py-3 max-w-md truncate text-slate-400 text-xs">
                        {ua.userAgent}
                      </td>
                    </tr>
                  ))}
                  {(!logStats?.topUserAgents ||
                    logStats.topUserAgents.length === 0) && (
                    <tr>
                      <td
                        colSpan={4}
                        className="py-8 text-center text-slate-500"
                      >
                        No user agent data available
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Logs Tab */}
      {activeTab === "logs" && (
        <div className="space-y-4">
          <div className="flex gap-4">
            <input
              type="text"
              value={logFilter}
              onChange={(e) => setLogFilter(e.target.value)}
              placeholder="Filter logs by IP, path, or user agent..."
              className="flex-1 rounded-lg border border-slate-600 bg-slate-800 px-4 py-2 text-slate-100 placeholder-slate-500 focus:border-nubi-accent focus:outline-none"
            />
            <button
              onClick={refreshLogs}
              className="rounded-lg border border-slate-600 px-4 py-2 text-slate-300 hover:bg-slate-800"
            >
              Refresh
            </button>
          </div>

          <div className="rounded-xl border border-slate-700 bg-slate-900 overflow-hidden">
            <div className="max-h-[600px] overflow-y-auto">
              <table className="w-full">
                <thead className="sticky top-0 bg-slate-800">
                  <tr className="text-left text-xs text-slate-400">
                    <th className="px-4 py-3">Time</th>
                    <th className="px-4 py-3">IP</th>
                    <th className="px-4 py-3">Method</th>
                    <th className="px-4 py-3">Path</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Size</th>
                    <th className="px-4 py-3">User Agent</th>
                  </tr>
                </thead>
                <tbody className="font-mono text-xs">
                  {filteredLogs.map((log, idx) => (
                    <tr
                      key={idx}
                      className="border-t border-slate-800 hover:bg-slate-800/50"
                    >
                      <td className="px-4 py-2 text-slate-500 whitespace-nowrap">
                        {log.time.split(" ")[0]}
                      </td>
                      <td className="px-4 py-2 text-slate-300">{log.ip}</td>
                      <td className="px-4 py-2">
                        <span
                          className={`${
                            log.method === "GET"
                              ? "text-green-400"
                              : log.method === "POST"
                              ? "text-blue-400"
                              : log.method === "DELETE"
                              ? "text-red-400"
                              : "text-yellow-400"
                          }`}
                        >
                          {log.method}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-slate-300 max-w-xs truncate">
                        {log.path}
                      </td>
                      <td className="px-4 py-2">
                        <span className={getStatusColor(log.status)}>
                          {log.status}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-slate-400">
                        {log.size > 1024
                          ? `${(log.size / 1024).toFixed(1)}KB`
                          : `${log.size}B`}
                      </td>
                      <td className="px-4 py-2 text-slate-500 max-w-xs truncate">
                        {log.userAgent}
                      </td>
                    </tr>
                  ))}
                  {filteredLogs.length === 0 && (
                    <tr>
                      <td
                        colSpan={7}
                        className="px-4 py-8 text-center text-slate-500"
                      >
                        {logFilter
                          ? "No logs match your filter"
                          : "No logs available"}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <p className="text-xs text-slate-500 text-center">
            Showing {filteredLogs.length} of {recentLogs.length} recent log
            entries
          </p>
        </div>
      )}

      {/* Footer */}
      <div className="text-center text-xs text-slate-500">
        {autoRefresh
          ? "Auto-refreshing every 5 seconds"
          : "Metrics update via WebSocket • Log stats refresh every minute"}
      </div>
    </div>
  );
}
