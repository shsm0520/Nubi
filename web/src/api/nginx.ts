import axios from "axios";

const client = axios.create({
  baseURL: "/api/nginx",
});

export interface NginxStatus {
  running: boolean;
  version?: string;
  configValid?: boolean;
}

export async function getNginxStatus(): Promise<NginxStatus> {
  const { data } = await client.post("/status");
  // API returns: { status: { configTest: "...", version: "..." } }
  const status = data.status || data;
  const configTest = status.configTest || "";
  const isRunning =
    configTest.includes("syntax is ok") || configTest.includes("successful");

  return {
    running: isRunning,
    version: status.version?.replace("nginx version: ", "") || undefined,
    configValid: configTest.includes("successful"),
  };
}

export async function reloadNginx(): Promise<{ message: string }> {
  const { data } = await client.post("/reload");
  return { message: data.message || "Nginx reloaded" };
}

export async function testNginxConfig(): Promise<{
  message: string;
  valid: boolean;
}> {
  const { data } = await client.post("/test");
  // API returns: { output: "nginx: ... syntax is ok\nnginx: ... test is successful" }
  const message = data.output || data.message || "";
  return {
    message,
    valid: message.includes("successful"),
  };
}

// Legacy exports for compatibility
export const getStatus = getNginxStatus;
export const postReload = reloadNginx;
export const postConfigTest = testNginxConfig;
