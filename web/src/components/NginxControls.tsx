import { useCallback } from "react";
import { getStatus, postReload, postConfigTest } from "@/api/nginx";
import { useNginxStore, type NginxState } from "@/hooks/useNginxStore";

const ACTIONS = [
  { label: "Check Status", endpoint: "status", runner: getStatus },
  { label: "Test Config", endpoint: "test", runner: postConfigTest },
  { label: "Reload", endpoint: "reload", runner: postReload },
] as const;

export function NginxControls() {
  const { loading, setLoading, addResponse } = useNginxStore(
    (state: NginxState) => ({
      loading: state.loading,
      setLoading: state.setLoading,
      addResponse: state.addResponse,
    })
  );

  const trigger = useCallback(
    async (
      endpoint: (typeof ACTIONS)[number]["endpoint"],
      runner: () => Promise<unknown>
    ) => {
      setLoading(true);
      try {
        const payload = await runner();
        addResponse({
          endpoint,
          payload,
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unknown error";
        addResponse({
          endpoint,
          payload: null,
          timestamp: new Date().toISOString(),
          error: message,
        });
      } finally {
        setLoading(false);
      }
    },
    [addResponse, setLoading]
  );

  return (
    <div className="flex flex-col gap-3 md:flex-row">
      {ACTIONS.map((action) => (
        <button
          key={action.endpoint}
          type="button"
          className="rounded-lg bg-nubi-accent px-6 py-3 font-semibold text-nubi-background transition hover:bg-nubi-accentDark disabled:cursor-not-allowed disabled:bg-slate-700"
          disabled={loading}
          onClick={() => trigger(action.endpoint, action.runner)}
        >
          {action.label}
        </button>
      ))}
    </div>
  );
}
