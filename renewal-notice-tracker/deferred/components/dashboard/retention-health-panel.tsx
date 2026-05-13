import Link from "next/link";
import type { AccountHealthSummary } from "@/lib/commercial/retention";
import { retentionLoops } from "@/lib/commercial/retention";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export function DeferredRetentionHealthPanel({ health }: { health: AccountHealthSummary }) {
  return (
    <div className="grid gap-5 xl:grid-cols-[0.95fr_1.05fr]">
      <div className="panel p-6">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-lg font-semibold">Account health</h2>
          <Badge
            tone={
              health.status === "healthy"
                ? "success"
                : health.status === "watch"
                  ? "warning"
                  : "danger"
            }
          >
            {health.status.replaceAll("_", " ")}
          </Badge>
        </div>
        <p className="mt-2 text-sm text-slate-500">{health.summary}</p>
        <p className="mt-4 text-4xl font-semibold text-ink">{health.score}</p>
        <p className="text-xs uppercase tracking-wide text-slate-400">Retention score</p>

        <div className="mt-5 space-y-4">
          <div>
            <p className="text-sm font-semibold text-ink">Healthy signals</p>
            <div className="mt-2 space-y-2 text-sm text-slate-600">
              {health.healthySignals.length > 0 ? (
                health.healthySignals.map((signal) => (
                  <div key={signal} className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
                    {signal}
                  </div>
                ))
              ) : (
                <div className="rounded-xl border border-slate-200 p-3">No healthy signals yet.</div>
              )}
            </div>
          </div>

          <div>
            <p className="text-sm font-semibold text-ink">Churn signals</p>
            <div className="mt-2 space-y-2 text-sm text-slate-600">
              {health.churnSignals.length > 0 ? (
                health.churnSignals.map((signal) => (
                  <div key={signal} className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                    {signal}
                  </div>
                ))
              ) : (
                <div className="rounded-xl border border-slate-200 p-3">No active churn signals.</div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-5">
        <div className="panel p-6">
          <h2 className="text-lg font-semibold">Retention loops</h2>
          <p className="mt-2 text-sm text-slate-500">
            Durable retention comes from recurring review, owner accountability, and reporting
            habits tied to real deadlines.
          </p>
          <div className="mt-4 space-y-4">
            {[...retentionLoops.reminderDriven, ...retentionLoops.ownershipAccountability, ...retentionLoops.reporting].map(
              (loop) => (
                <div key={loop.name} className="rounded-xl border border-slate-200 p-4">
                  <p className="text-sm font-semibold text-ink">{loop.name}</p>
                  <p className="mt-2 text-sm text-slate-600">{loop.description}</p>
                  <p className="mt-2 text-xs uppercase tracking-wide text-slate-400">
                    Trigger: {loop.trigger}
                  </p>
                </div>
              )
            )}
          </div>
        </div>

        {health.recommendedActions.length > 0 ? (
          <div className="panel p-6">
            <h2 className="text-lg font-semibold">Anti-churn interventions</h2>
            <div className="mt-4 space-y-4">
              {health.recommendedActions.map((action) => (
                <div key={action.title} className="rounded-xl border border-slate-200 p-4">
                  <p className="text-sm font-semibold text-ink">{action.title}</p>
                  <p className="mt-2 text-sm text-slate-600">{action.description}</p>
                  <Button asChild className="mt-4" variant="secondary">
                    <Link href={action.href}>Take action</Link>
                  </Button>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
