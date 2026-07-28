import { Badge } from "@/components/ui/badge";

export function DecisionBlockersPanel({
  blockers,
  warnings
}: {
  blockers: string[];
  warnings: string[];
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-ink">Decision blockers</h2>
        <Badge tone={blockers.length ? "critical" : "success"}>{blockers.length ? "blocked" : "clear"}</Badge>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Blockers</p>
          {blockers.length ? (
            <ul className="mt-2 space-y-2">
              {blockers.map((blocker) => (
                <li key={blocker} className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">
                  {blocker.replaceAll("_", " ")}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-slate-500">No blocking readiness issues.</p>
          )}
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Warnings</p>
          {warnings.length ? (
            <ul className="mt-2 space-y-2">
              {warnings.map((warning) => (
                <li key={warning} className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                  {warning.replaceAll("_", " ")}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-slate-500">No warning codes on the current score.</p>
          )}
        </div>
      </div>
    </div>
  );
}
