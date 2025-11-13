import { useNginxStore, type NginxState } from "@/hooks/useNginxStore";
import { NginxControls } from "@/components/NginxControls";

function ResponseLog() {
  const history = useNginxStore((state: NginxState) => state.history);

  if (history.length === 0) {
    return (
      <p className="text-sm text-slate-300">
        No actions yet. Trigger a command to see responses.
      </p>
    );
  }

  return (
    <div className="mt-6 grid gap-4">
      {history.map((entry) => (
        <article
          key={`${entry.timestamp}-${entry.endpoint}`}
          className="rounded-lg border border-slate-700 bg-slate-900 p-4"
        >
          <header className="flex items-center justify-between text-sm text-slate-300">
            <span className="font-semibold uppercase tracking-wide text-slate-200">
              /{entry.endpoint}
            </span>
            <time dateTime={entry.timestamp}>
              {new Date(entry.timestamp).toLocaleString()}
            </time>
          </header>
          {entry.error ? (
            <p className="mt-2 text-sm text-rose-400">{entry.error}</p>
          ) : (
            <pre className="mt-3 whitespace-pre-wrap rounded bg-slate-950 p-3 text-sm text-slate-200">
              {JSON.stringify(entry.payload, null, 2)}
            </pre>
          )}
        </article>
      ))}
    </div>
  );
}

export default function App() {
  return (
    <main className="min-h-screen bg-nubi-background text-slate-100">
      <section className="mx-auto flex max-w-4xl flex-col gap-8 px-6 py-10">
        <header className="space-y-2">
          <h1 className="text-3xl font-bold">Nubi Control Center</h1>
          <p className="text-slate-300">
            Manage core nginx actions via the Nubi backend API.
          </p>
        </header>

        <NginxControls />
        <ResponseLog />
      </section>
    </main>
  );
}
