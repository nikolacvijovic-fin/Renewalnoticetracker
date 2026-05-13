import Link from "next/link";
import {
  createContractAction,
  createManualContractAction,
  importContractsAction
} from "@/lib/actions/contracts";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ServerActionForm } from "@/components/ui/server-action-form";
import type {
  ContractTrackingLimitResult,
  CommercialAccessResult,
  CommercialCapabilitySummaryItem
} from "@/lib/billing/entitlements";

type MemberOption = {
  user_id: string;
  label: string;
};

export function UploadContractForm({
  commercial,
  members,
  latestImportJob
}: {
  commercial: {
    contractTrackingAccess: ContractTrackingLimitResult;
    manualContractsAccess: CommercialAccessResult;
    multiRecipientAccess: CommercialAccessResult;
    capabilitySummary: CommercialCapabilitySummaryItem[];
    maxReminderRecipients: number | null;
    recipientPlaceholder: string;
  };
  members: MemberOption[];
  latestImportJob?: {
    id: string;
    file_name: string;
    status: string;
    row_count: number;
    imported_count: number;
    error_count: number;
  } | null;
}) {
  const manualEntryAllowed =
    commercial.contractTrackingAccess.allowed && commercial.manualContractsAccess.allowed;

  return (
    <div className="space-y-6">
      <div className="panel space-y-4 p-6">
        <h2 className="text-lg font-semibold">First-value path</h2>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {[
            "1. Upload one contract",
            "2. Review the essential dates",
            "3. Assign one owner",
            "4. See one live obligation"
          ].map((step) => (
            <div key={step} className="rounded-2xl border border-slate-200 p-4 text-sm text-slate-600">
              {step}
            </div>
          ))}
        </div>
        <div className="rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-900">
          Use bulk import only with the fixed template. If your spreadsheet is messy, use the fixed-scope import package instead of brute-forcing activation.
        </div>
      </div>
      <div className="panel space-y-3 p-6">
        <div>
          <h2 className="text-lg font-semibold">Tracked contract capacity</h2>
          <p className="mt-1 text-sm text-slate-500">{commercial.contractTrackingAccess.message}</p>
        </div>
        {!commercial.contractTrackingAccess.allowed ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            Add capacity before uploading more contracts or importing a spreadsheet.
          </div>
        ) : null}
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <ServerActionForm serverAction={createContractAction} className="panel space-y-4 p-6">
          <div>
            <h2 className="text-lg font-semibold">Primary path: upload one contract</h2>
            <p className="mt-1 text-sm text-slate-500">
              The fastest route to value is upload, review, owner assignment, and one visible obligation.
            </p>
          </div>
          <CoreContractFields
            members={members}
            recipientPlaceholder={commercial.recipientPlaceholder}
            recipientAccess={commercial.multiRecipientAccess}
            maxReminderRecipients={commercial.maxReminderRecipients}
          />
          <Field label="Contract file">
            <Input
              name="file"
              type="file"
              required
              disabled={!commercial.contractTrackingAccess.allowed}
              accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            />
          </Field>
          <Button type="submit" disabled={!commercial.contractTrackingAccess.allowed}>
            Upload and extract
          </Button>
        </ServerActionForm>

        <ServerActionForm serverAction={createManualContractAction} className="panel space-y-4 p-6">
          <div>
            <h2 className="text-lg font-semibold">Secondary path: manual contract entry</h2>
            <p className="mt-1 text-sm text-slate-500">Use manual entry when the file is unavailable and you still need one notice window under control.</p>
          </div>
          {!commercial.manualContractsAccess.allowed ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              {commercial.manualContractsAccess.message}
            </div>
          ) : null}
          {commercial.manualContractsAccess.allowed && !commercial.contractTrackingAccess.allowed ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              {commercial.contractTrackingAccess.message}
            </div>
          ) : null}
          <Field label="Contract title">
            <Input name="contract_title" required disabled={!manualEntryAllowed} />
          </Field>
          <Field label="Counterparty">
            <Input name="counterparty_name" disabled={!manualEntryAllowed} />
          </Field>
          <CoreContractFields
            members={members}
            recipientPlaceholder={commercial.recipientPlaceholder}
            recipientAccess={commercial.multiRecipientAccess}
            maxReminderRecipients={commercial.maxReminderRecipients}
            disabled={!manualEntryAllowed}
          />
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Notice deadline">
              <Input name="notice_deadline_date" type="date" disabled={!manualEntryAllowed} />
            </Field>
            <Field label="Renewal date">
              <Input name="renewal_date" type="date" disabled={!manualEntryAllowed} />
            </Field>
            <Field label="Expiration date">
              <Input name="expiration_date" type="date" disabled={!manualEntryAllowed} />
            </Field>
            <Field label="Termination window">
              <Input name="termination_window" placeholder="30 days" disabled={!manualEntryAllowed} />
            </Field>
            <Field label="Auto renewal">
              <select
                name="auto_renewal"
                defaultValue="null"
                disabled={!manualEntryAllowed}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm"
              >
                <option value="null">Unknown</option>
                <option value="true">Yes</option>
                <option value="false">No</option>
              </select>
            </Field>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="needs_review"
              value="true"
              defaultChecked
              disabled={!manualEntryAllowed}
              className="rounded border-slate-300"
            />
            Keep this contract in review
          </label>
          <Field label="Review reason" description="Required when the contract stays in review before trusted reminders activate.">
            <Input
              name="review_reason"
              defaultValue="Manual contract entry requires reviewer confirmation before trusted workflow activation."
              disabled={!manualEntryAllowed}
            />
          </Field>
          <input type="hidden" name="review_mode" value="exception_review" />
          <Button type="submit" variant="secondary" disabled={!manualEntryAllowed}>
            Save manual contract
          </Button>
        </ServerActionForm>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <ServerActionForm serverAction={importContractsAction} className="panel space-y-4 p-6">
          <h2 className="text-lg font-semibold">Import with the fixed template</h2>
          <p className="text-sm text-slate-500">
            Use the fixed template only. Imports create a review queue with partial success and row-level errors instead of silently guessing.
          </p>
          <div className="flex flex-wrap gap-2 text-sm">
            <Button asChild variant="ghost">
              <Link href="/dashboard/contracts/import-template">Download CSV template</Link>
            </Button>
            <Button asChild variant="ghost">
              <Link href="/services">Use the import cleanup package</Link>
            </Button>
            {latestImportJob && latestImportJob.error_count > 0 ? (
              <Button asChild variant="ghost">
                <Link href={`/dashboard/contracts/imports/${latestImportJob.id}/errors`}>
                  Download latest error report
                </Link>
              </Button>
            ) : null}
          </div>
          {latestImportJob ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
              Latest import: {latestImportJob.file_name} - {latestImportJob.imported_count}/{latestImportJob.row_count} rows imported.
              {latestImportJob.error_count > 0
                ? ` ${latestImportJob.error_count} rows still need rescue.`
                : " No row-level rescue is currently needed."}
            </div>
          ) : null}
          <Field label="CSV or Excel file">
            <Input
              name="file"
              type="file"
              required
              disabled={!commercial.contractTrackingAccess.allowed}
              accept=".csv,.xlsx"
            />
          </Field>
          <Button
            type="submit"
            variant="secondary"
            disabled={!commercial.contractTrackingAccess.allowed}
          >
            Import contracts
          </Button>
        </ServerActionForm>
        <div className="panel space-y-4 p-6 lg:col-span-2">
          <div>
            <h2 className="text-lg font-semibold">Shipped workflow focus</h2>
            <p className="mt-1 text-sm text-slate-500">
              Keep the workflow narrow: intake, review P0, assign owner, trust reminders, acknowledge risk, record a decision, and close the cycle.
            </p>
          </div>
          <div className="grid gap-4 xl:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 p-5 text-sm text-slate-600">
              Counterparty normalization stays basic: preserve the raw name, suggest duplicates, and merge manually when needed.
            </div>
            <div className="rounded-2xl border border-slate-200 p-5 text-sm text-slate-600">
              The intake surface is intentionally calm. There are no playbooks, custom reminder rules, watched-folder import, or chat delivery controls here.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function CoreContractFields({
  recipientPlaceholder,
  recipientAccess,
  maxReminderRecipients,
  disabled,
  members
}: {
  recipientPlaceholder: string;
  recipientAccess: CommercialAccessResult;
  maxReminderRecipients: number | null;
  disabled?: boolean;
  members: MemberOption[];
}) {
  return (
    <>
      <Field label="Working title">
        <Input name="contractTitle" placeholder="MSA with Acme Ltd" disabled={disabled} />
      </Field>
      <Field label="Owner">
        <select
          name="owner_user_id"
          disabled={disabled}
          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm"
        >
          <option value="">Unassigned</option>
          {members.map((member) => (
            <option key={member.user_id} value={member.user_id}>
              {member.label}
            </option>
          ))}
        </select>
      </Field>
      <Field
        label="Reminder recipients"
        description={
          recipientAccess.allowed
            ? "Comma-separated emails"
            : `${recipientAccess.message} ${maxReminderRecipients ? `Only ${maxReminderRecipients} recipient will be used.` : ""}`.trim()
        }
      >
        <Input
          name="recipient_emails"
          placeholder={recipientPlaceholder}
          disabled={disabled}
        />
      </Field>
    </>
  );
}
