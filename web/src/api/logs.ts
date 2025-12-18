// Log entry type
export interface LogEntry {
  ip: string;
  time: string;
  method: string;
  path: string;
  status: number;
  size: number;
  referer: string;
  userAgent: string;
  host?: string;
}

// IP statistics
export interface IPStats {
  ip: string;
  requests: number;
  country: string;
}

// User-Agent statistics
export interface UAStats {
  userAgent: string;
  browser: string;
  os: string;
  requests: number;
}

// Country statistics
export interface CountryStats {
  country: string;
  code: string;
  requests: number;
  percent: number;
}

// Log stats response
export interface LogStatsResponse {
  totalRequests: number;
  uniqueIPs: number;
  topIPs: IPStats[];
  topUserAgents: UAStats[];
  countries: CountryStats[];
  statusCodes: Record<number, number>;
  recentLogs: LogEntry[];
}

// Recent logs response
export interface RecentLogsResponse {
  logs: LogEntry[];
  total: number;
}

// Get log statistics
export async function getLogStats(): Promise<LogStatsResponse> {
  const res = await fetch("/api/logs/stats");
  if (!res.ok) {
    throw new Error("Failed to fetch log stats");
  }
  return res.json();
}

// Get recent logs
export async function getRecentLogs(
  limit: number = 50
): Promise<RecentLogsResponse> {
  const res = await fetch(`/api/logs/recent?limit=${limit}`);
  if (!res.ok) {
    throw new Error("Failed to fetch recent logs");
  }
  return res.json();
}

// Get live logs since timestamp
export async function getLiveLogs(
  since?: string
): Promise<{ logs: LogEntry[]; timestamp: number }> {
  const url = since
    ? `/api/logs/live?since=${encodeURIComponent(since)}`
    : "/api/logs/live";
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error("Failed to fetch live logs");
  }
  return res.json();
}
