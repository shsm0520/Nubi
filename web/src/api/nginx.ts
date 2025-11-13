import axios from "axios";

const client = axios.create({
  baseURL: "/api/nginx",
});

export async function getStatus() {
  const { data } = await client.get("/status");
  return data;
}

export async function postReload() {
  const { data } = await client.post("/reload");
  return data;
}

export async function postConfigTest() {
  const { data } = await client.post("/test");
  return data;
}
