import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export type OperationalPriorityItem = {
  label: string;
  count: number;
  description: string;
  href: string;
  tone: "danger" | "warning" | "success";
};

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
            <h2 className="text-lg font-semibold">Needs action now</h2>
            <Badge tone="warning">Operational</Badge>
          </div>
          <p className="mt-2 max-w-3xl text-sm text-slate-500">{firstValueSummary}</p>
        </div>
        <Button asChild variant="secondary">
          <Link href="/dashboard/contracts/new">Upload one contract</Link>
        </Button>
      </div>
      <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {items.map((item) => (
          <div key={item.label} className="rounded-2xl border border-slate-200 p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold text-ink">{item.label}</p>
              <Badge tone={item.tone}>{item.count}</Badge>
            </div>
            <p className="mt-3 text-sm text-slate-500">{item.description}</p>
            <Button asChild className="mt-4" variant="ghost">
              <Link href={item.href}>Work this queue</Link>
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
