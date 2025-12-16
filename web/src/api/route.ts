import axios from "axios";

const client = axios.create({
  baseURL: "/api/route",
});

export type DefaultRouteMode =
  | "nginx_default"
  | "custom_page"
  | "error_code"
  | "proxy"
  | "redirect";

export interface ErrorPageConfig {
  code: number;
  customHtml: string;
}

export interface DefaultRouteConfig {
  enabled: boolean;
  mode: DefaultRouteMode;
  target?: string;
  redirectUrl?: string;
  errorCode?: number;
  customHtml?: string;
  errorPages?: ErrorPageConfig[];
}

export async function getDefaultRoute(): Promise<{
  config: DefaultRouteConfig;
}> {
  const { data } = await client.get("/default");
  return data;
}

export async function setDefaultRoute(
  config: Omit<DefaultRouteConfig, "enabled">
): Promise<{ message: string }> {
  const { data } = await client.post("/default", config);
  return data;
}

export async function deleteDefaultRoute(): Promise<{ message: string }> {
  const { data } = await client.delete("/default");
  return data;
}
