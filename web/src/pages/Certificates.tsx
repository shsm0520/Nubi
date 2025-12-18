import { useState, useEffect, useCallback, useRef } from "react";
import {
  getCertificates,
  uploadCertificate,
  deleteCertificate,
  updateCertificate,
  bulkApplyCertificate,
  getTags,
  createTag,
  updateTag as updateTagApi,
  deleteTag,
  bulkTagHosts,
  type Certificate,
  type Tag,
} from "@/api/certificates";
import { getHosts, type ProxyHost } from "@/api/hosts";
import {
  issueLetsEncrypt,
  renewLetsEncrypt,
  checkAutoRenew,
  getDNSProviders,
  type DNSProviderConfig,
  type DNSProvider,
} from "@/api/letsencrypt";

const TAG_COLORS = [
  "#ef4444", // red
  "#f97316", // orange
  "#eab308", // yellow
  "#22c55e", // green
  "#14b8a6", // teal
  "#3b82f6", // blue
  "#8b5cf6", // violet
  "#ec4899", // pink
];

export function Certificates() {
  const [certificates, setCertificates] = useState<Certificate[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [hosts, setHosts] = useState<ProxyHost[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"certificates" | "tags">(
    "certificates"
  );
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  // Certificate upload state
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadName, setUploadName] = useState("");
  const certFileRef = useRef<HTMLInputElement>(null);
  const keyFileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  // Bulk apply state
  const [showBulkApplyModal, setShowBulkApplyModal] = useState(false);
  const [selectedCertId, setSelectedCertId] = useState("");
  const [selectedHostIds, setSelectedHostIds] = useState<string[]>([]);
  const [selectedTagIdForBulk, setSelectedTagIdForBulk] = useState("");

  // Tag state
  const [showTagModal, setShowTagModal] = useState(false);
  const [editingTag, setEditingTag] = useState<Tag | null>(null);
  const [tagName, setTagName] = useState("");
  const [tagColor, setTagColor] = useState(TAG_COLORS[0]);

  // Bulk tag hosts state
  const [showBulkTagModal, setShowBulkTagModal] = useState(false);
  const [bulkTagId, setBulkTagId] = useState("");
  const [bulkTagHostIds, setBulkTagHostIds] = useState<string[]>([]);
  const [bulkTagAction, setBulkTagAction] = useState<"add" | "remove">("add");

  // Let's Encrypt state
  const [showLetsEncryptModal, setShowLetsEncryptModal] = useState(false);
  const [leDomains, setLeDomains] = useState("");
  const [leEmail, setLeEmail] = useState("");
  const [leProvider, setLeProvider] = useState("");
  const [leConfig, setLeConfig] = useState<Record<string, string>>({});
  const [leAutoRenew, setLeAutoRenew] = useState(true);
  const [dnsProviders, setDnsProviders] = useState<DNSProviderConfig[]>([]);
  const [renewalChecks, setRenewalChecks] = useState<any[]>([]);

  const fetchData = useCallback(async () => {
    try {
      const [certsRes, tagsRes, hostsRes] = await Promise.all([
        getCertificates(),
        getTags(),
        getHosts(),
      ]);
      setCertificates(certsRes.certificates || []);
      setTags(tagsRes.tags || []);
      setHosts(hostsRes.hosts || []);
    } catch (err) {
      console.error("Failed to fetch data:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleUploadCertificate = async () => {
    if (!uploadName.trim()) {
      setMessage({ type: "error", text: "Please enter a certificate name" });
      return;
    }

    const certFile = certFileRef.current?.files?.[0];
    const keyFile = keyFileRef.current?.files?.[0];

    if (!certFile || !keyFile) {
      setMessage({
        type: "error",
        text: "Please select both certificate and key files",
      });
      return;
    }

    setUploading(true);
    try {
      await uploadCertificate(uploadName, certFile, keyFile);
      setMessage({
        type: "success",
        text: "Certificate uploaded successfully",
      });
      setShowUploadModal(false);
      setUploadName("");
      if (certFileRef.current) certFileRef.current.value = "";
      if (keyFileRef.current) keyFileRef.current.value = "";
      fetchData();
    } catch (err) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Upload failed",
      });
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteCertificate = async (id: string) => {
    if (!confirm("Are you sure you want to delete this certificate?")) return;

    try {
      await deleteCertificate(id);
      setMessage({ type: "success", text: "Certificate deleted" });
      fetchData();
    } catch (err) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Delete failed",
      });
    }
  };

  const handleBulkApply = async () => {
    if (!selectedCertId) {
      setMessage({ type: "error", text: "Please select a certificate" });
      return;
    }

    if (selectedHostIds.length === 0 && !selectedTagIdForBulk) {
      setMessage({ type: "error", text: "Please select hosts or a tag" });
      return;
    }

    try {
      const result = await bulkApplyCertificate(
        selectedCertId,
        selectedHostIds.length > 0 ? selectedHostIds : undefined,
        selectedTagIdForBulk || undefined
      );
      setMessage({
        type: "success",
        text: `Certificate applied to ${result.updatedHosts} hosts`,
      });
      setShowBulkApplyModal(false);
      setSelectedCertId("");
      setSelectedHostIds([]);
      setSelectedTagIdForBulk("");
      fetchData();
    } catch (err) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Bulk apply failed",
      });
    }
  };

  // Tag handlers
  const handleSaveTag = async () => {
    if (!tagName.trim()) {
      setMessage({ type: "error", text: "Please enter a tag name" });
      return;
    }

    try {
      if (editingTag) {
        await updateTagApi(editingTag.id, { name: tagName, color: tagColor });
        setMessage({ type: "success", text: "Tag updated" });
      } else {
        await createTag({ name: tagName, color: tagColor });
        setMessage({ type: "success", text: "Tag created" });
      }
      setShowTagModal(false);
      setEditingTag(null);
      setTagName("");
      setTagColor(TAG_COLORS[0]);
      fetchData();
    } catch (err) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Save failed",
      });
    }
  };

  const handleDeleteTag = async (id: string) => {
    if (!confirm("Are you sure you want to delete this tag?")) return;

    try {
      await deleteTag(id);
      setMessage({ type: "success", text: "Tag deleted" });
      fetchData();
    } catch (err) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Delete failed",
      });
    }
  };

  const handleBulkTagHosts = async () => {
    if (!bulkTagId) {
      setMessage({ type: "error", text: "Please select a tag" });
      return;
    }

    if (bulkTagHostIds.length === 0) {
      setMessage({ type: "error", text: "Please select at least one host" });
      return;
    }

    try {
      const result = await bulkTagHosts(
        bulkTagId,
        bulkTagHostIds,
        bulkTagAction
      );
      setMessage({
        type: "success",
        text: `Tag ${bulkTagAction === "add" ? "added to" : "removed from"} ${
          result.updatedHosts
        } hosts`,
      });
      setShowBulkTagModal(false);
      setBulkTagId("");
      setBulkTagHostIds([]);
      fetchData();
    } catch (err) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Bulk tag failed",
      });
    }
  };

  // Let's Encrypt handlers
  useEffect(() => {
    getDNSProviders().then(setDnsProviders).catch(console.error);
  }, []);

  const handleIssueLetsEncrypt = async () => {
    if (!leDomains.trim() || !leEmail.trim() || !leProvider) {
      setMessage({ type: "error", text: "Please fill all required fields" });
      return;
    }

    const domains = leDomains
      .split(",")
      .map((d) => d.trim())
      .filter(Boolean);
    if (domains.length === 0) {
      setMessage({ type: "error", text: "Please enter at least one domain" });
      return;
    }

    const dnsProvider: DNSProvider = {
      provider: leProvider,
      config: leConfig,
    };

    setUploading(true);
    try {
      await issueLetsEncrypt({
        domains,
        dnsProvider,
        email: leEmail,
        autoRenew: leAutoRenew,
      });
      setMessage({
        type: "success",
        text: "Let's Encrypt certificate issued successfully",
      });
      setShowLetsEncryptModal(false);
      setLeDomains("");
      setLeEmail("");
      setLeProvider("");
      setLeConfig({});
      fetchData();
    } catch (err) {
      setMessage({
        type: "error",
        text:
          err instanceof Error ? err.message : "Failed to issue certificate",
      });
    } finally {
      setUploading(false);
    }
  };

  const handleCheckRenewals = async () => {
    try {
      const result = await checkAutoRenew();
      setRenewalChecks(result.needsRenewal);
      setMessage({
        type: result.total > 0 ? "error" : "success",
        text:
          result.total > 0
            ? `${result.total} certificate(s) need renewal`
            : "All certificates are up to date",
      });
    } catch (err) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Failed to check renewals",
      });
    }
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return "N/A";
    return new Date(dateStr).toLocaleDateString();
  };

  const isExpiringSoon = (dateStr: string) => {
    if (!dateStr) return false;
    const expires = new Date(dateStr);
    const now = new Date();
    const diffDays =
      (expires.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
    return diffDays <= 30;
  };

  const isExpired = (dateStr: string) => {
    if (!dateStr) return false;
    return new Date(dateStr) < new Date();
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="text-slate-400">Loading...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Certificates & Tags</h1>
          <p className="mt-1 text-slate-400">
            Manage SSL certificates and host tags for bulk operations
          </p>
        </div>
      </div>

      {/* Message */}
      {message && (
        <div
          className={`rounded-lg p-3 text-sm ${
            message.type === "success"
              ? "bg-green-900/50 text-green-300"
              : "bg-red-900/50 text-red-300"
          }`}
        >
          {message.text}
          <button
            onClick={() => setMessage(null)}
            className="float-right text-slate-400 hover:text-slate-200"
          >
            ✕
          </button>
        </div>
      )}

      {/* Tab Navigation */}
      <div className="flex gap-1 rounded-lg border border-slate-700 bg-slate-800/50 p-1">
        <button
          onClick={() => setActiveTab("certificates")}
          className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition ${
            activeTab === "certificates"
              ? "bg-nubi-accent text-nubi-background"
              : "text-slate-300 hover:bg-slate-700"
          }`}
        >
          🔐 SSL Certificates
        </button>
        <button
          onClick={() => setActiveTab("tags")}
          className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition ${
            activeTab === "tags"
              ? "bg-nubi-accent text-nubi-background"
              : "text-slate-300 hover:bg-slate-700"
          }`}
        >
          🏷️ Tags
        </button>
      </div>

      {/* Certificates Tab */}
      {activeTab === "certificates" && (
        <div className="space-y-4">
          {/* Actions */}
          <div className="flex gap-3">
            <button
              onClick={() => setShowLetsEncryptModal(true)}
              className="rounded-lg bg-green-600 px-4 py-2 font-semibold text-white hover:bg-green-700"
            >
              🔒 Issue Let's Encrypt
            </button>
            <button
              onClick={() => setShowUploadModal(true)}
              className="rounded-lg bg-nubi-accent px-4 py-2 font-semibold text-nubi-background hover:bg-nubi-accentDark"
            >
              ➕ Upload Certificate
            </button>
            <button
              onClick={() => setShowBulkApplyModal(true)}
              className="rounded-lg border border-slate-600 px-4 py-2 text-slate-300 hover:bg-slate-800"
            >
              📋 Bulk Apply to Hosts
            </button>
            <button
              onClick={handleCheckRenewals}
              className="rounded-lg border border-slate-600 px-4 py-2 text-slate-300 hover:bg-slate-800"
            >
              🔄 Check Renewals
            </button>
          </div>

          {/* Renewal Warnings */}
          {renewalChecks.length > 0 && (
            <div className="rounded-lg border border-orange-700 bg-orange-900/20 p-4">
              <h3 className="mb-2 font-semibold text-orange-400">
                ⚠️ Certificates Expiring Soon
              </h3>
              <div className="space-y-2">
                {renewalChecks.map((check) => (
                  <div key={check.id} className="text-sm">
                    <span className="font-medium">{check.name}</span>
                    <span className="text-slate-400">
                      {" "}
                      - expires in {check.daysUntilExpiry} days
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Certificates List */}
          <div className="rounded-xl border border-slate-700 bg-slate-900 overflow-hidden">
            {certificates.length === 0 ? (
              <div className="p-8 text-center text-slate-400">
                No certificates uploaded yet
              </div>
            ) : (
              <table className="w-full">
                <thead className="bg-slate-800">
                  <tr className="text-left text-sm text-slate-400">
                    <th className="px-4 py-3">Name</th>
                    <th className="px-4 py-3">Domains</th>
                    <th className="px-4 py-3">Type</th>
                    <th className="px-4 py-3">Expires</th>
                    <th className="px-4 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {certificates.map((cert) => (
                    <tr key={cert.id} className="border-t border-slate-800">
                      <td className="px-4 py-3">
                        <span className="font-medium">{cert.name}</span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {cert.domains?.slice(0, 3).map((domain, idx) => (
                            <span
                              key={idx}
                              className="rounded bg-slate-700 px-2 py-0.5 text-xs"
                            >
                              {domain}
                            </span>
                          ))}
                          {cert.domains?.length > 3 && (
                            <span className="text-xs text-slate-500">
                              +{cert.domains.length - 3} more
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs ${
                            cert.type === "letsencrypt"
                              ? "bg-green-900/50 text-green-400"
                              : cert.type === "uploaded"
                              ? "bg-blue-900/50 text-blue-400"
                              : "bg-yellow-900/50 text-yellow-400"
                          }`}
                        >
                          {cert.type}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`${
                            isExpired(cert.expiresAt)
                              ? "text-red-400"
                              : isExpiringSoon(cert.expiresAt)
                              ? "text-yellow-400"
                              : "text-slate-300"
                          }`}
                        >
                          {formatDate(cert.expiresAt)}
                        </span>
                        {isExpired(cert.expiresAt) && (
                          <span className="ml-2 text-xs text-red-400">
                            ⚠️ Expired
                          </span>
                        )}
                        {!isExpired(cert.expiresAt) &&
                          isExpiringSoon(cert.expiresAt) && (
                            <span className="ml-2 text-xs text-yellow-400">
                              ⚠️ Expiring soon
                            </span>
                          )}
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => handleDeleteCertificate(cert.id)}
                          className="text-red-400 hover:text-red-300"
                        >
                          🗑️ Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* Tags Tab */}
      {activeTab === "tags" && (
        <div className="space-y-4">
          {/* Actions */}
          <div className="flex gap-3">
            <button
              onClick={() => {
                setEditingTag(null);
                setTagName("");
                setTagColor(TAG_COLORS[0]);
                setShowTagModal(true);
              }}
              className="rounded-lg bg-nubi-accent px-4 py-2 font-semibold text-nubi-background hover:bg-nubi-accentDark"
            >
              ➕ Create Tag
            </button>
            <button
              onClick={() => setShowBulkTagModal(true)}
              className="rounded-lg border border-slate-600 px-4 py-2 text-slate-300 hover:bg-slate-800"
            >
              📋 Bulk Tag Hosts
            </button>
          </div>

          {/* Tags Grid */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {tags.length === 0 ? (
              <div className="col-span-full rounded-xl border border-slate-700 bg-slate-900 p-8 text-center text-slate-400">
                No tags created yet
              </div>
            ) : (
              tags.map((tag) => {
                const hostCount = hosts.filter((h) =>
                  h.tags?.includes(tag.id)
                ).length;
                return (
                  <div
                    key={tag.id}
                    className="rounded-xl border border-slate-700 bg-slate-900 p-4"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span
                          className="h-4 w-4 rounded-full"
                          style={{ backgroundColor: tag.color }}
                        />
                        <span className="font-medium">{tag.name}</span>
                      </div>
                      <span className="rounded-full bg-slate-700 px-2 py-0.5 text-xs text-slate-400">
                        {hostCount} hosts
                      </span>
                    </div>
                    <div className="mt-3 flex gap-2">
                      <button
                        onClick={() => {
                          setEditingTag(tag);
                          setTagName(tag.name);
                          setTagColor(tag.color);
                          setShowTagModal(true);
                        }}
                        className="text-sm text-slate-400 hover:text-slate-200"
                      >
                        ✏️ Edit
                      </button>
                      <button
                        onClick={() => handleDeleteTag(tag.id)}
                        className="text-sm text-red-400 hover:text-red-300"
                      >
                        🗑️ Delete
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* Upload Certificate Modal */}
      {showUploadModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md rounded-xl border border-slate-700 bg-slate-900 p-6">
            <h3 className="text-xl font-semibold mb-4">Upload Certificate</h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm text-slate-300 mb-1">
                  Name
                </label>
                <input
                  type="text"
                  value={uploadName}
                  onChange={(e) => setUploadName(e.target.value)}
                  placeholder="My Certificate"
                  className="w-full rounded-lg border border-slate-600 bg-slate-800 px-4 py-2 text-slate-100 placeholder-slate-500 focus:border-nubi-accent focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-sm text-slate-300 mb-1">
                  Certificate File (.crt, .pem)
                </label>
                <input
                  type="file"
                  ref={certFileRef}
                  accept=".crt,.pem,.cer"
                  className="w-full rounded-lg border border-slate-600 bg-slate-800 px-4 py-2 text-slate-100 file:mr-4 file:rounded file:border-0 file:bg-nubi-accent file:px-2 file:py-1 file:text-sm file:font-semibold file:text-nubi-background"
                />
              </div>

              <div>
                <label className="block text-sm text-slate-300 mb-1">
                  Private Key File (.key)
                </label>
                <input
                  type="file"
                  ref={keyFileRef}
                  accept=".key,.pem"
                  className="w-full rounded-lg border border-slate-600 bg-slate-800 px-4 py-2 text-slate-100 file:mr-4 file:rounded file:border-0 file:bg-nubi-accent file:px-2 file:py-1 file:text-sm file:font-semibold file:text-nubi-background"
                />
              </div>
            </div>

            <div className="mt-6 flex gap-3 justify-end">
              <button
                onClick={() => setShowUploadModal(false)}
                className="rounded-lg border border-slate-600 px-4 py-2 text-slate-300 hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                onClick={handleUploadCertificate}
                disabled={uploading}
                className="rounded-lg bg-nubi-accent px-4 py-2 font-semibold text-nubi-background hover:bg-nubi-accentDark disabled:opacity-50"
              >
                {uploading ? "Uploading..." : "Upload"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Apply Certificate Modal */}
      {showBulkApplyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-lg rounded-xl border border-slate-700 bg-slate-900 p-6 max-h-[80vh] overflow-y-auto">
            <h3 className="text-xl font-semibold mb-4">
              Bulk Apply Certificate
            </h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm text-slate-300 mb-1">
                  Select Certificate
                </label>
                <select
                  value={selectedCertId}
                  onChange={(e) => setSelectedCertId(e.target.value)}
                  className="w-full rounded-lg border border-slate-600 bg-slate-800 px-4 py-2 text-slate-100 focus:border-nubi-accent focus:outline-none"
                >
                  <option value="">Choose a certificate...</option>
                  {certificates.map((cert) => (
                    <option key={cert.id} value={cert.id}>
                      {cert.name} ({cert.domains?.[0] || "Unknown domain"})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm text-slate-300 mb-1">
                  Apply by Tag (optional)
                </label>
                <select
                  value={selectedTagIdForBulk}
                  onChange={(e) => setSelectedTagIdForBulk(e.target.value)}
                  className="w-full rounded-lg border border-slate-600 bg-slate-800 px-4 py-2 text-slate-100 focus:border-nubi-accent focus:outline-none"
                >
                  <option value="">No tag filter</option>
                  {tags.map((tag) => (
                    <option key={tag.id} value={tag.id}>
                      {tag.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm text-slate-300 mb-1">
                  Or Select Individual Hosts
                </label>
                <div className="max-h-48 overflow-y-auto rounded-lg border border-slate-600 bg-slate-800 p-2">
                  {hosts.map((host) => (
                    <label
                      key={host.id}
                      className="flex items-center gap-2 rounded p-2 hover:bg-slate-700"
                    >
                      <input
                        type="checkbox"
                        checked={selectedHostIds.includes(host.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedHostIds([...selectedHostIds, host.id]);
                          } else {
                            setSelectedHostIds(
                              selectedHostIds.filter((id) => id !== host.id)
                            );
                          }
                        }}
                        className="rounded border-slate-600"
                      />
                      <span>{host.domain}</span>
                      {host.ssl && (
                        <span className="rounded bg-green-900/50 px-1.5 py-0.5 text-xs text-green-400">
                          SSL
                        </span>
                      )}
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-6 flex gap-3 justify-end">
              <button
                onClick={() => {
                  setShowBulkApplyModal(false);
                  setSelectedCertId("");
                  setSelectedHostIds([]);
                  setSelectedTagIdForBulk("");
                }}
                className="rounded-lg border border-slate-600 px-4 py-2 text-slate-300 hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                onClick={handleBulkApply}
                className="rounded-lg bg-nubi-accent px-4 py-2 font-semibold text-nubi-background hover:bg-nubi-accentDark"
              >
                Apply Certificate
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create/Edit Tag Modal */}
      {showTagModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md rounded-xl border border-slate-700 bg-slate-900 p-6">
            <h3 className="text-xl font-semibold mb-4">
              {editingTag ? "Edit Tag" : "Create Tag"}
            </h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm text-slate-300 mb-1">
                  Name
                </label>
                <input
                  type="text"
                  value={tagName}
                  onChange={(e) => setTagName(e.target.value)}
                  placeholder="Production"
                  className="w-full rounded-lg border border-slate-600 bg-slate-800 px-4 py-2 text-slate-100 placeholder-slate-500 focus:border-nubi-accent focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-sm text-slate-300 mb-1">
                  Color
                </label>
                <div className="flex gap-2 flex-wrap">
                  {TAG_COLORS.map((color) => (
                    <button
                      key={color}
                      onClick={() => setTagColor(color)}
                      className={`h-8 w-8 rounded-full transition ${
                        tagColor === color
                          ? "ring-2 ring-white ring-offset-2 ring-offset-slate-900"
                          : ""
                      }`}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-6 flex gap-3 justify-end">
              <button
                onClick={() => {
                  setShowTagModal(false);
                  setEditingTag(null);
                }}
                className="rounded-lg border border-slate-600 px-4 py-2 text-slate-300 hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveTag}
                className="rounded-lg bg-nubi-accent px-4 py-2 font-semibold text-nubi-background hover:bg-nubi-accentDark"
              >
                {editingTag ? "Update" : "Create"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Tag Hosts Modal */}
      {showBulkTagModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-lg rounded-xl border border-slate-700 bg-slate-900 p-6 max-h-[80vh] overflow-y-auto">
            <h3 className="text-xl font-semibold mb-4">Bulk Tag Hosts</h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm text-slate-300 mb-1">
                  Select Tag
                </label>
                <select
                  value={bulkTagId}
                  onChange={(e) => setBulkTagId(e.target.value)}
                  className="w-full rounded-lg border border-slate-600 bg-slate-800 px-4 py-2 text-slate-100 focus:border-nubi-accent focus:outline-none"
                >
                  <option value="">Choose a tag...</option>
                  {tags.map((tag) => (
                    <option key={tag.id} value={tag.id}>
                      {tag.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm text-slate-300 mb-1">
                  Action
                </label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      checked={bulkTagAction === "add"}
                      onChange={() => setBulkTagAction("add")}
                      className="accent-nubi-accent"
                    />
                    Add tag
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      checked={bulkTagAction === "remove"}
                      onChange={() => setBulkTagAction("remove")}
                      className="accent-nubi-accent"
                    />
                    Remove tag
                  </label>
                </div>
              </div>

              <div>
                <label className="block text-sm text-slate-300 mb-1">
                  Select Hosts
                </label>
                <div className="max-h-48 overflow-y-auto rounded-lg border border-slate-600 bg-slate-800 p-2">
                  {hosts.map((host) => (
                    <label
                      key={host.id}
                      className="flex items-center gap-2 rounded p-2 hover:bg-slate-700"
                    >
                      <input
                        type="checkbox"
                        checked={bulkTagHostIds.includes(host.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setBulkTagHostIds([...bulkTagHostIds, host.id]);
                          } else {
                            setBulkTagHostIds(
                              bulkTagHostIds.filter((id) => id !== host.id)
                            );
                          }
                        }}
                        className="rounded border-slate-600"
                      />
                      <span>{host.domain}</span>
                      <div className="flex gap-1 ml-auto">
                        {host.tags?.map((tagId) => {
                          const tag = tags.find((t) => t.id === tagId);
                          return tag ? (
                            <span
                              key={tagId}
                              className="h-3 w-3 rounded-full"
                              style={{ backgroundColor: tag.color }}
                              title={tag.name}
                            />
                          ) : null;
                        })}
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-6 flex gap-3 justify-end">
              <button
                onClick={() => {
                  setShowBulkTagModal(false);
                  setBulkTagId("");
                  setBulkTagHostIds([]);
                }}
                className="rounded-lg border border-slate-600 px-4 py-2 text-slate-300 hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                onClick={handleBulkTagHosts}
                className="rounded-lg bg-nubi-accent px-4 py-2 font-semibold text-nubi-background hover:bg-nubi-accentDark"
              >
                Apply
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Let's Encrypt Modal */}
      {showLetsEncryptModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-2xl rounded-xl border border-slate-700 bg-slate-900 p-6 max-h-[80vh] overflow-y-auto">
            <h3 className="text-xl font-semibold mb-4">
              🔒 Issue Let's Encrypt Certificate
            </h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm text-slate-300 mb-1">
                  Email Address <span className="text-red-400">*</span>
                </label>
                <input
                  type="email"
                  value={leEmail}
                  onChange={(e) => setLeEmail(e.target.value)}
                  placeholder="admin@example.com"
                  className="w-full rounded-lg border border-slate-600 bg-slate-800 px-4 py-2 text-slate-100 focus:border-nubi-accent focus:outline-none"
                />
                <p className="mt-1 text-xs text-slate-500">
                  Used for important renewal and security notices
                </p>
              </div>

              <div>
                <label className="block text-sm text-slate-300 mb-1">
                  Domains <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={leDomains}
                  onChange={(e) => setLeDomains(e.target.value)}
                  placeholder="example.com, *.example.com"
                  className="w-full rounded-lg border border-slate-600 bg-slate-800 px-4 py-2 text-slate-100 focus:border-nubi-accent focus:outline-none"
                />
                <p className="mt-1 text-xs text-slate-500">
                  Comma-separated list. Use *.domain for wildcards (requires DNS
                  challenge)
                </p>
              </div>

              <div>
                <label className="block text-sm text-slate-300 mb-1">
                  DNS Provider <span className="text-red-400">*</span>
                </label>
                <select
                  value={leProvider}
                  onChange={(e) => {
                    setLeProvider(e.target.value);
                    setLeConfig({});
                  }}
                  className="w-full rounded-lg border border-slate-600 bg-slate-800 px-4 py-2 text-slate-100 focus:border-nubi-accent focus:outline-none"
                >
                  <option value="">Choose DNS provider...</option>
                  {dnsProviders.map((provider) => (
                    <option key={provider.provider} value={provider.provider}>
                      {provider.provider.charAt(0).toUpperCase() +
                        provider.provider.slice(1)}
                    </option>
                  ))}
                </select>
              </div>

              {leProvider && (
                <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-4">
                  <h4 className="text-sm font-semibold mb-3 text-slate-300">
                    DNS Provider Configuration
                  </h4>
                  <div className="space-y-3">
                    {dnsProviders
                      .find((p) => p.provider === leProvider)
                      ?.requiredFields.map((field) => (
                        <div key={field}>
                          <label className="block text-xs text-slate-400 mb-1">
                            {field}
                          </label>
                          <input
                            type="text"
                            value={leConfig[field] || ""}
                            onChange={(e) =>
                              setLeConfig({
                                ...leConfig,
                                [field]: e.target.value,
                              })
                            }
                            placeholder={field}
                            className="w-full rounded border border-slate-600 bg-slate-800 px-3 py-1.5 text-sm text-slate-100 focus:border-nubi-accent focus:outline-none"
                          />
                        </div>
                      ))}
                  </div>
                </div>
              )}

              <div>
                <label className="flex items-center gap-2 text-sm text-slate-300">
                  <input
                    type="checkbox"
                    checked={leAutoRenew}
                    onChange={(e) => setLeAutoRenew(e.target.checked)}
                    className="rounded border-slate-600"
                  />
                  Enable automatic renewal (30 days before expiry)
                </label>
              </div>

              <div className="rounded-lg border border-blue-700 bg-blue-900/20 p-3">
                <p className="text-xs text-blue-300">
                  ℹ️ DNS challenge requires API access to your DNS provider. The
                  certificate will be issued by Let's Encrypt and automatically
                  renewed before expiration.
                </p>
              </div>
            </div>

            <div className="mt-6 flex gap-3 justify-end">
              <button
                onClick={() => {
                  setShowLetsEncryptModal(false);
                  setLeDomains("");
                  setLeEmail("");
                  setLeProvider("");
                  setLeConfig({});
                }}
                className="rounded-lg border border-slate-600 px-4 py-2 text-slate-300 hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                onClick={handleIssueLetsEncrypt}
                disabled={uploading}
                className="rounded-lg bg-green-600 px-4 py-2 font-semibold text-white hover:bg-green-700 disabled:opacity-50"
              >
                {uploading ? "Issuing..." : "Issue Certificate"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
