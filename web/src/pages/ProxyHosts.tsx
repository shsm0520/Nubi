import { useState } from "react";

interface ProxyHost {
  id: string;
  domain: string;
  target: string;
  ssl: boolean;
  enabled: boolean;
}

export function ProxyHosts() {
  const [hosts] = useState<ProxyHost[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Proxy Hosts</h1>
          <p className="mt-1 text-slate-400">
            Manage your reverse proxy configurations
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 rounded-lg bg-nubi-accent px-4 py-2 font-medium text-nubi-background transition hover:bg-nubi-accentDark"
        >
          <span className="text-lg">+</span>
          Add Proxy Host
        </button>
      </div>

      {/* Empty State or List */}
      {hosts.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-600 bg-slate-900/50 py-16">
          <span className="text-6xl">🌐</span>
          <h3 className="mt-4 text-xl font-semibold">No Proxy Hosts Yet</h3>
          <p className="mt-2 text-slate-400">
            Add your first proxy host to start routing traffic
          </p>
          <button
            type="button"
            onClick={() => setShowAddModal(true)}
            className="mt-6 flex items-center gap-2 rounded-lg bg-nubi-accent px-6 py-2 font-medium text-nubi-background transition hover:bg-nubi-accentDark"
          >
            <span className="text-lg">+</span>
            Add Proxy Host
          </button>
        </div>
      ) : (
        <div className="grid gap-4">
          {hosts.map((host) => (
            <div
              key={host.id}
              className="flex items-center justify-between rounded-xl border border-slate-700 bg-slate-900 p-4"
            >
              <div className="flex items-center gap-4">
                <div
                  className={`h-3 w-3 rounded-full ${
                    host.enabled ? "bg-green-500" : "bg-slate-500"
                  }`}
                />
                <div>
                  <p className="font-medium">{host.domain}</p>
                  <p className="text-sm text-slate-400">→ {host.target}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                {host.ssl && (
                  <span className="rounded bg-green-900/50 px-2 py-1 text-xs text-green-400">
                    🔒 SSL
                  </span>
                )}
                <button
                  type="button"
                  className="rounded p-2 text-slate-400 transition hover:bg-slate-800 hover:text-slate-200"
                >
                  ✏️
                </button>
                <button
                  type="button"
                  className="rounded p-2 text-slate-400 transition hover:bg-slate-800 hover:text-red-400"
                >
                  🗑️
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add Modal Placeholder */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-lg rounded-xl border border-slate-700 bg-slate-900 p-6">
            <h2 className="text-xl font-semibold">Add Proxy Host</h2>
            <p className="mt-2 text-sm text-slate-400">
              This feature is coming soon. Configure your proxy hosts here.
            </p>

            <div className="mt-6 space-y-4">
              <div>
                <label className="mb-2 block text-sm text-slate-300">
                  Domain Name
                </label>
                <input
                  type="text"
                  placeholder="example.com"
                  className="w-full rounded-lg border border-slate-600 bg-slate-800 px-4 py-2 text-slate-100 placeholder-slate-500 focus:border-nubi-accent focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-2 block text-sm text-slate-300">
                  Forward to
                </label>
                <input
                  type="text"
                  placeholder="http://127.0.0.1:3000"
                  className="w-full rounded-lg border border-slate-600 bg-slate-800 px-4 py-2 text-slate-100 placeholder-slate-500 focus:border-nubi-accent focus:outline-none"
                />
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="rounded-lg border border-slate-600 px-4 py-2 text-slate-300 transition hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="rounded-lg bg-nubi-accent px-4 py-2 font-medium text-nubi-background transition hover:bg-nubi-accentDark"
              >
                Save (Coming Soon)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
