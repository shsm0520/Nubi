import { useState, useEffect, useRef, useCallback } from "react";
import {
  getHosts,
  createHost,
  updateHost,
  deleteHost,
  toggleHost,
  toggleMaintenance,
  exportHosts,
  importHosts,
  type ProxyHost,
  type CreateHostRequest,
} from "@/api/hosts";
import { getTags, type Tag } from "@/api/certificates";

interface BackendFormData {
  protocol: string;
  host: string;
  port: string;
  weight: number;
  backup: boolean;
}

interface HostFormData {
  domain: string;
  protocol: string;
  targetHost: string;
  targetPort: string;
  useLoadBalancing: boolean;
  backends: BackendFormData[];
  lbMethod: string;
  ssl: boolean;
  forceSSL: boolean;
  enabled: boolean;
  websocket: boolean;
  customNginx: string;
  tags: string[];
}

const defaultFormData: HostFormData = {
  domain: "",
  protocol: "http",
  targetHost: "0.0.0.0",
  targetPort: "80",
  useLoadBalancing: false,
  backends: [
    {
      protocol: "http",
      host: "127.0.0.1",
      port: "80",
      weight: 1,
      backup: false,
    },
  ],
  lbMethod: "round_robin",
  ssl: false,
  forceSSL: false,
  enabled: true,
  websocket: true,
  customNginx: "",
  tags: [],
};

// Preset configurations
interface Preset {
  name: string;
  description: string;
  icon: string;
  config: Partial<HostFormData>;
}

const presets: Record<string, Preset> = {
  cloudflare: {
    name: "Cloudflare Tunnel",
    description: "Headers for Cloudflare proxy",
    icon: "☁️",
    config: {
      websocket: true,
      customNginx: `# Cloudflare Real IP Headers
proxy_set_header X-Real-IP $http_cf_connecting_ip;
proxy_set_header X-Forwarded-For $http_cf_connecting_ip;
proxy_set_header CF-Connecting-IP $http_cf_connecting_ip;
proxy_set_header CF-IPCountry $http_cf_ipcountry;
proxy_set_header CF-RAY $http_cf_ray;
proxy_set_header CF-Visitor $http_cf_visitor;`,
    },
  },
  synologyDsm: {
    name: "Synology DSM",
    description: "DSM Web UI (port 5000/5001)",
    icon: "🖥️",
    config: {
      protocol: "http",
      targetPort: "5000",
      websocket: true,
      customNginx: `# Synology DSM Headers
proxy_set_header X-Real-IP $remote_addr;
proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
proxy_set_header X-Forwarded-Proto $scheme;
proxy_set_header Upgrade $http_upgrade;
proxy_set_header Connection "upgrade";
proxy_connect_timeout 600;
proxy_send_timeout 600;
proxy_read_timeout 600;
proxy_buffering off;
client_max_body_size 0;`,
    },
  },
  synologyPhotos: {
    name: "Synology Photos",
    description: "Synology Photos App",
    icon: "📷",
    config: {
      protocol: "http",
      targetPort: "80",
      websocket: true,
      customNginx: `# Synology Photos
proxy_set_header X-Real-IP $remote_addr;
proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
proxy_set_header X-Forwarded-Proto $scheme;
proxy_buffering off;
client_max_body_size 0;
proxy_read_timeout 86400s;
proxy_send_timeout 86400s;`,
    },
  },
  synologyDrive: {
    name: "Synology Drive",
    description: "Synology Drive App (port 6690)",
    icon: "💾",
    config: {
      protocol: "http",
      targetPort: "6690",
      websocket: true,
      customNginx: `# Synology Drive
proxy_set_header X-Real-IP $remote_addr;
proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
proxy_set_header X-Forwarded-Proto $scheme;
proxy_buffering off;
client_max_body_size 0;
proxy_connect_timeout 3600s;
proxy_read_timeout 3600s;
proxy_send_timeout 3600s;`,
    },
  },
  docker: {
    name: "Docker Container",
    description: "Generic Docker container",
    icon: "🐳",
    config: {
      protocol: "http",
      websocket: true,
      customNginx: `# Docker Container
proxy_set_header X-Real-IP $remote_addr;
proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
proxy_set_header X-Forwarded-Proto $scheme;
proxy_set_header X-Forwarded-Host $host;
proxy_set_header X-Forwarded-Port $server_port;`,
    },
  },
  plex: {
    name: "Plex Media Server",
    description: "Plex streaming (port 32400)",
    icon: "🎬",
    config: {
      protocol: "http",
      targetPort: "32400",
      websocket: true,
      customNginx: `# Plex Media Server
proxy_set_header X-Real-IP $remote_addr;
proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
proxy_set_header X-Forwarded-Proto $scheme;
proxy_set_header Upgrade $http_upgrade;
proxy_set_header Connection "upgrade";
proxy_buffering off;
proxy_redirect off;
client_max_body_size 100M;
send_timeout 100m;`,
    },
  },
  homeAssistant: {
    name: "Home Assistant",
    description: "Home Assistant (port 8123)",
    icon: "🏠",
    config: {
      protocol: "http",
      targetPort: "8123",
      websocket: true,
      customNginx: `# Home Assistant
proxy_set_header X-Real-IP $remote_addr;
proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
proxy_set_header X-Forwarded-Proto $scheme;
proxy_set_header Upgrade $http_upgrade;
proxy_set_header Connection "upgrade";`,
    },
  },
  grafana: {
    name: "Grafana",
    description: "Grafana Dashboard (port 3000)",
    icon: "📊",
    config: {
      protocol: "http",
      targetPort: "3000",
      websocket: true,
      customNginx: `# Grafana
proxy_set_header X-Real-IP $remote_addr;
proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
proxy_set_header X-Forwarded-Proto $scheme;
proxy_set_header X-Forwarded-Host $host;`,
    },
  },
  portainer: {
    name: "Portainer",
    description: "Portainer (port 9000)",
    icon: "📦",
    config: {
      protocol: "http",
      targetPort: "9000",
      websocket: true,
      customNginx: `# Portainer
proxy_set_header X-Real-IP $remote_addr;
proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
proxy_set_header X-Forwarded-Proto $scheme;
proxy_set_header Connection "";`,
    },
  },
};

