import Link from "next/link";
import type { ActivationStatus } from "@/lib/commercial/activation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export type OnboardingChecklistDisplayItem = {
  key: string;
  label: string;
  description: string;
  completed: boolean;
  href: string;
};

export function OnboardingChecklist({
  items,
  firstValueMilestone,
  activationStatus,
  activationWindowLabel
}: {
  items: OnboardingChecklistDisplayItem[];
  firstValueMilestone: string;
  activationStatus: ActivationStatus;
  activationWindowLabel: string;
}) {
  const completedCount = items.filter((item) => item.completed).length;

  return (
    <div className="panel p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold">Get to first value</h2>
            <Badge tone={completedCount === items.length ? "success" : "warning"}>
              {completedCount}/{items.length} complete
            </Badge>
            <Badge
              tone={
                activationStatus.activationWindowState === "missed"
                  ? "danger"
                  : activationStatus.activationWindowState === "at_risk"
                    ? "warning"
                    : "default"
              }
            >
              {activationWindowLabel}
            </Badge>
          </div>
          <p className="mt-2 max-w-2xl text-sm text-slate-500">{firstValueMilestone}</p>
          {activationStatus.rescueSignals.length > 0 ? (
            <ul className="mt-3 space-y-1 text-sm text-amber-700">
              {activationStatus.rescueSignals.map((signal) => (
                <li key={signal}>- {signal}</li>
              ))}
            </ul>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="secondary">
            <Link href="/dashboard/contracts/new">Add contract</Link>
          </Button>
          <Button asChild variant="ghost">
            <Link href="/services">Need import or setup help?</Link>
          </Button>
        </div>
      </div>
      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        {items.map((item) => (
          <div key={item.key} className="rounded-2xl border border-slate-200 p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold text-ink">{item.label}</p>
              <Badge tone={item.completed ? "success" : "default"}>
                {item.completed ? "Done" : "Next"}
              </Badge>
            </div>
            <p className="mt-2 text-sm text-slate-500">{item.description}</p>
            <Button asChild className="mt-4" variant={item.completed ? "ghost" : "secondary"}>
              <Link href={item.href}>{item.completed ? "Review step" : "Complete step"}</Link>
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
