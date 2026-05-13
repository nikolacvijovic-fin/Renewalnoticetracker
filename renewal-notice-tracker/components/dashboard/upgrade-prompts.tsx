import Link from "next/link";
import type { UpgradePrompt } from "@/lib/commercial/conversion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export function UpgradePrompts({
  prompts,
  firstPaidValueMilestone
}: {
  prompts: UpgradePrompt[];
  firstPaidValueMilestone: string;
}) {
  if (prompts.length === 0) return null;

  return (
    <div className="panel p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold">Upgrade when coverage expands</h2>
            <Badge tone="warning">High intent</Badge>
          </div>
          <p className="mt-2 max-w-2xl text-sm text-slate-500">{firstPaidValueMilestone}</p>
        </div>
      </div>
      <div className="mt-5 grid gap-4 xl:grid-cols-3">
        {prompts.map((prompt) => (
          <div key={prompt.title} className="rounded-2xl border border-slate-200 p-4">
            <p className="text-sm font-semibold text-ink">{prompt.title}</p>
            <p className="mt-2 text-sm text-slate-500">{prompt.message}</p>
            <Button
              asChild
              className="mt-4"
              variant={prompt.tone === "primary" ? "primary" : "secondary"}
            >
              <Link href={prompt.href}>{prompt.label}</Link>
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
