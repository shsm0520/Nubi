import { DefaultRouteManager } from "@/components/DefaultRouteManager";

export function DefaultRoutePage() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">Default Route</h1>
        <p className="mt-1 text-slate-400">
          Configure how unmatched requests on port 80 are handled
        </p>
      </div>

      {/* Existing Component */}
      <DefaultRouteManager />
    </div>
  );
}
