// Types
export interface Certificate {
  id: string;
  name: string;
  domains: string[];
  certPath: string;
  keyPath: string;
  chainPath: string;
  type: "uploaded" | "letsencrypt" | "self-signed";
  expiresAt: string;
  autoRenew: boolean;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface Tag {
  id: string;
  name: string;
  color: string;
  createdAt: string;
}

// Certificate API

export async function getCertificates(): Promise<{
  certificates: Certificate[];
}> {
  const res = await fetch("/api/certificates");
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error || "Failed to fetch certificates");
  }
  return res.json();
}

export async function getCertificate(
  id: string
): Promise<{ certificate: Certificate }> {
  const res = await fetch(`/api/certificates/${id}`);
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error || "Failed to fetch certificate");
  }
  return res.json();
}

export async function uploadCertificate(
  name: string,
  certFile: File,
  keyFile: File
): Promise<{ message: string; certificate: Certificate }> {
  const formData = new FormData();
  formData.append("name", name);
  formData.append("certificate", certFile);
  formData.append("key", keyFile);

  const response = await fetch("/api/certificates", {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.error || "Failed to upload certificate");
  }

  return response.json();
}

export async function updateCertificate(
  id: string,
  updates: Partial<Certificate>
): Promise<{ message: string; certificate: Certificate }> {
  const res = await fetch(`/api/certificates/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(updates),
  });
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error || "Failed to update certificate");
  }
  return res.json();
}

export async function deleteCertificate(
  id: string
): Promise<{ message: string }> {
  const res = await fetch(`/api/certificates/${id}`, {
    method: "DELETE",
  });
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error || "Failed to delete certificate");
  }
  return res.json();
}

export async function bulkApplyCertificate(
  certificateId: string,
  hostIds?: string[],
  tagId?: string
): Promise<{ message: string; updatedHosts: number }> {
  const res = await fetch("/api/certificates/bulk-apply", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ certificateId, hostIds, tagId }),
  });
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error || "Failed to apply certificate");
  }
  return res.json();
}

// Tag API

export async function getTags(): Promise<{ tags: Tag[] }> {
  const res = await fetch("/api/tags");
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error || "Failed to fetch tags");
  }
  return res.json();
}

export async function createTag(
  tag: Omit<Tag, "id" | "createdAt">
): Promise<{ message: string; tag: Tag }> {
  const res = await fetch("/api/tags", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(tag),
  });
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error || "Failed to create tag");
  }
  return res.json();
}

export async function updateTag(
  id: string,
  updates: Partial<Tag>
): Promise<{ message: string; tag: Tag }> {
  const res = await fetch(`/api/tags/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(updates),
  });
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error || "Failed to update tag");
  }
  return res.json();
}

export async function deleteTag(id: string): Promise<{ message: string }> {
  const res = await fetch(`/api/tags/${id}`, {
    method: "DELETE",
  });
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error || "Failed to delete tag");
  }
  return res.json();
}

export async function bulkTagHosts(
  tagId: string,
  hostIds: string[],
  action: "add" | "remove" = "add"
): Promise<{ message: string; updatedHosts: number }> {
  const res = await fetch("/api/tags/bulk-hosts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tagId, hostIds, action }),
  });
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error || "Failed to bulk tag hosts");
  }
  return res.json();
}
