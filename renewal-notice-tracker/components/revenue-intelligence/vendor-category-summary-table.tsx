import type { VendorCategoryIntelligenceSummary } from "@/lib/revenue-intelligence/revenue-types";
import { Badge } from "@/components/ui/badge";

function money(value: number) {
  return `$${Math.round(value).toLocaleString("en-US")}`;
}

export function VendorCategorySummaryTable({ rows }: { rows: VendorCategoryIntelligenceSummary[] }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-ink">Vendor and category exposure</h2>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="text-xs uppercase tracking-[0.14em] text-slate-500">
            <tr><th className="py-2">Name</th><th>Type</th><th>Contracts</th><th>Exposure</th><th>Risk</th></tr>
          </thead>
          <tbody>
            {rows.slice(0, 10).map((row) => (
              <tr key={row.id} className="border-t border-slate-100">
                <td className="py-2 font-medium text-ink">{row.vendor_name ?? row.category_name ?? "Unknown"}</td>
                <td>{row.summary_type}</td>
                <td>{row.contract_count}</td>
                <td>{money(row.renewal_value)}</td>
                <td><Badge tone={row.severity === "critical" ? "critical" : row.severity === "high" ? "urgent" : row.severity === "medium" ? "warning" : "safe"}>{row.severity}</Badge></td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length ? <p className="py-3 text-sm text-muted">No concentration summaries yet.</p> : null}
      </div>
    </div>
  );
}
