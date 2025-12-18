// Backend type for load balancing
export interface Backend {
  address: string;
  weight: number;
  backup: boolean;
}

// Proxy host types
export interface ProxyHost {
  id: string;
  domain: string;
  target: string;
  backends: Backend[];
  lbMethod: string;
  ssl: boolean;
  forceSSL: boolean;
  certificateId: string;
  certPath: string;
  keyPath: string;
  enabled: boolean;
  maintenance: boolean;
  websocket: boolean;
  customNginx: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateHostRequest {
  domain: string;
  target?: string;
  backends?: Backend[];
  lbMethod?: string;
  ssl?: boolean;
  forceSSL?: boolean;
  certificateId?: string;
  enabled?: boolean;
  maintenance?: boolean;
  websocket?: boolean;
  customNginx?: string;
  tags?: string[];
}

export interface HostResponse {
  host: ProxyHost;
  message?: string;
  warning?: string;
}

export interface HostListResponse {
  hosts: ProxyHost[];
  count: number;
}

// Get all proxy hosts
export async function getHosts(): Promise<HostListResponse> {
  const res = await fetch("/api/hosts");
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error || "Failed to fetch hosts");
  }
  return res.json();
}

// Get a single proxy host
export async function getHost(id: string): Promise<HostResponse> {
  const res = await fetch(`/api/hosts/${id}`);
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error || "Failed to fetch host");
  }
  return res.json();
}

// Create a new proxy host
export async function createHost(
  host: CreateHostRequest
): Promise<HostResponse> {
  const res = await fetch("/api/hosts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(host),
  });
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error || "Failed to create host");
  }
  return res.json();
}

// Update an existing proxy host
export async function updateHost(
  id: string,
  host: CreateHostRequest
): Promise<HostResponse> {
  const res = await fetch(`/api/hosts/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(host),
  });
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error || "Failed to update host");
  }
  return res.json();
}

// Delete a proxy host
export async function deleteHost(id: string): Promise<{ message: string }> {
  const res = await fetch(`/api/hosts/${id}`, {
    method: "DELETE",
  });
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error || "Failed to delete host");
  }
  return res.json();
}

// Toggle host enabled/disabled
export async function toggleHost(
  id: string,
  enabled: boolean
): Promise<HostResponse> {
  const res = await fetch(`/api/hosts/${id}/toggle`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ enabled }),
  });
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error || "Failed to toggle host");
  }
  return res.json();
}

// Toggle host maintenance mode
export async function toggleMaintenance(
  id: string,
  maintenance: boolean
): Promise<HostResponse> {
  const res = await fetch(`/api/hosts/${id}/maintenance`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ maintenance }),
  });
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error || "Failed to toggle maintenance");
  }
  return res.json();
}

// Export hosts response
export interface ExportHostsResponse {
  version: string;
  exportedAt: string;
  hosts: ProxyHost[];
}

// Import hosts response
export interface ImportHostsResponse {
  imported: number;
  skipped: number;
  errors: string[];
  message: string;
  warning?: string;
}

// Export all hosts as JSON
export async function exportHosts(): Promise<ExportHostsResponse> {
  const res = await fetch("/api/hosts/export");
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error || "Failed to export hosts");
  }
  return res.json();
}

// Import hosts from JSON
export async function importHosts(
  hosts: ProxyHost[],
  overwrite: boolean = false
): Promise<ImportHostsResponse> {
  const res = await fetch("/api/hosts/import", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ hosts, overwrite }),
  });
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error || "Failed to import hosts");
  }
  return res.json();
}
