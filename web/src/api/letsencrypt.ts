export interface DNSProvider {
  provider: string;
  config: Record<string, string>;
}

export interface IssueLetsEncryptRequest {
  domains: string[];
  dnsProvider: DNSProvider;
  email: string;
  autoRenew: boolean;
}

export interface RenewCertificateRequest {
  certificateId: string;
  dnsProvider: DNSProvider;
}

export interface DNSProviderConfig {
  provider: string;
  requiredFields: string[];
}

export interface RenewalCheck {
  id: string;
  name: string;
  domains: string[];
  expiresAt: string;
  daysUntilExpiry: number;
}

export async function issueLetsEncrypt(request: IssueLetsEncryptRequest) {
  const response = await fetch("/api/letsencrypt/issue", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to issue certificate");
  }

  return response.json();
}

export async function renewLetsEncrypt(request: RenewCertificateRequest) {
  const response = await fetch("/api/letsencrypt/renew", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to renew certificate");
  }

  return response.json();
}

export async function checkAutoRenew(): Promise<{
  needsRenewal: RenewalCheck[];
  total: number;
}> {
  const response = await fetch("/api/letsencrypt/check-renewal");

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to check renewals");
  }

  return response.json();
}

export async function getDNSProviders(): Promise<DNSProviderConfig[]> {
  const response = await fetch("/api/letsencrypt/dns-providers");

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to get DNS providers");
  }

  return response.json();
}
