import Link from "next/link";
import { requireOrganization } from "@/lib/auth";
import { getBillingSnapshot, getFeatureAccessResult } from "@/lib/billing/entitlements";
import { CUSTOMER_EXPORT_CENTER_OPTIONS, type CustomerExportFormat } from "@/lib/exports/customer-export-center";
import { Button } from "@/components/ui/button";
import { CustomerFeedbackPanel } from "@/components/customer-feedback/customer-feedback-panel";

const FORMAT_LABELS: Record<CustomerExportFormat, string> = {
  csv: "CSV",
  xlsx: "Excel",
  pdf: "PDF",
  json: "JSON",
  ics: "Calendar"
};

function canUseFullExport(role: string) {
  return role === "admin" || role === "operator";
}

function formatDescription(format: CustomerExportFormat) {
  switch (format) {
    case "csv":
      return "Spreadsheet/import use";
    case "xlsx":
      return "Finance workbook";
    case "pdf":
      return "Leadership summary";
    case "json":
      return "Structured portable backup";
    case "ics":
      return "Calendar import";
  }
}

export default async function CustomerExportCenterPage() {
  const context = await requireOrganization();
  const billingSnapshot = await getBillingSnapshot(context.organizationId);
  const exportAccess = getFeatureAccessResult(billingSnapshot, "exports");
  const roleCanExportFullOrg = canUseFullExport(context.role);
  const canExport = exportAccess.allowed && roleCanExportFullOrg;

  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-sm font-medium uppercase tracking-wide text-blue-700">Customer data export</p>
          <h1 className="mt-2 text-3xl font-semibold text-slate-950">Export Center</h1>
          <p className="mt-2 max-w-3xl text-slate-500">
            Download safe renewal-control data for finance, procurement, leadership, spreadsheet review,
            or calendar planning. Raw contract text, provider payloads, private notes, email bodies, and
            hidden AI prompts are excluded by default.
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-600 shadow-sm">
          <p className="font-medium text-slate-950">Access boundary</p>
          <p className="mt-1">
            {roleCanExportFullOrg
              ? "Your role can request full organization exports."
              : "Full organization exports require admin or operator access."}
          </p>
          {!exportAccess.allowed ? <p className="mt-1 text-orange-700">{exportAccess.message}</p> : null}
        </div>
      </div>

      <div className="grid gap-4">
        {CUSTOMER_EXPORT_CENTER_OPTIONS.map((option) => (
          <article key={option.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <h2 className="text-xl font-semibold text-slate-950">{option.label}</h2>
                <p className="mt-2 max-w-3xl text-sm text-slate-500">{option.description}</p>
                <p className="mt-2 text-xs font-medium uppercase tracking-wide text-slate-500">
                  {option.availability === "available" ? "Available dataset" : "Partial beta dataset"}
                </p>
                {option.availabilityNote ? (
                  <p className="mt-1 max-w-3xl text-xs text-slate-500">{option.availabilityNote}</p>
                ) : null}
                <div className="mt-3 flex flex-wrap gap-2">
                  {option.includedFields.map((field) => (
                    <span key={field} className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
                      {field}
                    </span>
                  ))}
                </div>
              </div>
              <div className="min-w-64 rounded-xl bg-slate-50 p-3 text-sm text-slate-600">
                <p className="font-medium text-slate-950">Last exported</p>
                <p className="mt-1">Tracked in export audit history when downloaded.</p>
              </div>
            </div>

            <div className="mt-5 flex flex-wrap gap-3">
              {option.formats.map((format) => {
                const href = option.hrefs[format];
                const enabled = canExport && Boolean(href);
                return enabled ? (
                  <Button key={format} asChild variant={format === "pdf" ? "primary" : "secondary"}>
                    <Link href={href ?? "#"}>
                      {FORMAT_LABELS[format]} <span className="sr-only">for {option.label}</span>
                    </Link>
                  </Button>
                ) : (
                  <Button key={format} type="button" variant="secondary" disabled>
                    {FORMAT_LABELS[format]}
                  </Button>
                );
              })}
            </div>
            <p className="mt-3 text-xs text-slate-500">
              {option.formats.map((format) => `${FORMAT_LABELS[format]}: ${formatDescription(format)}`).join(" / ")}
            </p>
            {option.formatNotes ? (
              <ul className="mt-2 space-y-1 text-xs text-slate-500">
                {option.formats.map((format) =>
                  option.formatNotes?.[format] ? (
                    <li key={format}>
                      <span className="font-medium text-slate-700">{FORMAT_LABELS[format]}:</span>{" "}
                      {option.formatNotes[format]}
                    </li>
                  ) : null
                )}
              </ul>
            ) : null}
          </article>
        ))}
      </div>
      <CustomerFeedbackPanel
        title="Export missing or confusing?"
        description="Tell founder/support what export you expected. Exported file contents are never attached to feedback context."
        defaultFeedbackType="export_problem"
        entityType="export_center"
        currentRoute="/dashboard/exports"
        exportType="customer_data_export_center"
        sourceSurface="export_center"
      />
    </section>
  );
}
