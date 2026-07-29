import type { RevenueOpportunityItem } from "@/lib/revenue-intelligence/revenue-types";

function money(value: number) {
  return `$${Math.round(value).toLocaleString("en-US")}`;
}

export function SavingsPipelinePanel({
  opportunities,
  type = "savings",
  title = "Savings pipeline",
  emptyCopy = "No savings pipeline metrics yet."
}: {
  opportunities: RevenueOpportunityItem[];
  type?: RevenueOpportunityItem["type"];
  title?: string;
  emptyCopy?: string;
}) {
  const rows = opportunities.filter((item) => item.type === type);
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-ink">{title}</h2>
      <ul className="mt-3 space-y-2 text-sm text-slate-600">
        {rows.length ? rows.slice(0, 8).map((row) => (
          <li key={row.id} className="flex justify-between gap-3 rounded-xl bg-slate-50 p-3">
            <span>{row.title}</span><span className="font-semibold text-ink">{money(row.amount)}</span>
          </li>
        )) : <li>{emptyCopy}</li>}
      </ul>
    </div>
  );
}
