import { Badge } from "@/components/ui/badge";
import type { TrustedReminderGateResult } from "@/lib/contracts/trusted-reminder-gate";

export function TrustedReminderBlockers({
  gate
}: {
  gate: TrustedReminderGateResult;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
            Trusted reminder gate
          </p>
          <p className="mt-2 text-lg font-semibold text-ink">
            {gate.canActivate ? "Clock can be trusted" : "Clock needs proof"}
          </p>
        </div>
        <Badge tone={gate.canActivate ? "success" : "warning"}>
          {gate.canActivate ? "Unblocked" : `${gate.failures.length} blocker${gate.failures.length === 1 ? "" : "s"}`}
        </Badge>
      </div>

      {gate.canActivate ? (
        <p className="mt-3 text-sm text-slate-600">
          Owner, P0 truth, evidence confidence, and schedule are aligned.
        </p>
      ) : (
        <div className="mt-4 space-y-3">
          {gate.failures.slice(0, 3).map((failure) => (
            <div key={failure.code} className="rounded-xl border border-slate-200 p-3">
              <p className="text-sm font-semibold text-ink">{failure.message}</p>
              <p className="mt-1 text-sm text-slate-600">{failure.remediation}</p>
            </div>
          ))}
        </div>
      )}
      <p className="mt-4 text-xs text-slate-500">
        This is a trust gate only; NoticeControl does not auto-send notices.
      </p>
    </div>
  );
}