export function ProxyHosts() {
  const [hosts, setHosts] = useState<ProxyHost[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [editingHost, setEditingHost] = useState<ProxyHost | null>(null);
  const [formData, setFormData] = useState<HostFormData>(defaultFormData);
  const [submitting, setSubmitting] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const [selectedPreset, setSelectedPreset] = useState<string>("");

  // Delete confirmation
  const [deleteConfirm, setDeleteConfirm] = useState<ProxyHost | null>(null);

  // Import modal state
  const [showImportModal, setShowImportModal] = useState(false);
  const [importOverwrite, setImportOverwrite] = useState(false);
  const [importData, setImportData] = useState<ProxyHost[] | null>(null);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fetch tags
  const fetchTags = useCallback(async () => {
    try {
      const data = await getTags();
      setTags(data.tags || []);
    } catch (err) {
      console.error("Failed to fetch tags:", err);
    }
  }, []);

  // Fetch hosts on mount
  useEffect(() => {
    fetchHosts();
    fetchTags();
  }, [fetchTags]);

  const fetchHosts = async () => {
    try {
      setLoading(true);
      const data = await getHosts();
      setHosts(data.hosts || []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch hosts");
    } finally {
      setLoading(false);
    }
  };

  const showMessage = (type: "success" | "error", text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 5000);
  };

  const applyPreset = (presetKey: string) => {
    if (!presetKey || !presets[presetKey]) {
      setSelectedPreset("");
      return;
    }
    const preset = presets[presetKey];
    setFormData((prev) => ({
      ...prev,
      ...preset.config,
    }));
    setSelectedPreset(presetKey);
  };

  const openAddModal = () => {
    setEditingHost(null);
    setFormData(defaultFormData);
    setSelectedPreset("");
    setShowModal(true);
  };

  const openEditModal = (host: ProxyHost) => {
    setEditingHost(host);
    // Parse target URL into protocol, host, port
    let protocol = "http";
    let targetHost = "0.0.0.0";
    let targetPort = "80";
    try {
      const url = new URL(host.target);
      protocol = url.protocol.replace(":", "");
      targetHost = url.hostname;
      targetPort = url.port || (protocol === "https" ? "443" : "80");
    } catch {
      // Fallback: try to parse manually
      const match = host.target.match(/^(https?):\/\/([^:]+):?(\d+)?/);
      if (match) {
        protocol = match[1];
        targetHost = match[2];
        targetPort = match[3] || (protocol === "https" ? "443" : "80");
      }
    }

    // Check if load balancing is enabled
    const hasBackends = host.backends && host.backends.length > 0;

    // Parse backends addresses into protocol/host/port
    const parseBackendAddress = (address: string) => {
      // address is like "127.0.0.1:8080" or "http://127.0.0.1:8080"
      let proto = "http";
      let addrPart = address;

      // Check for protocol prefix
      if (address.startsWith("http://") || address.startsWith("https://")) {
        const url = new URL(address);
        proto = url.protocol.replace(":", "");
        addrPart = url.host;
      }

      const [hostPart, portPart] = addrPart.split(":");
      return {
        protocol: proto,
        host: hostPart || "127.0.0.1",
        port: portPart || "80",
      };
    };

    setFormData({
      domain: host.domain,
      protocol,
      targetHost,
      targetPort,
      useLoadBalancing: hasBackends,
      backends: hasBackends
        ? host.backends.map((b) => {
            const parsed = parseBackendAddress(b.address);
            return {
              protocol: parsed.protocol,
              host: parsed.host,
              port: parsed.port,
              weight: b.weight || 1,
              backup: b.backup || false,
            };
          })
        : [
            {
              protocol: "http",
              host: "127.0.0.1",
              port: "80",
              weight: 1,
              backup: false,
            },
            {
              protocol: "http",
              host: "127.0.0.1",
              port: "8080",
              weight: 1,
              backup: false,
            },
          ],
      lbMethod: host.lbMethod || "round_robin",
      ssl: host.ssl,
      forceSSL: host.forceSSL,
      enabled: host.enabled,
      websocket: host.websocket,
      customNginx: host.customNginx || "",
      tags: host.tags || [],
    });
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingHost(null);
    setFormData(defaultFormData);
    setModalError(null);
    setSelectedPreset("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setModalError(null);

    try {
      // Combine protocol, host, port into target URL
      const target = `${formData.protocol}://${formData.targetHost}:${formData.targetPort}`;

      const request: CreateHostRequest = {
        domain: formData.domain,
        ssl: formData.ssl,
        forceSSL: formData.forceSSL,
        enabled: formData.enabled,
        websocket: formData.websocket,
        customNginx: formData.customNginx || undefined,
        tags: formData.tags,
      };

      // Handle load balancing or single target
      if (formData.useLoadBalancing && formData.backends.length > 0) {
        // Convert backends from protocol/host/port to address format for API
        request.backends = formData.backends.map((b) => ({
          address: `${b.host}:${b.port}`,
          weight: b.weight,
          backup: b.backup,
        }));
        request.lbMethod = formData.lbMethod;
        request.target = ""; // Clear target when using load balancing
      } else {
        request.target = target;
        request.backends = []; // Clear backends when using single target
        request.lbMethod = "";
      }

      if (editingHost) {
        await updateHost(editingHost.id, request);
        showMessage("success", `Host ${formData.domain} updated successfully`);
      } else {
        await createHost(request);
        showMessage("success", `Host ${formData.domain} created successfully`);
      }

      closeModal();
      fetchHosts();
    } catch (err) {
      setModalError(err instanceof Error ? err.message : "Operation failed");
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggle = async (host: ProxyHost) => {
    try {
      await toggleHost(host.id, !host.enabled);
      showMessage(
        "success",
        `Host ${host.domain} ${host.enabled ? "disabled" : "enabled"}`
      );
      fetchHosts();
    } catch (err) {
      showMessage(
        "error",
        err instanceof Error ? err.message : "Toggle failed"
      );
    }
  };

  const handleMaintenance = async (host: ProxyHost) => {
    try {
      await toggleMaintenance(host.id, !host.maintenance);
      showMessage(
        "success",
        `Maintenance mode ${host.maintenance ? "disabled" : "enabled"} for ${
          host.domain
        }`
      );
      fetchHosts();
    } catch (err) {
      showMessage(
        "error",
        err instanceof Error ? err.message : "Toggle maintenance failed"
      );
    }
  };

  const handleDelete = async (host: ProxyHost) => {
    try {
      await deleteHost(host.id);
      showMessage("success", `Host ${host.domain} deleted successfully`);
      setDeleteConfirm(null);
      fetchHosts();
    } catch (err) {
      showMessage(
        "error",
        err instanceof Error ? err.message : "Delete failed"
      );
    }
  };

  // Export handlers
  const handleExport = async () => {
    try {
      const data = await exportHosts();
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `nubi-hosts-${new Date().toISOString().split("T")[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showMessage("success", `Exported ${data.hosts.length} hosts`);
    } catch (err) {
      showMessage(
        "error",
        err instanceof Error ? err.message : "Export failed"
      );
    }
  };

  // Import handlers
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const json = JSON.parse(event.target?.result as string);
        // Support both direct hosts array and export format
        const hostsData = json.hosts || json;
        if (!Array.isArray(hostsData)) {
          showMessage("error", "Invalid file format: expected hosts array");
          return;
        }
        setImportData(hostsData);
        setShowImportModal(true);
      } catch {
        showMessage("error", "Invalid JSON file");
      }
    };
    reader.readAsText(file);
    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleImport = async () => {
    if (!importData) return;

    setImporting(true);
    try {
      const result = await importHosts(importData, importOverwrite);
      let msg = `Imported ${result.imported} hosts`;
      if (result.skipped > 0) {
        msg += `, skipped ${result.skipped}`;
      }
      if (result.errors.length > 0) {
        msg += ` (${result.errors.length} errors)`;
      }
      showMessage(result.errors.length > 0 ? "error" : "success", msg);
      setShowImportModal(false);
      setImportData(null);
      setImportOverwrite(false);
      fetchHosts();
    } catch (err) {
      showMessage(
        "error",
        err instanceof Error ? err.message : "Import failed"
      );
    } finally {
      setImporting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="text-slate-400">Loading hosts...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Hidden file input for import */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileSelect}
        accept=".json"
        className="hidden"
      />

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Proxy Hosts</h1>
          <p className="mt-1 text-slate-400">
            Manage your reverse proxy configurations
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Export */}
          <button
            type="button"
            onClick={handleExport}
            disabled={hosts.length === 0}
            className="flex items-center gap-2 rounded-lg border border-slate-600 px-3 py-2 text-sm text-slate-300 transition hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed"
            title="Export hosts"
          >
            📤 Export
          </button>
          {/* Import */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-2 rounded-lg border border-slate-600 px-3 py-2 text-sm text-slate-300 transition hover:bg-slate-800"
            title="Import hosts"
          >
            📥 Import
          </button>
          {/* Add */}
          <button
            type="button"
            onClick={openAddModal}
            className="flex items-center gap-2 rounded-lg bg-nubi-accent px-4 py-2 font-medium text-nubi-background transition hover:bg-nubi-accentDark"
          >
            <span className="text-lg">+</span>
            Add Proxy Host
          </button>
        </div>
      </div>

      {/* Message */}
      {message && (
        <div
          className={`rounded-lg p-4 ${
            message.type === "success"
              ? "border border-green-600 bg-green-900/30 text-green-400"
              : "border border-red-600 bg-red-900/30 text-red-400"
          }`}
        >
          {message.text}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-red-600 bg-red-900/30 p-4 text-red-400">
          {error}
        </div>
      )}

      {/* Empty State or List */}
      {hosts.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-600 bg-slate-900/50 py-16">
          <span className="text-6xl">🌐</span>
          <h3 className="mt-4 text-xl font-semibold">No Proxy Hosts Yet</h3>
          <p className="mt-2 text-slate-400">
            Add your first proxy host to start routing traffic
          </p>
          <button
            type="button"
            onClick={openAddModal}
            className="mt-6 flex items-center gap-2 rounded-lg bg-nubi-accent px-6 py-2 font-medium text-nubi-background transition hover:bg-nubi-accentDark"
          >
            <span className="text-lg">+</span>
            Add Proxy Host
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {/* Table Header */}
          <div className="flex items-center justify-between rounded-lg bg-slate-800/50 px-4 py-2 text-xs text-slate-400">
            <div className="flex items-center gap-4">
              <span className="w-3">●</span>
              <span>Host / Target</span>
            </div>
            <div className="flex items-center gap-4">
              <span className="w-20 text-center">Features</span>
              <span className="w-11 text-center">On/Off</span>
              <span className="w-11 text-center">🔧</span>
              <span className="w-16 text-center">Actions</span>
            </div>
          </div>

          {/* Host List */}
          <div className="grid gap-2">
            {hosts.map((host) => (
              <div
                key={host.id}
                className={`flex items-center justify-between rounded-xl border bg-slate-900 p-4 ${
                  host.enabled
                    ? host.maintenance
                      ? "border-yellow-600/50"
                      : "border-slate-700"
                    : "border-slate-800 opacity-60"
                }`}
              >
                {/* Left: Status dot + Domain info */}
                <div className="flex items-center gap-4">
                  <span
                    className={`h-2.5 w-2.5 rounded-full ${
                      host.maintenance
                        ? "bg-yellow-500"
                        : host.enabled
                        ? "bg-green-500"
                        : "bg-slate-500"
                    }`}
                    title={
                      host.maintenance
                        ? "Maintenance"
                        : host.enabled
                        ? "Enabled"
                        : "Disabled"
                    }
                  />
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-medium">{host.domain}</p>
                      {/* Tags */}
                      {host.tags && host.tags.length > 0 && (
                        <div className="flex gap-1">
                          {host.tags.map((tagId) => {
                            const tag = tags.find((t) => t.id === tagId);
                            return tag ? (
                              <span
                                key={tagId}
                                className="h-2.5 w-2.5 rounded-full"
                                style={{ backgroundColor: tag.color }}
                                title={tag.name}
                              />
                            ) : null;
                          })}
                        </div>
                      )}
                    </div>
                    <p className="text-sm text-slate-400">
                      →{" "}
                      {host.backends && host.backends.length > 1
                        ? `⚖️ ${host.backends[0]?.address || "backend"} +${
                            host.backends.length - 1
                          } (${host.lbMethod || "round_robin"})`
                        : host.target ||
                          (host.backends?.[0]?.address
                            ? `http://${host.backends[0].address}`
                            : "No target")}
                    </p>
                  </div>
                </div>

                {/* Right: Features box + Controls */}
                <div className="flex items-center gap-4">
                  {/* Feature icons box */}
                  <div className="flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-800/50 px-2 py-1">
                    <span
                      className={`text-sm ${
                        host.backends && host.backends.length > 1
                          ? "opacity-100"
                          : "opacity-30"
                      }`}
                      title={
                        host.backends && host.backends.length > 1
                          ? `Load Balancing: ${host.backends.length} backends`
                          : "Single backend"
                      }
                    >
                      ⚖️
                    </span>
                    <span
                      className={`text-sm ${
                        host.websocket ? "opacity-100" : "opacity-30"
                      }`}
                      title={
                        host.websocket
                          ? "WebSocket enabled"
                          : "WebSocket disabled"
                      }
                    >
                      ⚡
                    </span>
                    <span
                      className={`text-sm ${
                        host.ssl ? "opacity-100" : "opacity-30"
                      }`}
                      title={host.ssl ? "SSL enabled" : "SSL disabled"}
                    >
                      🔒
                    </span>
                    <span
                      className={`text-sm ${
                        host.forceSSL ? "opacity-100" : "opacity-30"
                      }`}
                      title={
                        host.forceSSL
                          ? "Force HTTPS enabled"
                          : "Force HTTPS disabled"
                      }
                    >
                      🔐
                    </span>
                  </div>

                  {/* On/Off Toggle */}
                  <button
                    type="button"
                    onClick={() => handleToggle(host)}
                    className={`relative h-6 w-11 rounded-full transition-colors ${
                      host.enabled ? "bg-green-500" : "bg-slate-600"
                    }`}
                    title={
                      host.enabled ? "Click to disable" : "Click to enable"
                    }
                  >
                    <span
                      className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                        host.enabled ? "left-[22px]" : "left-0.5"
                      }`}
                    />
                  </button>

                  {/* Maintenance Toggle */}
                  <button
                    type="button"
                    onClick={() => handleMaintenance(host)}
                    className={`relative h-6 w-11 rounded-full transition-colors ${
                      host.maintenance ? "bg-yellow-500" : "bg-slate-600"
                    }`}
                    title={
                      host.maintenance
                        ? "Disable maintenance"
                        : "Enable maintenance"
                    }
                  >
                    <span
                      className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                        host.maintenance ? "left-[22px]" : "left-0.5"
                      }`}
                    />
                  </button>

                  {/* Edit */}
                  <button
                    type="button"
                    onClick={() => openEditModal(host)}
                    className="rounded p-2 text-slate-400 transition hover:bg-slate-800 hover:text-slate-200"
                    title="Edit"
                  >
                    ✏️
                  </button>

                  {/* Delete */}
                  <button
                    type="button"
                    onClick={() => setDeleteConfirm(host)}
                    className="rounded p-2 text-slate-400 transition hover:bg-slate-800 hover:text-red-400"
                    title="Delete"
                  >
                    🗑️
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-lg rounded-xl border border-slate-700 bg-slate-900 p-6">
            <h2 className="text-xl font-semibold">
              {editingHost ? "Edit Proxy Host" : "Add Proxy Host"}
            </h2>

            {/* Modal Error Message */}
            {modalError && (
              <div className="mt-4 rounded-lg border border-red-600 bg-red-900/30 p-3 text-sm text-red-400">
                {modalError}
              </div>
            )}

            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              {/* Preset Selector */}
              {!editingHost && (
                <div>
                  <label className="mb-2 block text-sm text-slate-300">
                    Apply Preset (optional)
                  </label>
                  <select
                    value={selectedPreset}
                    onChange={(e) => applyPreset(e.target.value)}
                    className="w-full rounded-lg border border-slate-600 bg-slate-800 px-4 py-2 text-slate-100 focus:border-nubi-accent focus:outline-none"
                  >
                    <option value="">Select a preset...</option>
                    <optgroup label="☁️ CDN / Proxy">
                      <option value="cloudflare">☁️ Cloudflare Tunnel</option>
                    </optgroup>
                    <optgroup label="🖥️ Synology">
                      <option value="synologyDsm">🖥️ Synology DSM</option>
                      <option value="synologyPhotos">📷 Synology Photos</option>
                      <option value="synologyDrive">💾 Synology Drive</option>
                    </optgroup>
                    <optgroup label="🐳 Apps">
                      <option value="docker">🐳 Docker Container</option>
                      <option value="plex">🎬 Plex Media Server</option>
                      <option value="homeAssistant">🏠 Home Assistant</option>
                      <option value="grafana">📊 Grafana</option>
                      <option value="portainer">📦 Portainer</option>
                    </optgroup>
                  </select>
                  {selectedPreset && presets[selectedPreset] && (
                    <p className="mt-1 text-xs text-nubi-accent">
                      ✓ {presets[selectedPreset].description}
                    </p>
                  )}
                </div>
              )}

              {/* Domain */}
              <div>
                <label className="mb-2 block text-sm text-slate-300">
                  Domain Name <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={formData.domain}
                  onChange={(e) =>
                    setFormData({ ...formData, domain: e.target.value })
                  }
                  placeholder="example.com"
                  required
                  className="w-full rounded-lg border border-slate-600 bg-slate-800 px-4 py-2 text-slate-100 placeholder-slate-500 focus:border-nubi-accent focus:outline-none"
                />
                <p className="mt-1 text-xs text-slate-500">
                  Supports wildcards like *.example.com
                </p>
              </div>

              {/* Target / Load Balancing Toggle */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm text-slate-300">
                    Forward to <span className="text-red-400">*</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <span className="text-xs text-slate-400">
                      Load Balancing
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setFormData({
                          ...formData,
                          useLoadBalancing: !formData.useLoadBalancing,
                        })
                      }
                      className={`relative inline-flex h-5 w-9 items-center rounded-full transition ${
                        formData.useLoadBalancing
                          ? "bg-blue-600"
                          : "bg-slate-600"
                      }`}
                    >
                      <span
                        className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition ${
                          formData.useLoadBalancing
                            ? "translate-x-4"
                            : "translate-x-1"
                        }`}
                      />
                    </button>
                  </label>
                </div>

                {/* Single Target Mode */}
                {!formData.useLoadBalancing && (
                  <div className="flex gap-2">
                    <select
                      value={formData.protocol}
                      onChange={(e) =>
                        setFormData({ ...formData, protocol: e.target.value })
                      }
                      className="rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-slate-100 focus:border-nubi-accent focus:outline-none"
                    >
                      <option value="http">http://</option>
                      <option value="https">https://</option>
                    </select>
                    <input
                      type="text"
                      value={formData.targetHost}
                      onChange={(e) =>
                        setFormData({ ...formData, targetHost: e.target.value })
                      }
                      placeholder="0.0.0.0"
                      required={!formData.useLoadBalancing}
                      className="flex-1 rounded-lg border border-slate-600 bg-slate-800 px-4 py-2 text-slate-100 placeholder-slate-500 focus:border-nubi-accent focus:outline-none"
                    />
                    <div className="flex items-center gap-1">
                      <span className="text-slate-500">:</span>
                      <input
                        type="number"
                        value={formData.targetPort}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            targetPort: e.target.value,
                          })
                        }
                        placeholder="80"
                        required={!formData.useLoadBalancing}
                        min="1"
                        max="65535"
                        className="w-20 rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-slate-100 placeholder-slate-500 focus:border-nubi-accent focus:outline-none"
                      />
                    </div>
                  </div>
                )}

                {/* Load Balancing Mode */}
                {formData.useLoadBalancing && (
                  <div className="space-y-3">
                    {/* LB Method */}
                    <div className="flex gap-2">
                      <select
                        value={formData.lbMethod}
                        onChange={(e) =>
                          setFormData({ ...formData, lbMethod: e.target.value })
                        }
                        className="flex-1 rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:border-nubi-accent focus:outline-none"
                      >
                        <option value="round_robin">Round Robin</option>
                        <option value="least_conn">Least Connections</option>
                        <option value="ip_hash">IP Hash (Sticky)</option>
                      </select>
                      <button
                        type="button"
                        onClick={() =>
                          setFormData({
                            ...formData,
                            backends: [
                              ...formData.backends,
                              {
                                protocol: "http",
                                host: "127.0.0.1",
                                port: "80",
                                weight: 1,
                                backup: false,
                              },
                            ],
                          })
                        }
                        className="px-3 py-2 text-sm rounded-lg border border-slate-600 text-slate-300 hover:bg-slate-800"
                      >
                        + Add Backend
                      </button>
                    </div>

                    {/* Backend List */}
                    <div className="space-y-2 max-h-60 overflow-y-auto">
                      {formData.backends.map((backend, idx) => (
                        <div
                          key={idx}
                          className="rounded-lg border border-slate-700 bg-slate-800/50 p-3 space-y-2"
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-slate-400">
                              Backend #{idx + 1}
                            </span>
                            {formData.backends.length > 1 && (
                              <button
                                type="button"
                                onClick={() => {
                                  const newBackends = formData.backends.filter(
                                    (_, i) => i !== idx
                                  );
                                  setFormData({
                                    ...formData,
                                    backends: newBackends,
                                  });
                                }}
                                className="text-xs text-red-400 hover:text-red-300"
                              >
                                Remove
                              </button>
                            )}
                          </div>
                          {/* Protocol / Host / Port - same as single target */}
                          <div className="flex gap-2">
                            <select
                              value={backend.protocol}
                              onChange={(e) => {
                                const newBackends = [...formData.backends];
                                newBackends[idx].protocol = e.target.value;
                                setFormData({
                                  ...formData,
                                  backends: newBackends,
                                });
                              }}
                              className="rounded-lg border border-slate-600 bg-slate-800 px-2 py-1.5 text-sm text-slate-100 focus:border-nubi-accent focus:outline-none"
                            >
                              <option value="http">http://</option>
                              <option value="https">https://</option>
                            </select>
                            <input
                              type="text"
                              value={backend.host}
                              onChange={(e) => {
                                const newBackends = [...formData.backends];
                                newBackends[idx].host = e.target.value;
                                setFormData({
                                  ...formData,
                                  backends: newBackends,
                                });
                              }}
                              placeholder="0.0.0.0"
                              className="flex-1 rounded-lg border border-slate-600 bg-slate-800 px-3 py-1.5 text-sm text-slate-100 placeholder-slate-500 focus:border-nubi-accent focus:outline-none"
                            />
                            <div className="flex items-center gap-1">
                              <span className="text-slate-500">:</span>
                              <input
                                type="number"
                                value={backend.port}
                                onChange={(e) => {
                                  const newBackends = [...formData.backends];
                                  newBackends[idx].port = e.target.value;
                                  setFormData({
                                    ...formData,
                                    backends: newBackends,
                                  });
                                }}
                                placeholder="80"
                                min="1"
                                max="65535"
                                className="w-16 rounded-lg border border-slate-600 bg-slate-800 px-2 py-1.5 text-sm text-slate-100 placeholder-slate-500 focus:border-nubi-accent focus:outline-none"
                              />
                            </div>
                          </div>
                          {/* Weight and Backup */}
                          <div className="flex items-center gap-4">
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-slate-400">
                                Weight:
                              </span>
                              <input
                                type="number"
                                value={backend.weight}
                                onChange={(e) => {
                                  const newBackends = [...formData.backends];
                                  newBackends[idx].weight =
                                    parseInt(e.target.value) || 1;
                                  setFormData({
                                    ...formData,
                                    backends: newBackends,
                                  });
                                }}
                                min="1"
                                max="100"
                                className="w-14 rounded-lg border border-slate-600 bg-slate-800 px-2 py-1 text-sm text-slate-100 focus:border-nubi-accent focus:outline-none"
                              />
                            </div>
                            <label className="flex items-center gap-2 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={backend.backup}
                                onChange={(e) => {
                                  const newBackends = [...formData.backends];
                                  newBackends[idx].backup = e.target.checked;
                                  setFormData({
                                    ...formData,
                                    backends: newBackends,
                                  });
                                }}
                                className="h-3.5 w-3.5 rounded border-slate-600 bg-slate-800 text-nubi-accent"
                              />
                              <span className="text-xs text-slate-400">
                                Backup Server
                              </span>
                            </label>
                          </div>
                        </div>
                      ))}
                    </div>
                    <p className="text-xs text-slate-500">
                      Add multiple backends with weights for load balancing.
                      Backup servers are only used when primary servers are
                      unavailable.
                    </p>
                  </div>
                )}
              </div>

              {/* Options */}
              <div className="grid grid-cols-2 gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.enabled}
                    onChange={(e) =>
                      setFormData({ ...formData, enabled: e.target.checked })
                    }
                    className="h-4 w-4 rounded border-slate-600 bg-slate-800 text-nubi-accent focus:ring-nubi-accent"
                  />
                  <span className="text-sm text-slate-300">Enabled</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.websocket}
                    onChange={(e) =>
                      setFormData({ ...formData, websocket: e.target.checked })
                    }
                    className="h-4 w-4 rounded border-slate-600 bg-slate-800 text-nubi-accent focus:ring-nubi-accent"
                  />
                  <span className="text-sm text-slate-300">
                    WebSocket Support
                  </span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.ssl}
                    onChange={(e) =>
                      setFormData({ ...formData, ssl: e.target.checked })
                    }
                    className="h-4 w-4 rounded border-slate-600 bg-slate-800 text-nubi-accent focus:ring-nubi-accent"
                  />
                  <span className="text-sm text-slate-300">SSL (HTTPS)</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.forceSSL}
                    onChange={(e) =>
                      setFormData({ ...formData, forceSSL: e.target.checked })
                    }
                    disabled={!formData.ssl}
                    className="h-4 w-4 rounded border-slate-600 bg-slate-800 text-nubi-accent focus:ring-nubi-accent disabled:opacity-50"
                  />
                  <span
                    className={`text-sm ${
                      formData.ssl ? "text-slate-300" : "text-slate-500"
                    }`}
                  >
                    Force HTTPS
                  </span>
                </label>
              </div>

              {/* Custom Nginx Config */}
              <div>
                <label className="mb-2 block text-sm text-slate-300">
                  Custom Nginx Configuration (optional)
                </label>
                <textarea
                  value={formData.customNginx}
                  onChange={(e) =>
                    setFormData({ ...formData, customNginx: e.target.value })
                  }
                  placeholder="# Add custom nginx directives here"
                  rows={3}
                  className="w-full rounded-lg border border-slate-600 bg-slate-800 px-4 py-2 font-mono text-sm text-slate-100 placeholder-slate-500 focus:border-nubi-accent focus:outline-none"
                />
              </div>

              {/* Tags */}
              {tags.length > 0 && (
                <div>
                  <label className="mb-2 block text-sm text-slate-300">
                    Tags
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {tags.map((tag) => (
                      <label
                        key={tag.id}
                        className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-1.5 transition ${
                          formData.tags.includes(tag.id)
                            ? "border-nubi-accent bg-nubi-accent/20"
                            : "border-slate-600 hover:border-slate-500"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={formData.tags.includes(tag.id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setFormData({
                                ...formData,
                                tags: [...formData.tags, tag.id],
                              });
                            } else {
                              setFormData({
                                ...formData,
                                tags: formData.tags.filter((t) => t !== tag.id),
                              });
                            }
                          }}
                          className="sr-only"
                        />
                        <span
                          className="h-3 w-3 rounded-full"
                          style={{ backgroundColor: tag.color }}
                        />
                        <span className="text-sm">{tag.name}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex justify-end gap-3 pt-4">
                <button
                  type="button"
                  onClick={closeModal}
                  disabled={submitting}
                  className="rounded-lg border border-slate-600 px-4 py-2 text-slate-300 transition hover:bg-slate-800 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded-lg bg-nubi-accent px-4 py-2 font-medium text-nubi-background transition hover:bg-nubi-accentDark disabled:opacity-50"
                >
                  {submitting ? "Saving..." : editingHost ? "Update" : "Create"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md rounded-xl border border-slate-700 bg-slate-900 p-6">
            <h2 className="text-xl font-semibold text-red-400">
              Delete Proxy Host
            </h2>
            <p className="mt-4 text-slate-300">
              Are you sure you want to delete{" "}
              <strong>{deleteConfirm.domain}</strong>?
            </p>
            <p className="mt-2 text-sm text-slate-400">
              This will remove the nginx configuration and cannot be undone.
            </p>

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setDeleteConfirm(null)}
                className="rounded-lg border border-slate-600 px-4 py-2 text-slate-300 transition hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleDelete(deleteConfirm)}
                className="rounded-lg bg-red-600 px-4 py-2 font-medium text-white transition hover:bg-red-700"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Import Confirmation Modal */}
      {showImportModal && importData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md rounded-xl border border-slate-700 bg-slate-900 p-6">
            <h2 className="text-xl font-semibold">Import Proxy Hosts</h2>
            <p className="mt-4 text-slate-300">
              Found <strong>{importData.length}</strong> host
              {importData.length !== 1 ? "s" : ""} to import:
            </p>
            <div className="mt-3 max-h-40 overflow-y-auto rounded-lg border border-slate-700 bg-slate-800 p-2">
              {importData.map((host, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between py-1 text-sm"
                >
                  <span className="text-slate-200">{host.domain}</span>
                  <span className="text-slate-400 text-xs">
                    → {host.target}
                  </span>
                </div>
              ))}
            </div>

            <label className="mt-4 flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={importOverwrite}
                onChange={(e) => setImportOverwrite(e.target.checked)}
                className="h-4 w-4 rounded border-slate-600 bg-slate-800 text-nubi-accent focus:ring-nubi-accent"
              />
              <span className="text-sm text-slate-300">
                Overwrite existing hosts with same domain
              </span>
            </label>

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setShowImportModal(false);
                  setImportData(null);
                  setImportOverwrite(false);
                }}
                disabled={importing}
                className="rounded-lg border border-slate-600 px-4 py-2 text-slate-300 transition hover:bg-slate-800 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleImport}
                disabled={importing}
                className="rounded-lg bg-nubi-accent px-4 py-2 font-medium text-nubi-background transition hover:bg-nubi-accentDark disabled:opacity-50"
              >
                {importing ? "Importing..." : "Import"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
