import { useState, useEffect } from "react";
import { reloadNginx, testNginxConfig } from "@/api/nginx";
import { getDefaultRoute, type DefaultRouteConfig } from "@/api/route";
import { setMaintenance } from "@/api/maintenance";
import { getHosts } from "@/api/hosts";
import { useWebSocket } from "@/hooks/useWebSocket";

// Format bytes to human readable string
function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

interface StatusCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  status?: "success" | "warning" | "error" | "info";
  icon: string;
}

function StatusCard({
  title,
  value,
  subtitle,
  status = "info",
  icon,
}: StatusCardProps) {
  const statusColors = {
    success: "text-green-400",
    warning: "text-yellow-400",
    error: "text-red-400",
    info: "text-nubi-accent",
  };

  return (
    <div className="rounded-xl border border-slate-700 bg-slate-900 p-6">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-slate-400">{title}</p>
          <p className={`mt-1 text-2xl font-bold ${statusColors[status]}`}>
            {value}
          </p>
          {subtitle && (
            <p className="mt-1 text-xs text-slate-500">{subtitle}</p>
          )}
        </div>
        <span className="text-3xl">{icon}</span>
      </div>
    </div>
  );
}

export function Dashboard() {
  const { connected, nginxStatus, maintenanceMode, metrics, connect } =
    useWebSocket();
  const [defaultRoute, setDefaultRoute] = useState<DefaultRouteConfig | null>(
    null
  );
  const [hostCount, setHostCount] = useState<{
    total: number;
    enabled: number;
  }>({ total: 0, enabled: 0 });
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [showMaintenanceModal, setShowMaintenanceModal] = useState(false);
  const [maintenanceMessage, setMaintenanceMessage] = useState("");

  // Connect to WebSocket on mount
  useEffect(() => {
    connect();

    // Fetch default route config
    getDefaultRoute()
      .then(({ config }) => setDefaultRoute(config))
      .catch(() => {});

    // Fetch host count
    getHosts()
      .then((data) => {
        const hosts = data.hosts || [];
        setHostCount({
          total: hosts.length,
          enabled: hosts.filter((h) => h.enabled).length,
        });
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [connect]);

  const handleReload = async () => {
    setActionLoading(true);
    setMessage(null);
    try {
      const result = await reloadNginx();
      setMessage({ type: "success", text: result.message });
    } catch (err) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Reload failed",
      });
    } finally {
      setActionLoading(false);
    }
  };

  const handleTest = async () => {
    setActionLoading(true);
    setMessage(null);
    try {
      const result = await testNginxConfig();
      setMessage({
        type: result.valid ? "success" : "error",
        text: result.message,
      });
    } catch (err) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Test failed",
      });
    } finally {
      setActionLoading(false);
    }
  };

  const handleMaintenanceToggle = async () => {
    if (maintenanceMode?.enabled) {
      // Disable maintenance
      setActionLoading(true);
      try {
        await setMaintenance({ enabled: false });
        setMessage({ type: "success", text: "Maintenance mode disabled" });
      } catch (err) {
        setMessage({
          type: "error",
          text:
            err instanceof Error
              ? err.message
              : "Failed to disable maintenance",
        });
      } finally {
        setActionLoading(false);
      }
    } else {
      // Show modal to enable maintenance
      setShowMaintenanceModal(true);
    }
  };

  const handleEnableMaintenance = async () => {
    setActionLoading(true);
    try {
      await setMaintenance({ enabled: true, message: maintenanceMessage });
      setMessage({ type: "success", text: "Maintenance mode enabled" });
      setShowMaintenanceModal(false);
      setMaintenanceMessage("");
    } catch (err) {
      setMessage({
        type: "error",
        text:
          err instanceof Error ? err.message : "Failed to enable maintenance",
      });
    } finally {
      setActionLoading(false);
    }
  };

  const getDefaultRouteLabel = () => {
    if (!defaultRoute?.enabled) return "Not configured";
    switch (defaultRoute.mode) {
      case "nginx_default":
        return "Nginx Default";
      case "custom_page":
        return "Custom Page";
      case "error_code":
        return `Error ${defaultRoute.errorCode}`;
      case "proxy":
        return `Proxy → ${defaultRoute.target}`;
      case "redirect":
        return `Redirect → ${defaultRoute.redirectUrl}`;
      default:
        return "Unknown";
    }
  };

  const nginxRunning = nginxStatus?.running ?? null;
  const configValid = nginxStatus?.configValid ?? null;

  if (loading && !nginxStatus) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="text-slate-400">Loading...</div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Dashboard</h1>
          <p className="mt-1 text-slate-400">
            Overview of your nginx reverse proxy
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`h-2 w-2 rounded-full ${
              connected ? "bg-green-500" : "bg-red-500"
            }`}
          />
          <span className="text-sm text-slate-400">
            {connected ? "Connected" : "Disconnected"}
          </span>
        </div>
      </div>

      {/* Maintenance Banner */}
      {maintenanceMode?.enabled && (
        <div className="rounded-xl border border-yellow-600 bg-yellow-900/30 p-4">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🔧</span>
            <div className="flex-1">
              <p className="font-semibold text-yellow-400">
                Maintenance Mode Active
              </p>
              <p className="text-sm text-yellow-200/70">
                {maintenanceMode.message ||
                  "All requests are showing maintenance page"}
              </p>
            </div>
            <button
              type="button"
              onClick={handleMaintenanceToggle}
              disabled={actionLoading}
              className="rounded-lg bg-yellow-600 px-4 py-2 font-medium text-white transition hover:bg-yellow-700"
            >
              Disable
            </button>
          </div>
        </div>
      )}

      {/* Status Cards */}
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <StatusCard
          title="Nginx Status"
          value={
            nginxRunning === null ? "..." : nginxRunning ? "Running" : "Stopped"
          }
          status={
            nginxRunning === null ? "info" : nginxRunning ? "success" : "error"
          }
          icon="🚀"
        />
        <StatusCard
          title="Config Status"
          value={
            configValid === null ? "..." : configValid ? "Valid" : "Invalid"
          }
          status={
            configValid === null ? "info" : configValid ? "success" : "error"
          }
          icon="✅"
        />
        <StatusCard
          title="Proxy Hosts"
          value={hostCount.total}
          subtitle={`${hostCount.enabled} active`}
          status={hostCount.enabled > 0 ? "success" : "info"}
          icon="🌐"
        />
        <StatusCard
          title="Default Route"
          value={defaultRoute?.enabled ? "Active" : "Inactive"}
          subtitle={getDefaultRouteLabel()}
          status={defaultRoute?.enabled ? "success" : "warning"}
          icon="🔀"
        />
      </div>

      {/* Real-time Metrics */}
      <div className="rounded-xl border border-slate-700 bg-slate-900 p-6">
        <h2 className="mb-4 text-lg font-semibold">Real-time Metrics</h2>
        <div className="grid gap-6 sm:grid-cols-3">
          <div className="text-center">
            <p className="text-3xl font-bold text-nubi-accent">
              {metrics?.uptimeString || "—"}
            </p>
            <p className="mt-1 text-sm text-slate-400">Nubi Uptime</p>
          </div>
          <div className="text-center">
            <p className="text-3xl font-bold text-green-400">
              {metrics?.activeConnections ?? "—"}
            </p>
            <p className="mt-1 text-sm text-slate-400">Active Connections</p>
          </div>
          <div className="text-center">
            <div className="flex justify-center gap-4">
              <div>
                <p className="text-xl font-bold text-emerald-400">
                  ↓ {formatBytes(metrics?.rxBytes ?? 0)}
                </p>
                <p className="text-xs text-slate-500">Received</p>
              </div>
              <div>
                <p className="text-xl font-bold text-orange-400">
                  ↑ {formatBytes(metrics?.txBytes ?? 0)}
                </p>
                <p className="text-xs text-slate-500">Sent</p>
              </div>
            </div>
            <p className="mt-1 text-sm text-slate-400">Network I/O</p>
          </div>
        </div>

        {/* Connection Details */}
        <div className="mt-6 grid gap-4 border-t border-slate-700 pt-4 sm:grid-cols-3">
          <div className="flex items-center justify-between rounded-lg bg-slate-800 px-4 py-3">
            <span className="text-slate-400">Reading</span>
            <span className="font-mono text-lg text-blue-400">
              {metrics?.reading ?? 0}
            </span>
          </div>
          <div className="flex items-center justify-between rounded-lg bg-slate-800 px-4 py-3">
            <span className="text-slate-400">Writing</span>
            <span className="font-mono text-lg text-green-400">
              {metrics?.writing ?? 0}
            </span>
          </div>
          <div className="flex items-center justify-between rounded-lg bg-slate-800 px-4 py-3">
            <span className="text-slate-400">Waiting</span>
            <span className="font-mono text-lg text-yellow-400">
              {metrics?.waiting ?? 0}
            </span>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="rounded-xl border border-slate-700 bg-slate-900 p-6">
        <h2 className="mb-4 text-lg font-semibold">Quick Actions</h2>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={handleReload}
            disabled={actionLoading}
            className="flex items-center gap-2 rounded-lg bg-nubi-accent px-4 py-2 font-medium text-nubi-background transition hover:bg-nubi-accentDark disabled:cursor-not-allowed disabled:bg-slate-700"
          >
            🔄 Reload Nginx
          </button>
          <button
            type="button"
            onClick={handleTest}
            disabled={actionLoading}
            className="flex items-center gap-2 rounded-lg border border-slate-600 px-4 py-2 font-medium text-slate-200 transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            🧪 Test Config
          </button>
          <button
            type="button"
            onClick={handleMaintenanceToggle}
            disabled={actionLoading}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${
              maintenanceMode?.enabled
                ? "border border-yellow-500 text-yellow-400 hover:bg-yellow-500/20"
                : "border border-slate-600 text-slate-200 hover:bg-slate-800"
            }`}
          >
            🔧{" "}
            {maintenanceMode?.enabled ? "End Maintenance" : "Maintenance Mode"}
          </button>
        </div>

        {/* Message */}
        {message && (
          <div
            className={`mt-4 rounded-lg p-3 text-sm ${
              message.type === "success"
                ? "bg-green-900/50 text-green-300"
                : "bg-red-900/50 text-red-300"
            }`}
          >
            {message.text}
          </div>
        )}
      </div>

      {/* System Information */}
      <div className="rounded-xl border border-slate-700 bg-slate-900 p-6">
        <h2 className="mb-4 text-lg font-semibold">System Information</h2>
        <div className="grid gap-4 text-sm">
          <div className="flex justify-between border-b border-slate-700 pb-2">
            <span className="text-slate-400">Nginx Version</span>
            <span className="text-slate-200">
              {nginxStatus?.version || "nginx/1.24.0"}
            </span>
          </div>
          <div className="flex justify-between border-b border-slate-700 pb-2">
            <span className="text-slate-400">Config Path</span>
            <span className="font-mono text-slate-200">/etc/nginx/</span>
          </div>
          <div className="flex justify-between border-b border-slate-700 pb-2">
            <span className="text-slate-400">Sites Available</span>
            <span className="font-mono text-slate-200">
              /etc/nginx/sites-available/
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400">Nubi State</span>
            <span className="font-mono text-slate-200">/var/lib/nubi/</span>
          </div>
        </div>
      </div>

      {/* Maintenance Modal */}
      {showMaintenanceModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md rounded-xl border border-slate-700 bg-slate-900 p-6">
            <h2 className="text-xl font-semibold">Enable Maintenance Mode</h2>
            <p className="mt-2 text-sm text-slate-400">
              All incoming requests will see a maintenance page.
            </p>

            <div className="mt-4">
              <label className="mb-2 block text-sm text-slate-300">
                Message (optional)
              </label>
              <input
                type="text"
                value={maintenanceMessage}
                onChange={(e) => setMaintenanceMessage(e.target.value)}
                placeholder="We're updating our servers..."
                className="w-full rounded-lg border border-slate-600 bg-slate-800 px-4 py-2 text-slate-100 placeholder-slate-500 focus:border-nubi-accent focus:outline-none"
              />
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowMaintenanceModal(false)}
                className="rounded-lg border border-slate-600 px-4 py-2 text-slate-300 transition hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleEnableMaintenance}
                disabled={actionLoading}
                className="rounded-lg bg-yellow-600 px-4 py-2 font-medium text-white transition hover:bg-yellow-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Enable Maintenance
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
