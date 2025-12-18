import { useState, useEffect, useCallback } from "react";
import {
  getDefaultRoute,
  setDefaultRoute,
  deleteDefaultRoute,
  type DefaultRouteConfig,
  type DefaultRouteMode,
  type ErrorPageConfig,
} from "@/api/route";

const ERROR_CODES = [400, 401, 403, 404, 500, 502, 503, 504];

const DEFAULT_ERROR_HTML = (code: number) => `<!DOCTYPE html>
<html>
<head>
  <title>Error ${code}</title>
  <style>
    body { font-family: system-ui, sans-serif; background: #0f172a; color: #e2e8f0; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; }
    .container { text-align: center; }
    h1 { font-size: 6rem; margin: 0; color: #38bdf8; }
    p { font-size: 1.5rem; color: #94a3b8; }
  </style>
</head>
<body>
  <div class="container">
    <h1>${code}</h1>
    <p>${
      code === 404
        ? "Page Not Found"
        : code === 500
        ? "Internal Server Error"
        : code === 502
        ? "Bad Gateway"
        : code === 503
        ? "Service Unavailable"
        : "Error"
    }</p>
  </div>
</body>
</html>`;

// Local storage keys for persisting draft values
const STORAGE_KEY = "nubi_default_route_draft";

interface DraftState {
  mode: DefaultRouteMode;
  target: string;
  redirectUrl: string;
  errorCode: number;
  customHtml: string;
  errorPages: ErrorPageConfig[];
}

function loadDraft(): DraftState | null {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      return JSON.parse(saved);
    }
  } catch {
    // Ignore parse errors
  }
  return null;
}

function saveDraft(draft: DraftState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
  } catch {
    // Ignore storage errors
  }
}

