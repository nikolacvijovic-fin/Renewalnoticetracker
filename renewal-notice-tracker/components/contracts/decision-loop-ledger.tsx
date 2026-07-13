import { Badge } from "@/components/ui/badge";
import {
  getDecisionLoopStageLabel,
  RENEWAL_DECISION_LOOP_STAGES,
  type RenewalDecisionLoop,
  type RenewalDecisionLoopStage
} from "@/lib/contracts/decision-loop";

export function DecisionLoopLedger({ loop }: { loop: RenewalDecisionLoop }) {
  const completed = new Set(loop.completedStages);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
            Decision loop
          </p>
          <p className="mt-2 text-lg font-semibold text-ink">
            {getDecisionLoopStageLabel(loop.stage)}
          </p>
        </div>
        <Badge tone={loop.stage === "cycle_closed" ? "success" : "automation"}>
          CFO clock
        </Badge>
      </div>
      <p className="mt-3 text-sm text-slate-600">{loop.nextAction}</p>
      <ol className="mt-4 space-y-2">
        {RENEWAL_DECISION_LOOP_STAGES.map((stage) => (
          <DecisionLoopItem
            key={stage}
            stage={stage}
            current={stage === loop.stage}
            complete={completed.has(stage)}
          />
        ))}
      </ol>
    </div>
  );
}

function DecisionLoopItem({
  stage,
  current,
  complete
}: {
  stage: RenewalDecisionLoopStage;
  current: boolean;
  complete: boolean;
}) {
  return (
    <li className="flex items-center justify-between gap-3 text-sm">
      <span className={current ? "font-semibold text-ink" : "text-slate-600"}>
        {getDecisionLoopStageLabel(stage)}
      </span>
      <span
        className={
          complete
            ? "text-success"
            : current
              ? "text-primary"
              : "text-slate-400"
        }
      >
        {complete ? "Done" : current ? "Now" : "Next"}
      </span>
    </li>
  );
}
