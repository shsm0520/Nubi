import axios from "axios";

const api = axios.create({
  baseURL: "/api",
});

export interface MaintenanceConfig {
  enabled: boolean;
  message?: string;
}

export async function getMaintenance(): Promise<MaintenanceConfig> {
  const { data } = await api.get("/maintenance");
  return data;
}

export async function setMaintenance(
  config: MaintenanceConfig
): Promise<{ message: string }> {
  const { data } = await api.post("/maintenance", config);
  return data;
}
