import Link from "next/link";
import type { RiskQueueRow } from "@/lib/intelligence/risk/dashboard";
import { getRiskConfidenceLabel } from "@/lib/intelligence/risk/dashboard";
import { RiskExplanationDrawer } from "@/components/contracts/risk-explanation-drawer";
import { formatDate } from "@/lib/utils";

export function RiskQueueTable({ rows }: { rows: RiskQueueRow[] }) {
  return (
    <div className="panel overflow-hidden">
      <table className="min-w-full divide-y divide-slate-200 text-sm">
        <thead className="bg-slatepaper">
          <tr>
            <th className="px-4 py-3 text-left font-medium text-slate-500">Contract</th>
            <th className="px-4 py-3 text-left font-medium text-slate-500">Risk</th>
            <th className="px-4 py-3 text-left font-medium text-slate-500">Confidence</th>
            <th className="px-4 py-3 text-left font-medium text-slate-500">Missing data</th>
            <th className="px-4 py-3 text-left font-medium text-slate-500">Next action</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((row) => (
            <tr key={row.contractId} className="bg-white align-top transition hover:bg-slate-50/70">
              <td className="px-4 py-4">
                <Link href={`/dashboard/contracts/${row.contractId}`} className="font-medium text-brand-700 hover:text-brand-800">
                  {row.contractTitle}
                </Link>
                <p className="mt-1 text-sm text-slate-600">{row.counterpartyName}</p>
                <p className="mt-1 text-xs text-slate-500">
                  {row.ownerLabel} | {row.department}
                  {row.dueDate ? ` | ${row.dueLabel}: ${formatDate(row.dueDate)}` : ""}
                </p>
              </td>
              <td className="px-4 py-4">
                <div className="flex items-start gap-3">
                  <RiskExplanationDrawer explanation={row} auditSurface="risk_queue" />
                  <div className="space-y-1">
                    {row.reasons.slice(0, 2).map((reason) => (
                      <p key={`${row.contractId}-${reason.factor}`} className="text-sm text-slate-600">
                        {reason.detail}
                      </p>
                    ))}
                  </div>
                </div>
              </td>
              <td className="px-4 py-4">
                <p className="font-medium text-slate-900">{getRiskConfidenceLabel(row.confidenceLevel)}</p>
                <p className="mt-1 text-xs text-slate-500">Trust state: {row.workflowTrustState}</p>
              </td>
              <td className="px-4 py-4">
                {row.missingDataWarnings.length > 0 ? (
                  <ul className="space-y-1 text-sm text-amber-800">
                    {row.missingDataWarnings.slice(0, 2).map((warning) => (
                      <li key={`${row.contractId}-${warning.code}`}>{warning.message}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-slate-500">No active warnings</p>
                )}
              </td>
              <td className="px-4 py-4">
                <div className="flex flex-wrap gap-2">
                  {row.actionLinks.slice(0, 2).map((action) => (
                    <Link
                      key={`${row.contractId}-${action.label}`}
                      href={action.href}
                      className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                    >
                      {action.label}
                    </Link>
                  ))}
                </div>
              </td>
            </tr>
          ))}
          {rows.length === 0 ? (
            <tr>
              <td colSpan={5} className="px-4 py-10 text-center text-slate-500">
                No contracts are currently in the risk queue.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}
