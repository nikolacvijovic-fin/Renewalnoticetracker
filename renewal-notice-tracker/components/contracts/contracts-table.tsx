import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { getPhase1TrustState } from "@/lib/contracts/phase1-pilot";
import {
  buildRiskQueueRow,
  createRiskWorkflowSubjectFromDashboardContract,
  getRiskConfidenceLabel
} from "@/lib/intelligence/risk/dashboard";
import { RiskExplanationDrawer } from "@/components/contracts/risk-explanation-drawer";
import { RiskBadge } from "@/components/contracts/risk-badge";
import { formatDate } from "@/lib/utils";

type ContractRow = {
  id: string;
  status: string;
  created_at: string;
  contract_metadata: {
    contract_title: string | null;
    counterparty_name: string | null;
    renewal_date?: string | null;
    expiration_date: string | null;
    notice_deadline_date: string | null;
    auto_renewal: boolean | null;
    needs_review: boolean;
  } | null;
  department?: string | null;
  owner_user_id?: string | null;
  owner_name?: string | null;
  status_tag?: string | null;
  renewal_decision_status?: string | null;
  cycle_status?: string | null;
};

type RiskViewer = {
  userId: string;
  role: "admin" | "operator" | "reviewer" | "owner";
  showRiskBadge: boolean;
  showRiskExplanation: boolean;
};

export function ContractsTable({
  contracts,
  riskViewer
}: {
  contracts: ContractRow[];
  riskViewer?: RiskViewer | null;
}) {
  return (
    <div className="panel overflow-hidden">
      <table className="min-w-full divide-y divide-slate-200 text-sm">
        <thead className="bg-slate-50">
          <tr>
            <th className="px-4 py-3 text-left font-medium text-slate-500">Contract</th>
            <th className="px-4 py-3 text-left font-medium text-slate-500">Counterparty</th>
            <th className="px-4 py-3 text-left font-medium text-slate-500">Owner</th>
            <th className="px-4 py-3 text-left font-medium text-slate-500">Department</th>
            <th className="px-4 py-3 text-left font-medium text-slate-500">Expiration</th>
            <th className="px-4 py-3 text-left font-medium text-slate-500">Notice Deadline</th>
            <th className="px-4 py-3 text-left font-medium text-slate-500">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {contracts.map((contract) => (
            <tr key={contract.id} className="bg-white">
              <td className="px-4 py-4">
                <Link href={`/dashboard/contracts/${contract.id}`} className="font-medium text-brand-800">
                  {contract.contract_metadata?.contract_title ?? "Untitled contract"}
                </Link>
              </td>
              <td className="px-4 py-4 text-slate-600">
                {contract.contract_metadata?.counterparty_name ?? "Not set"}
              </td>
              <td className="px-4 py-4 text-slate-600">{contract.owner_name ?? "Unassigned"}</td>
              <td className="px-4 py-4 text-slate-600">{contract.department ?? "Not set"}</td>
              <td className="px-4 py-4 text-slate-600">
                {formatDate(contract.contract_metadata?.expiration_date)}
              </td>
              <td className="px-4 py-4 text-slate-600">
                {formatDate(contract.contract_metadata?.notice_deadline_date)}
              </td>
              <td className="px-4 py-4">
                {(() => {
                  const canSeeRiskForContract =
                    Boolean(riskViewer?.showRiskBadge) &&
                    (riskViewer?.role !== "owner" || contract.owner_user_id === riskViewer.userId);

                  if (!canSeeRiskForContract) {
                    return (
                      <div className="flex flex-wrap gap-2">
                        <Badge
                          tone={
                            contract.contract_metadata?.needs_review || !contract.owner_name || contract.owner_name === "Unassigned"
                              ? "warning"
                              : "success"
                          }
                        >
                          {getPhase1TrustState({
                            owner_user_id:
                              contract.owner_name && contract.owner_name !== "Unassigned" ? "assigned" : null,
                            renewal_decision_status: contract.renewal_decision_status ?? "undecided",
                            cycle_status: contract.cycle_status ?? "open",
                            contract_metadata: contract.contract_metadata
                          })}
                        </Badge>
                        {contract.status_tag ? <Badge>{contract.status_tag.replace("_", " ")}</Badge> : null}
                        {contract.contract_metadata?.auto_renewal ? <Badge>Auto-renewal</Badge> : null}
                      </div>
                    );
                  }

                  const risk = buildRiskQueueRow(
                    createRiskWorkflowSubjectFromDashboardContract({
                      ...contract,
                      status_tag: contract.status_tag ?? null,
                      owner_name: contract.owner_name ?? undefined
                    })
                  );

                  return (
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge
                          tone={
                            contract.contract_metadata?.needs_review || !contract.owner_name || contract.owner_name === "Unassigned"
                              ? "warning"
                              : "success"
                          }
                        >
                          {getPhase1TrustState({
                            owner_user_id:
                              contract.owner_name && contract.owner_name !== "Unassigned" ? "assigned" : null,
                            renewal_decision_status: contract.renewal_decision_status ?? "undecided",
                            cycle_status: contract.cycle_status ?? "open",
                            contract_metadata: contract.contract_metadata
                          })}
                        </Badge>
                        {riskViewer?.showRiskExplanation ? (
                          <>
                            <RiskExplanationDrawer explanation={risk} />
                            <span className="text-xs text-slate-500">
                              {getRiskConfidenceLabel(risk.confidenceLevel)}
                            </span>
                          </>
                        ) : (
                          <RiskBadge riskBand={risk.riskBand} />
                        )}
                        {contract.status_tag ? <Badge>{contract.status_tag.replace("_", " ")}</Badge> : null}
                        {contract.contract_metadata?.auto_renewal ? <Badge>Auto-renewal</Badge> : null}
                      </div>
                      {riskViewer?.showRiskExplanation ? (
                        <p className="text-xs text-slate-500">{risk.reasons[0]?.detail ?? "No active risk reasons."}</p>
                      ) : null}
                    </div>
                  );
                })()}
              </td>
            </tr>
          ))}
          {contracts.length === 0 ? (
            <tr>
              <td colSpan={7} className="px-4 py-10 text-center text-slate-500">
                No contracts match the current filter.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}
