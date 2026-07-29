import { markExecutiveInsightReviewedFormAction } from "@/lib/actions/revenue-intelligence";
import type { ExecutiveInsight } from "@/lib/revenue-intelligence/revenue-types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ServerActionForm } from "@/components/ui/server-action-form";

export function ExecutiveInsightsPanel({ insights, canAct }: { insights: ExecutiveInsight[]; canAct: boolean }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-ink">Executive insights</h2>
      <div className="mt-4 space-y-3">
        {insights.length ? insights.map((insight) => (
          <div key={insight.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <Badge tone={insight.severity === "critical" ? "critical" : insight.severity === "high" ? "urgent" : insight.severity === "medium" ? "warning" : "safe"}>{insight.severity}</Badge>
                <p className="mt-2 text-sm font-semibold text-ink">{insight.title}</p>
                <p className="mt-1 text-sm text-muted">{insight.summary}</p>
                <p className="mt-1 text-xs text-slate-600">Action: {insight.recommended_action}</p>
              </div>
              {canAct && !insight.reviewed ? (
                <ServerActionForm serverAction={markExecutiveInsightReviewedFormAction.bind(null, insight.id)}>
                  <Button type="submit" variant="secondary">Mark reviewed</Button>
                </ServerActionForm>
              ) : null}
            </div>
          </div>
        )) : <p className="text-sm text-muted">No executive insights yet.</p>}
      </div>
    </div>
  );
}
