import type { ReactNode } from "react";

export function ContractDetailShell({
  title,
  subtitle,
  supportingLine,
  badges,
  primaryAction,
  statusStrip,
  reviewPanel,
  ownerReminderPanel,
  decisionCyclePanel,
  secondaryPanel
}: {
  title: string;
  subtitle: string;
  supportingLine?: string;
  badges?: ReactNode;
  primaryAction?: ReactNode;
  statusStrip: ReactNode;
  reviewPanel: ReactNode;
  ownerReminderPanel: ReactNode;
  decisionCyclePanel: ReactNode;
  secondaryPanel: ReactNode;
}) {
  return (
    <section className="space-y-6">
      <div className="panel p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold">{title}</h1>
            <p className="mt-2 text-slate-500">{subtitle}</p>
            {supportingLine ? <p className="mt-1 text-sm text-slate-500">{supportingLine}</p> : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {primaryAction}
            {badges}
          </div>
        </div>
      </div>

      <section id="top-status-strip" aria-label="Top status and action strip">
        {statusStrip}
      </section>
      <section id="review-panel" aria-label="P0 review panel">
        {reviewPanel}
      </section>
      <section id="owner-reminder-panel" aria-label="Owner and reminder panel">
        {ownerReminderPanel}
      </section>
      <section id="decision-cycle-panel" aria-label="Decision and cycle panel">
        {decisionCyclePanel}
      </section>
      <div aria-label="Secondary detail panels">{secondaryPanel}</div>
    </section>
  );
}
