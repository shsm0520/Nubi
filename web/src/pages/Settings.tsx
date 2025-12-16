import { useState } from "react";

export function Settings() {
  const [nginxPath, setNginxPath] = useState("/usr/sbin/nginx");
  const [configPath, setConfigPath] = useState("/etc/nginx");
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    // TODO: Implement settings save via API
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">Settings</h1>
        <p className="mt-1 text-slate-400">Configure Nubi preferences</p>
      </div>

      {/* Nginx Settings */}
      <div className="rounded-xl border border-slate-700 bg-slate-900 p-6">
        <h2 className="mb-4 text-lg font-semibold">Nginx Configuration</h2>
        <div className="space-y-4">
          <div>
            <label className="mb-2 block text-sm text-slate-300">
              Nginx Binary Path
            </label>
            <input
              type="text"
              value={nginxPath}
              onChange={(e) => setNginxPath(e.target.value)}
              className="w-full rounded-lg border border-slate-600 bg-slate-800 px-4 py-2 font-mono text-slate-100 placeholder-slate-500 focus:border-nubi-accent focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-2 block text-sm text-slate-300">
              Nginx Config Directory
            </label>
            <input
              type="text"
              value={configPath}
              onChange={(e) => setConfigPath(e.target.value)}
              className="w-full rounded-lg border border-slate-600 bg-slate-800 px-4 py-2 font-mono text-slate-100 placeholder-slate-500 focus:border-nubi-accent focus:outline-none"
            />
          </div>
        </div>
      </div>

      {/* Danger Zone */}
      <div className="rounded-xl border border-red-900/50 bg-slate-900 p-6">
        <h2 className="mb-4 text-lg font-semibold text-red-400">Danger Zone</h2>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">Reset All Configuration</p>
              <p className="text-sm text-slate-400">
                Remove all proxy hosts and restore nginx to default state
              </p>
            </div>
            <button
              type="button"
              className="rounded-lg border border-red-500 px-4 py-2 text-red-400 transition hover:bg-red-500/20"
            >
              Reset All
            </button>
          </div>
        </div>
      </div>

      {/* Save Button */}
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={handleSave}
          className="rounded-lg bg-nubi-accent px-6 py-2 font-medium text-nubi-background transition hover:bg-nubi-accentDark"
        >
          Save Settings
        </button>
        {saved && (
          <span className="text-sm text-green-400">Settings saved!</span>
        )}
      </div>
    </div>
  );
}