export function DefaultRouteManager() {
  const [loading, setLoading] = useState(false);
  const [config, setConfig] = useState<DefaultRouteConfig | null>(null);
  const [mode, setMode] = useState<DefaultRouteMode>("nginx_default");
  const [target, setTarget] = useState("");
  const [redirectUrl, setRedirectUrl] = useState("");
  const [errorCode, setErrorCode] = useState(404);
  const [customHtml, setCustomHtml] = useState("");
  const [errorPages, setErrorPages] = useState<ErrorPageConfig[]>([]);
  const [activeTab, setActiveTab] = useState<"main" | "errors">("main");
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [initialized, setInitialized] = useState(false);

  // Save draft whenever values change (after initial load)
  useEffect(() => {
    if (initialized) {
      saveDraft({
        mode,
        target,
        redirectUrl,
        errorCode,
        customHtml,
        errorPages,
      });
    }
  }, [
    mode,
    target,
    redirectUrl,
    errorCode,
    customHtml,
    errorPages,
    initialized,
  ]);

  const fetchConfig = useCallback(async () => {
    try {
      const { config: fetchedConfig } = await getDefaultRoute();
      setConfig(fetchedConfig);

      // First, try to load draft from local storage
      const draft = loadDraft();

      if (draft) {
        // Use draft values (preserves all mode inputs)
        setMode(draft.mode);
        setTarget(draft.target);
        setRedirectUrl(draft.redirectUrl);
        setErrorCode(draft.errorCode);
        setCustomHtml(draft.customHtml);
        setErrorPages(draft.errorPages);
      } else if (fetchedConfig.enabled) {
        // No draft, use server config
        setMode(fetchedConfig.mode || "nginx_default");
        setTarget(fetchedConfig.target || "");
        setRedirectUrl(fetchedConfig.redirectUrl || "");
        setErrorCode(fetchedConfig.errorCode || 404);
        setCustomHtml(fetchedConfig.customHtml || "");
        setErrorPages(fetchedConfig.errorPages || []);
      }

      setInitialized(true);
    } catch {
      // Config might not exist yet, try loading draft
      const draft = loadDraft();
      if (draft) {
        setMode(draft.mode);
        setTarget(draft.target);
        setRedirectUrl(draft.redirectUrl);
        setErrorCode(draft.errorCode);
        setCustomHtml(draft.customHtml);
        setErrorPages(draft.errorPages);
      }
      setInitialized(true);
    }
  }, []);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  const handleSave = async () => {
    // Validation
    if (mode === "proxy" && !target.trim()) {
      setMessage({ type: "error", text: "Please enter a backend URL" });
      return;
    }
    if (mode === "redirect" && !redirectUrl.trim()) {
      setMessage({ type: "error", text: "Please enter a redirect URL" });
      return;
    }
    if (mode === "custom_page" && !customHtml.trim()) {
      setMessage({ type: "error", text: "Please enter custom HTML" });
      return;
    }

    setLoading(true);
    setMessage(null);

    try {
      const payload: Omit<DefaultRouteConfig, "enabled"> = {
        mode,
        target: mode === "proxy" ? target : undefined,
        redirectUrl: mode === "redirect" ? redirectUrl : undefined,
        errorCode: mode === "error_code" ? errorCode : undefined,
        customHtml: mode === "custom_page" ? customHtml : undefined,
        errorPages: errorPages.filter((ep) => ep.customHtml.trim()),
      };
      const result = await setDefaultRoute(payload);
      setMessage({ type: "success", text: result.message });
      await fetchConfig();
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Failed to save";
      setMessage({ type: "error", text: errorMsg });
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    setLoading(true);
    setMessage(null);

    try {
      const result = await deleteDefaultRoute();
      setMessage({ type: "success", text: result.message });
      setConfig(null);
      setMode("nginx_default");
      setTarget("");
      setRedirectUrl("");
      setCustomHtml("");
      setErrorPages([]);
      // Clear draft on delete
      localStorage.removeItem(STORAGE_KEY);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Failed to delete";
      setMessage({ type: "error", text: errorMsg });
    } finally {
      setLoading(false);
    }
  };

  const updateErrorPage = (code: number, html: string) => {
    setErrorPages((prev) => {
      const existing = prev.find((ep) => ep.code === code);
      if (existing) {
        return prev.map((ep) =>
          ep.code === code ? { ...ep, customHtml: html } : ep
        );
      }
      return [...prev, { code, customHtml: html }];
    });
  };

  const getErrorPageHtml = (code: number) => {
    return errorPages.find((ep) => ep.code === code)?.customHtml || "";
  };

  const getModeLabel = () => {
    switch (mode) {
      case "nginx_default":
        return "Nginx Default";
      case "custom_page":
        return "Custom HTML Page";
      case "error_code":
        return `Error Code (${errorCode})`;
      case "proxy":
        return `Proxy to ${target}`;
      case "redirect":
        return `Redirect to ${redirectUrl}`;
      default:
        return "Unknown";
    }
  };

  return (
    <div className="rounded-xl border border-slate-700 bg-slate-900 p-6">
      <h2 className="mb-4 text-xl font-semibold">Default Route (Port 80)</h2>
      <p className="mb-4 text-sm text-slate-400">
        Configure where unmatched requests on port 80 should go when no proxy
        rule matches.
      </p>

      {/* Current Status */}
      <div className="mb-6 rounded-lg bg-slate-800 p-4">
        <span className="text-sm text-slate-400">Status: </span>
        {config?.enabled ? (
          <span className="font-medium text-green-400">
            Active — {getModeLabel()}
          </span>
        ) : (
          <span className="font-medium text-slate-500">
            Not configured (Nginx default 404)
          </span>
        )}
      </div>

      {/* Tabs */}
      <div className="mb-6 flex border-b border-slate-700">
        <button
          type="button"
          className={`px-4 py-2 text-sm font-medium transition ${
            activeTab === "main"
              ? "border-b-2 border-nubi-accent text-nubi-accent"
              : "text-slate-400 hover:text-slate-200"
          }`}
          onClick={() => setActiveTab("main")}
        >
          Main Route
        </button>
        <button
          type="button"
          className={`px-4 py-2 text-sm font-medium transition ${
            activeTab === "errors"
              ? "border-b-2 border-nubi-accent text-nubi-accent"
              : "text-slate-400 hover:text-slate-200"
          }`}
          onClick={() => setActiveTab("errors")}
        >
          Error Pages
        </button>
      </div>

      {activeTab === "main" ? (
        <>
          {/* Mode Selection */}
          <div className="mb-6 grid gap-3">
            <label className="text-sm font-medium text-slate-300">
              Response Mode
            </label>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {[
                {
                  value: "nginx_default",
                  label: "Nginx Default",
                  desc: "Built-in nginx welcome page",
                },
                {
                  value: "custom_page",
                  label: "Custom HTML",
                  desc: "Your own HTML page",
                },
                {
                  value: "error_code",
                  label: "Error Code",
                  desc: "Return specific HTTP code",
                },
                {
                  value: "proxy",
                  label: "Reverse Proxy",
                  desc: "Forward to backend",
                },
                {
                  value: "redirect",
                  label: "Redirect",
                  desc: "302 redirect to URL",
                },
              ].map((option) => (
                <label
                  key={option.value}
                  className={`flex cursor-pointer flex-col rounded-lg border p-3 transition ${
                    mode === option.value
                      ? "border-nubi-accent bg-nubi-accent/10"
                      : "border-slate-600 hover:border-slate-500"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="routeMode"
                      value={option.value}
                      checked={mode === option.value}
                      onChange={() => setMode(option.value as DefaultRouteMode)}
                      className="accent-nubi-accent"
                    />
                    <span className="font-medium">{option.label}</span>
                  </div>
                  <span className="mt-1 text-xs text-slate-400">
                    {option.desc}
                  </span>
                </label>
              ))}
            </div>
          </div>

          {/* Mode-specific inputs */}
          {mode === "proxy" && (
            <div className="mb-4">
              <label className="mb-2 block text-sm text-slate-300">
                Backend URL
              </label>
              <input
                type="text"
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                placeholder="http://127.0.0.1:3000"
                className="w-full rounded-lg border border-slate-600 bg-slate-800 px-4 py-2 text-slate-100 placeholder-slate-500 focus:border-nubi-accent focus:outline-none"
              />
            </div>
          )}

          {mode === "redirect" && (
            <div className="mb-4">
              <label className="mb-2 block text-sm text-slate-300">
                Redirect URL
              </label>
              <input
                type="text"
                value={redirectUrl}
                onChange={(e) => setRedirectUrl(e.target.value)}
                placeholder="https://example.com"
                className="w-full rounded-lg border border-slate-600 bg-slate-800 px-4 py-2 text-slate-100 placeholder-slate-500 focus:border-nubi-accent focus:outline-none"
              />
            </div>
          )}

          {mode === "error_code" && (
            <div className="mb-4">
              <label className="mb-2 block text-sm text-slate-300">
                HTTP Error Code
              </label>
              <select
                value={errorCode}
                onChange={(e) => setErrorCode(Number(e.target.value))}
                className="w-full rounded-lg border border-slate-600 bg-slate-800 px-4 py-2 text-slate-100 focus:border-nubi-accent focus:outline-none"
              >
                {ERROR_CODES.map((code) => (
                  <option key={code} value={code}>
                    {code}
                  </option>
                ))}
              </select>
            </div>
          )}

          {mode === "custom_page" && (
            <div className="mb-4">
              <label className="mb-2 block text-sm text-slate-300">
                Custom HTML
              </label>
              <textarea
                value={customHtml}
                onChange={(e) => setCustomHtml(e.target.value)}
                placeholder="<!DOCTYPE html>..."
                rows={10}
                className="w-full rounded-lg border border-slate-600 bg-slate-800 px-4 py-2 font-mono text-sm text-slate-100 placeholder-slate-500 focus:border-nubi-accent focus:outline-none"
              />
              <button
                type="button"
                onClick={() => setCustomHtml(DEFAULT_ERROR_HTML(404))}
                className="mt-2 text-sm text-nubi-accent hover:underline"
              >
                Load template
              </button>
            </div>
          )}
        </>
      ) : (
        <>
          {/* Error Pages Tab */}
          <p className="mb-4 text-sm text-slate-400">
            Customize error pages for specific HTTP status codes. These will be
            used across all routes.
          </p>
          <div className="grid gap-4">
            {ERROR_CODES.map((code) => (
              <div
                key={code}
                className="rounded-lg border border-slate-700 p-4"
              >
                <div className="mb-2 flex items-center justify-between">
                  <span className="font-medium">Error {code}</span>
                  {getErrorPageHtml(code) ? (
                    <span className="rounded bg-green-900/50 px-2 py-0.5 text-xs text-green-400">
                      Customized
                    </span>
                  ) : (
                    <span className="rounded bg-slate-700 px-2 py-0.5 text-xs text-slate-400">
                      Default
                    </span>
                  )}
                </div>
                <textarea
                  value={getErrorPageHtml(code)}
                  onChange={(e) => updateErrorPage(code, e.target.value)}
                  placeholder={`Custom HTML for ${code} error...`}
                  rows={4}
                  className="w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 font-mono text-xs text-slate-100 placeholder-slate-500 focus:border-nubi-accent focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() =>
                    updateErrorPage(code, DEFAULT_ERROR_HTML(code))
                  }
                  className="mt-1 text-xs text-nubi-accent hover:underline"
                >
                  Load template
                </button>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Message */}
      {message && (
        <div
          className={`my-4 rounded-lg p-3 text-sm ${
            message.type === "success"
              ? "bg-green-900/50 text-green-300"
              : "bg-red-900/50 text-red-300"
          }`}
        >
          {message.text}
        </div>
      )}

      {/* Actions */}
      {/* <div className="mt-6 flex gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={loading}
          className="rounded-lg bg-nubi-accent px-6 py-2 font-semibold text-nubi-background transition hover:bg-nubi-accentDark disabled:cursor-not-allowed disabled:bg-slate-700"
        >
          {loading ? "Saving..." : "Save & Apply"}
        </button>
        {config?.enabled && (
          <button
            type="button"
            onClick={handleDelete}
            disabled={loading}
            className="rounded-lg border border-red-500 px-6 py-2 font-semibold text-red-400 transition hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Remove
          </button>
        )}
      </div> */}
    </div>
  );
}
