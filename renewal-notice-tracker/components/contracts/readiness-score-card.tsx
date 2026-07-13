import { Badge } from "@/components/ui/badge";
import type { RenewalReadinessScore } from "@/lib/contracts/readiness-score";

const READINESS_LABELS: Record<RenewalReadinessScore["label"], string> = {
  not_ready: "Not ready",
  needs_review: "Needs review",
  mostly_ready: "Mostly ready",
  ready: "Ready"
};

const READINESS_TONES: Record<
  RenewalReadinessScore["label"],
  "critical" | "warning" | "urgent" | "success"
> = {
  not_ready: "critical",
  needs_review: "warning",
  mostly_ready: "urgent",
  ready: "success"
};

export function ReadinessScoreCard({ score }: { score: RenewalReadinessScore }) {
  const trustGateBlocked = score.blockers.includes("Trusted reminder gate is blocked.");

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
            Renewal readiness
          </p>
          <p className="mt-2 text-3xl font-semibold text-ink">{score.score}</p>
        </div>
        <Badge tone={READINESS_TONES[score.label]}>{READINESS_LABELS[score.label]}</Badge>
      </div>
      <p className="mt-3 text-sm text-slate-600">
        {trustGateBlocked
          ? "The renewal loop may be partly complete, but it is not trusted until the reminder gate is unblocked."
          : score.nextAction}
      </p>
      <div className="mt-4 h-2 rounded-full bg-slate-100">
        <div
          className="h-2 rounded-full bg-primary"
          style={{ width: `${score.score}%` }}
        />
      </div>
      {score.blockers.length ? (
        <ul className="mt-4 space-y-2 text-sm text-slate-600">
          {score.blockers.slice(0, 3).map((blocker) => (
            <li key={blocker}>- {blocker}</li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 text-sm text-success">Core renewal controls are ready.</p>
      )}
    </div>
  );
}
