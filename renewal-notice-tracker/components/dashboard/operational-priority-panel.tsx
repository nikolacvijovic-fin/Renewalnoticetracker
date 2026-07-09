import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export type OperationalPriorityItem = {
  label: string;
  count: number;
  description: string;
  href: string;
  tone: "critical" | "urgent" | "warning" | "safe";
};

const TONE_STYLES = {
  critical: {
    badge: "bg-critical/10 text-critical",
    border: "border-critical/20 bg-critical/[0.03]"
  },
  urgent: {
    badge: "bg-urgent/10 text-urgent",
    border: "border-urgent/20 bg-urgent/[0.03]"
  },
  warning: {
    badge: "bg-warning/15 text-amber-800",
    border: "border-warning/25 bg-warning/[0.04]"
  },
  safe: {
    badge: "bg-success/10 text-success",
    border: "border-success/20 bg-success/[0.03]"
  }
} as const;

export function OperationalPriorityPanel({
  items,
  firstValueSummary
}: {
  items: OperationalPriorityItem[];
  firstValueSummary: string;
}) {
  return (
    <div className="panel p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold">CFO risk queue</h2>
            <Badge tone="urgent">Opt-out clock</Badge>
          </div>
          <p className="mt-2 max-w-3xl text-sm text-muted">{firstValueSummary}</p>
        </div>
        <Button asChild variant="secondary">
          <Link href="/dashboard/contracts/new">Add one renewal</Link>
        </Button>
      </div>
      <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {items.map((item) => {
          const tone = TONE_STYLES[item.tone];
          return (
            <div key={item.label} className={`rounded-2xl border p-4 ${tone.border}`}>
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-ink">{item.label}</p>
                <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${tone.badge}`}>
                  {item.count}
                </span>
              </div>
              <p className="mt-3 text-sm text-muted">{item.description}</p>
              <Button asChild className="mt-4" variant="ghost">
                <Link href={item.href}>Defend this risk</Link>
              </Button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
