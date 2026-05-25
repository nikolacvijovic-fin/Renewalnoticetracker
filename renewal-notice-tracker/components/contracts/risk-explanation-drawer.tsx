"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { RiskBadge } from "@/components/contracts/risk-badge";
import {
  getRiskConfidenceLabel,
  type RiskExplanationModel
} from "@/lib/intelligence/risk/dashboard";
import type { RiskExplanationAuditSurface } from "@/lib/intelligence/audit";
import { cn, formatDate } from "@/lib/utils";

export function RiskExplanationDrawer({
  explanation,
  triggerStyle = "badge",
  auditSurface = "contract_detail"
}: {
  explanation: RiskExplanationModel;
  triggerStyle?: "badge" | "button";
  auditSurface?: RiskExplanationAuditSurface;
}) {
  const [open, setOpen] = useState(false);
  const hasLoggedViewRef = useRef(false);

  const handleOpen = () => {
    setOpen(true);

    if (hasLoggedViewRef.current) {
      return;
    }

    hasLoggedViewRef.current = true;
    void fetch(`/api/intelligence/risk/contracts/${explanation.contractId}/explanation-view`, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        sourceSurface: auditSurface,
        riskBand: explanation.riskBand,
        confidenceLevel: explanation.confidenceLevel,
        reasonCount: explanation.reasons.length,
        warningCount: explanation.missingDataWarnings.length,
        calculationVersion: explanation.explanationMetadata.calculation_version,
        inputDataVersion: explanation.explanationMetadata.input_data_version
      })
    })
      .then((response) => {
        if (!response.ok) {
          hasLoggedViewRef.current = false;
        }
      })
      .catch(() => {
        hasLoggedViewRef.current = false;
      });
  };

  return (
    <>
      <button
        type="button"
        onClick={handleOpen}
        className={cn(
          triggerStyle === "badge"
            ? "inline-flex rounded-full focus:outline-none focus:ring-2 focus:ring-brand-300 focus:ring-offset-2"
            : "rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-brand-300 focus:ring-offset-2"
        )}
        aria-label={`Show risk details for ${explanation.contractTitle}`}
      >
        {triggerStyle === "badge" ? (
          <RiskBadge riskBand={explanation.riskBand} />
        ) : (
          <span>Explain risk</span>
        )}
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/30">
          <div
            role="dialog"
            aria-modal="true"
            aria-label={`${explanation.contractTitle} risk explanation`}
            className="flex h-full w-full max-w-xl flex-col bg-white shadow-2xl"
          >
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-6 py-5">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <RiskBadge riskBand={explanation.riskBand} />
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                    {getRiskConfidenceLabel(explanation.confidenceLevel)}
                  </span>
                </div>
                <h2 className="mt-3 text-xl font-semibold text-slate-900">
                  {explanation.contractTitle}
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  {explanation.counterpartyName} | {explanation.ownerLabel} | {explanation.department}
                </p>
              </div>
              <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
                Close
              </Button>
            </div>

            <div className="flex-1 space-y-6 overflow-y-auto px-6 py-5">
              <section className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <h3 className="text-sm font-semibold text-slate-900">Workflow guidance</h3>
                <p className="mt-2 text-sm text-slate-600">{explanation.guidance}</p>
                <p className="mt-2 text-xs text-slate-500">
                  Trust state: {explanation.workflowTrustState}. Due anchor:{" "}
                  {explanation.dueDate
                    ? `${explanation.dueLabel} on ${formatDate(explanation.dueDate)}`
                    : explanation.dueLabel}
                  .
                </p>
              </section>

              <section>
                <h3 className="text-sm font-semibold text-slate-900">Why this contract is in the queue</h3>
                <ul className="mt-3 space-y-2">
                  {explanation.reasons.map((reason) => (
                    <li key={`${explanation.contractId}-${reason.factor}`} className="rounded-2xl border border-slate-200 p-3">
                      <div className="flex items-center justify-between gap-3">
                        <p className="font-medium text-slate-900">{reason.label}</p>
                        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Signal
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-slate-600">{reason.detail}</p>
                    </li>
                  ))}
                </ul>
              </section>

              <section>
                <h3 className="text-sm font-semibold text-slate-900">Missing-data warnings</h3>
                {explanation.missingDataWarnings.length > 0 ? (
                  <ul className="mt-3 space-y-2">
                    {explanation.missingDataWarnings.map((warning) => (
                      <li
                        key={`${explanation.contractId}-${warning.code}`}
                        className="rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900"
                      >
                        {warning.message}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-sm text-slate-600">No missing-data warnings are active.</p>
                )}
              </section>

              <section>
                <h3 className="text-sm font-semibold text-slate-900">Workflow actions</h3>
                <div className="mt-3 flex flex-wrap gap-2">
                  {explanation.actionLinks.map((action) => (
                    <Button asChild key={`${explanation.contractId}-${action.label}`} variant="secondary">
                      <Link href={action.href}>{action.label}</Link>
                    </Button>
                  ))}
                </div>
              </section>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
