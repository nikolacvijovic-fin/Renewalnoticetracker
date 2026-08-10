"use client";

import { useState, useTransition } from "react";
import { recordRenewalManualTemplateCopyAction } from "@/lib/actions/contracts";
import {
  RENEWAL_MANUAL_TEMPLATE_TONES,
  buildRenewalManualActionTemplate,
  type RenewalManualTemplateInput,
  type RenewalManualTemplateTone,
  type RenewalManualTemplateType
} from "@/lib/contracts/renewal-action-templates";
import {
  evaluateRenewalManualTemplateGate,
  getAllowedRenewalManualTemplateTypes,
  getPreferredRenewalManualTemplateType
} from "@/lib/contracts/manual-template-gates";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

type ManualRenewalTemplatePanelProps = {
  contractId: string;
  initialInput: Omit<RenewalManualTemplateInput, "templateType" | "tone">;
  renewalDecisionStatus?: string | null;
};

function templateLabel(type: RenewalManualTemplateType) {
  return type === "cancellation_notice" ? "cancellation notice" : "renegotiation request";
}

export function ManualRenewalTemplatePanel({
  contractId,
  initialInput,
  renewalDecisionStatus
}: ManualRenewalTemplatePanelProps) {
  const allowedTemplateTypes = getAllowedRenewalManualTemplateTypes(renewalDecisionStatus);
  const [templateType, setTemplateType] = useState<RenewalManualTemplateType>(
    getPreferredRenewalManualTemplateType(renewalDecisionStatus) ?? "cancellation_notice"
  );
  const [tone, setTone] = useState<RenewalManualTemplateTone>("standard");
  const [copied, setCopied] = useState<RenewalManualTemplateType | null>(null);
  const [copyError, setCopyError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const activeType = allowedTemplateTypes.includes(templateType)
    ? templateType
    : allowedTemplateTypes[0] ?? templateType;
  const template = buildRenewalManualActionTemplate({
    ...initialInput,
    templateType: activeType,
    tone
  });
  const [subject, setSubject] = useState(template.subject);
  const [body, setBody] = useState(template.body);

  function regenerate(nextType: RenewalManualTemplateType, nextTone: RenewalManualTemplateTone) {
    const nextTemplate = buildRenewalManualActionTemplate({
      ...initialInput,
      templateType: nextType,
      tone: nextTone
    });
    setSubject(nextTemplate.subject);
    setBody(nextTemplate.body);
    setCopied(null);
    setCopyError(null);
  }

  async function copyTemplate(type: RenewalManualTemplateType) {
    setCopyError(null);
    const gate = evaluateRenewalManualTemplateGate({
      templateType: type,
      renewalDecisionStatus
    });
    if (!gate.allowed) {
      setCopyError(gate.customerSafeMessage);
      return;
    }

    const content = `Subject: ${subject}\n\n${body}`;
    try {
      await navigator.clipboard.writeText(content);
      startTransition(() => {
        void recordRenewalManualTemplateCopyAction(contractId, type)
          .then(() => setCopied(type))
          .catch(() => {
            setCopyError("Copied locally, but NoticeControl could not record the audit event.");
          });
      });
    } catch {
      setCopyError("Clipboard copy failed. Select the text and copy it manually.");
    }
  }

  if (allowedTemplateTypes.length === 0) {
    return (
      <section className="panel space-y-4 p-6" aria-label="Manual cancellation and renegotiation templates">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold">Manual action templates</h3>
            <p className="mt-1 text-sm text-slate-600">
              Record a terminate or renegotiate decision before copying a vendor-facing template.
            </p>
          </div>
          <Badge tone="default">Decision required</Badge>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
          NoticeControl does not send vendor messages. Once a compatible renewal decision exists, you can copy the
          matching template manually from this panel.
        </div>
      </section>
    );
  }

  return (
    <section className="panel space-y-4 p-6" aria-label="Manual cancellation and renegotiation templates">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold">Manual action templates</h3>
          <p className="mt-1 text-sm text-slate-600">
            Copy a short vendor message after you decide to cancel or renegotiate. NoticeControl does not send this
            to the vendor.
          </p>
        </div>
        <Badge tone="warning">Manual copy only</Badge>
      </div>

      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
        {template.boundaryNotice}
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <label className="block text-sm font-medium text-slate-700">
          Template
          <select
            value={activeType}
            onChange={(event) => {
              const nextType = event.target.value as RenewalManualTemplateType;
              setTemplateType(nextType);
              regenerate(nextType, tone);
            }}
            className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm"
          >
            {allowedTemplateTypes.map((option) => (
              <option key={option} value={option}>
                {option === "cancellation_notice" ? "Cancellation notice" : "Renegotiation request"}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm font-medium text-slate-700">
          Tone
          <select
            value={tone}
            onChange={(event) => {
              const nextTone = event.target.value as RenewalManualTemplateTone;
              setTone(nextTone);
              regenerate(activeType, nextTone);
            }}
            className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm"
          >
            {RENEWAL_MANUAL_TEMPLATE_TONES.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="block text-sm font-medium text-slate-700">
        Subject
        <input
          value={subject}
          onChange={(event) => setSubject(event.target.value)}
          className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm"
        />
      </label>

      <label className="block text-sm font-medium text-slate-700">
        Editable template
        <textarea
          value={body}
          onChange={(event) => setBody(event.target.value)}
          rows={12}
          className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm"
        />
      </label>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" onClick={() => copyTemplate(activeType)} disabled={isPending}>
          Copy {templateLabel(activeType)}
        </Button>
        {allowedTemplateTypes.length > 1 ? (
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              const alternateType =
                activeType === "cancellation_notice" ? "renegotiation_request" : "cancellation_notice";
              if (!allowedTemplateTypes.includes(alternateType)) return;
              setTemplateType(alternateType);
              regenerate(alternateType, tone);
            }}
          >
            Switch template
          </Button>
        ) : null}
        {copied ? <span className="text-sm font-medium text-success">Copied {templateLabel(copied)}.</span> : null}
      </div>

      {copyError ? <p className="text-sm text-critical">{copyError}</p> : null}
      <p className="text-xs text-slate-500">
        Copying this template does not mark notice as sent and does not contact the vendor.
      </p>
    </section>
  );
}
