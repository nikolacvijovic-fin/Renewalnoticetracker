import Link from "next/link";
import { requireOrganization } from "@/lib/auth";
import { getBillingSnapshot } from "@/lib/billing/entitlements";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { evaluateSubscriptionUsageOptimizationAccess } from "@/lib/subscription-usage/access";
import { GOOGLE_WORKSPACE_REQUIRED_SCOPES } from "@/lib/subscription-usage/google-workspace";
import {
  commitSubscriptionUsageImportAction,
  disconnectGoogleWorkspaceConnectionAction,
  disconnectMicrosoft365UsageConnectionAction,
  getMicrosoft365AdminConsentUrlAction,
  reviewSubscriptionUsageFindingAction,
  startGoogleWorkspaceConnectionAction,
  syncGoogleWorkspaceUsageNowAction,
  syncMicrosoft365UsageNowAction
} from "@/lib/actions/subscription-usage-optimization";

type Provider = "microsoft_365" | "google_workspace";
type ConnectionRow = { id: string; provider: Provider; provider_tenant_id: string; provider_tenant_name: string | null; status: string; last_successful_sync_at: string | null; last_error_code: string | null; next_scheduled_sync_at: string | null };
type SyncRunRow = { id: string; provider: Provider; status: string; row_count: number; finding_count: number; duration_ms: number | null; retry_count: number; last_error_code: string | null; created_at: string };
type FindingRow = { id: string; finding_type: string; provider: Provider | "manual_csv" | null; capability_category: string | null; estimated_savings: number | null; estimated_savings_min: number | null; estimated_savings_max: number | null; currency: string | null; confidence: number; recommended_action: string | null; review_status: string; matched_contract_ids: string[] | null; involved_providers: string[] | null; involved_products: string[] | null; warnings: string[] | null; evidence: Record<string, unknown> | null };
type UsageRow = { provider: Provider | "manual_csv" | null; external_product_id: string | null; product_name: string | null; collected_at: string | null; purchased_seats: number | null; assigned_seats: number | null; active_users_30d: number | null };
type PageSearchParams = { provider?: string; capability?: string; confidence?: string; renewalWindow?: string; reviewState?: string };

async function syncMicrosoft365UsageNowFormAction(formData: FormData) { "use server"; await syncMicrosoft365UsageNowAction(formData); }
async function syncGoogleWorkspaceUsageNowFormAction(formData: FormData) { "use server"; await syncGoogleWorkspaceUsageNowAction(formData); }

export default async function SubscriptionOptimizationPage({ searchParams }: { searchParams?: PageSearchParams }) {
  const context = await requireOrganization();
  const access = await evaluateSubscriptionUsageOptimizationAccess(await getBillingSnapshot(context.organizationId));
  const [connections, latestSyncs, findings, usageRows, microsoftConsent] = access.allowed
    ? await Promise.all([
        listProviderConnections(context.organizationId),
        listLatestSyncs(context.organizationId),
        listUsageFindings(context.organizationId),
        listLatestUsageRows(context.organizationId),
        getMicrosoft365AdminConsentUrlAction()
      ])
    : [[] as ConnectionRow[], [] as SyncRunRow[], [] as FindingRow[], [] as UsageRow[], null];
  const visibleFindings = filterFindings(findings, searchParams ?? {});
  const totals = summarizeUsageRows(usageRows);
  const savingsByCurrency = summarizeSavingsByCurrency(visibleFindings);
  const microsoftConnection = connections.find((item) => item.provider === "microsoft_365") ?? null;
  const googleConnection = connections.find((item) => item.provider === "google_workspace") ?? null;

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 py-8">
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-teal-700">Subscription Usage Optimization</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">Cross-provider license defense</h1>
        <p className="mt-3 max-w-4xl text-sm leading-6 text-slate-600">
          Compare Microsoft 365 and Google Workspace licensing, adoption, reviewed cost, and renewal timing.
          Overlap is a review candidate, never proof of duplication. NoticeControl does not cancel subscriptions,
          remove licenses, or contact vendors.
        </p>
      </section>

      {!access.allowed ? (
        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
          <h2 className="font-semibold">Add-on unavailable</h2><p className="mt-2">{access.customerSafeMessage}</p>
        </section>
      ) : (
        <>
          <section className="grid gap-4 lg:grid-cols-2">
            <ProviderConnectionCard title="Microsoft 365" connection={microsoftConnection} syncAction={syncMicrosoft365UsageNowFormAction} disconnectAction={disconnectMicrosoft365UsageConnectionAction} permissionCopy="LicenseAssignment.Read.All and Reports.Read.All"
              connectControl={microsoftConsent?.ok ? <Link href={microsoftConsent.url} className="inline-flex rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white">Connect Microsoft 365</Link> : <p className="text-sm text-amber-700">{microsoftConsent?.safeMessage ?? "Microsoft 365 configuration is incomplete."}</p>} />
            <ProviderConnectionCard title="Google Workspace" connection={googleConnection} syncAction={syncGoogleWorkspaceUsageNowFormAction} disconnectAction={disconnectGoogleWorkspaceConnectionAction} permissionCopy={`${GOOGLE_WORKSPACE_REQUIRED_SCOPES.length} scopes; Google licensing permission is read/write by definition, but NoticeControl enforces GET-only requests`}
              connectControl={<form action={startGoogleWorkspaceConnectionAction} className="grid gap-3 sm:grid-cols-2">
                <label className="text-sm font-medium text-slate-700">Customer ID<input name="customerId" required placeholder="C01234567" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" /></label>
                <label className="text-sm font-medium text-slate-700">Primary domain<input name="domain" required placeholder="example.com" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" /></label>
                <button className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white sm:col-span-2">Connect Google Workspace</button>
              </form>} />
          </section>

          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard label="Microsoft purchased" value={totals.microsoft.purchasedSeats} detail={`${totals.microsoft.activeUsers30d} active in 30d`} />
            <MetricCard label="Google assigned" value={totals.google.assignedSeats} detail={`${totals.google.activeUsers30d} active in 30d`} />
            <MetricCard label="Open recommendations" value={findings.filter((item) => item.review_status === "open").length} detail={`${findings.filter((item) => item.finding_type === "possible_functional_overlap" && item.review_status === "open").length} overlap candidates`} />
            <MetricCard label="Potential savings" value={formatSavings(savingsByCurrency)} detail="Separated by currency; no implicit conversion" />
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div><h2 className="text-lg font-semibold text-slate-950">Reviewable recommendations</h2><p className="mt-1 text-sm text-slate-600">Weak, stale, partial, or ambiguous evidence lowers confidence.</p></div>
              <form className="grid gap-2 sm:grid-cols-2 lg:grid-cols-6" method="get">
                <FilterSelect name="provider" value={searchParams?.provider} options={["all", "microsoft_365", "google_workspace"]} />
                <FilterSelect name="capability" value={searchParams?.capability} options={["all", "email_calendar", "video_meetings", "team_chat", "file_collaboration", "office_editing", "identity_access", "device_management", "security_compliance"]} />
                <FilterSelect name="confidence" value={searchParams?.confidence} options={["all", "high", "medium", "low"]} />
                <FilterSelect name="renewalWindow" value={searchParams?.renewalWindow} options={["all", "30_days", "90_days", "no_linked_deadline"]} />
                <FilterSelect name="reviewState" value={searchParams?.reviewState} options={["all", "open", "accepted", "rejected", "deferred", "action_planned"]} />
                <button className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-800">Apply filters</button>
              </form>
            </div>
            <div className="mt-5 divide-y divide-slate-100">
              {visibleFindings.length === 0 ? <p className="py-6 text-sm text-slate-500">No recommendations match these filters.</p> : visibleFindings.map((finding) => <FindingCard key={finding.id} finding={finding} />)}
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-950">Synchronization health</h2>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {latestSyncs.length === 0 ? <p className="text-sm text-slate-500">No provider synchronization has run yet.</p> : latestSyncs.map((sync) => <div key={sync.id} className="rounded-xl border border-slate-200 p-4 text-sm text-slate-700">
                <p className="font-semibold text-slate-950">{formatProvider(sync.provider)} · {sync.status}</p>
                <p className="mt-1">{sync.row_count} rows · {sync.finding_count} findings · {sync.retry_count} retries</p>
                <p className="mt-1 text-xs text-slate-500">{formatDateTime(sync.created_at)}{sync.last_error_code ? ` · ${sync.last_error_code}` : ""}</p>
              </div>)}
            </div>
          </section>

          <details className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <summary className="cursor-pointer text-lg font-semibold text-slate-950">Advanced import fallback</summary>
            <form action={async (formData) => { "use server"; await commitSubscriptionUsageImportAction(formData); }} className="mt-4">
              <p className="text-sm text-slate-600">Use a bounded CSV/XLSX file only when provider synchronization is unavailable.</p>
              <label className="mt-4 block text-sm font-medium text-slate-700" htmlFor="sourceLabel">Source label</label>
              <input id="sourceLabel" name="sourceLabel" required placeholder="Example: reviewed admin usage export" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
              <label className="mt-4 block text-sm font-medium text-slate-700" htmlFor="file">CSV/XLSX file</label>
              <input id="file" name="file" required type="file" accept=".csv,.xlsx,.xls" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
              <button className="mt-5 rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-800">Import fallback file</button>
            </form>
          </details>
        </>
      )}
    </main>
  );
}

function ProviderConnectionCard({ title, connection, syncAction, disconnectAction, connectControl, permissionCopy }: { title: string; connection: ConnectionRow | null; syncAction: (formData: FormData) => Promise<void>; disconnectAction: (formData: FormData) => Promise<void>; connectControl: React.ReactNode; permissionCopy: string }) {
  return <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="text-lg font-semibold text-slate-950">{title}</h2>
    {connection && connection.status !== "disconnected" ? <div className="mt-4 space-y-3 text-sm text-slate-700">
      <p><span className="font-medium">Account:</span> {connection.provider_tenant_name ?? connection.provider_tenant_id}</p>
      <p><span className="font-medium">Status:</span> <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold uppercase tracking-wide">{connection.status}</span></p>
      <p><span className="font-medium">Freshness:</span> {formatDateTime(connection.last_successful_sync_at)}</p>
      {connection.last_error_code ? <p className="text-amber-700"><span className="font-medium">Last error:</span> {connection.last_error_code}</p> : null}
      <div className="flex flex-wrap gap-3 pt-2"><form action={syncAction}><input type="hidden" name="connectionId" value={connection.id} /><button className="rounded-lg bg-teal-700 px-4 py-2 font-semibold text-white">Sync now</button></form><form action={disconnectAction}><input type="hidden" name="connectionId" value={connection.id} /><button className="rounded-lg border border-slate-300 px-4 py-2 font-semibold text-slate-800">Disconnect</button></form></div>
    </div> : <div className="mt-4">{connectControl}</div>}
    <p className="mt-3 text-xs leading-5 text-slate-500">Permissions: {permissionCopy}. Tokens and raw provider responses are never displayed.</p>
  </div>;
}

function FindingCard({ finding }: { finding: FindingRow }) {
  const explanation = typeof finding.evidence?.explanation === "string" ? finding.evidence.explanation : null;
  const contractDeadlines = getContractDeadlineEvidence(finding.evidence);
  const savings = finding.estimated_savings_max ?? finding.estimated_savings;
  return <article className="grid gap-4 py-5 lg:grid-cols-[1fr_auto]"><div>
    <div className="flex flex-wrap items-center gap-2"><p className="font-semibold text-slate-950">{formatFindingType(finding.finding_type)}</p>{finding.capability_category ? <span className="rounded-full bg-teal-50 px-2 py-1 text-xs font-medium text-teal-800">{formatFindingType(finding.capability_category)}</span> : null}<span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700">{Math.round(finding.confidence * 100)}% confidence</span></div>
    {finding.involved_products?.length ? <p className="mt-2 text-sm text-slate-700">{finding.involved_products.join(" ↔ ")}</p> : null}
    <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">{explanation ?? "Review usage, contract, and ownership evidence before taking action."}</p>
    <div className="mt-2 flex flex-wrap gap-3 text-xs text-slate-500"><span>Providers: {(finding.involved_providers?.length ? finding.involved_providers : [finding.provider]).filter(Boolean).map(String).map(formatProvider).join(", ")}</span><span>Contracts: {finding.matched_contract_ids?.length ?? 0}</span><span>Review: {formatFindingType(finding.review_status)}</span>{finding.warnings?.slice(0, 3).map((warning) => <span key={warning}>{formatFindingType(warning)}</span>)}</div>
    {contractDeadlines.length ? <div className="mt-2 space-y-1 text-xs text-slate-600">{contractDeadlines.map((item) => <p key={item.contractId}>Renewal {item.renewalDate ?? "unknown"} · notice deadline {item.noticeDeadlineDate ?? "unknown"}</p>)}</div> : null}
    {finding.matched_contract_ids?.[0] ? <Link className="mt-3 inline-flex text-sm font-semibold text-teal-700" href={`/dashboard/contracts/${finding.matched_contract_ids[0]}`}>Open linked contract</Link> : null}
  </div><div className="min-w-64"><p className="text-right text-sm font-semibold text-slate-900">{savings ? `${finding.currency ?? ""} ${formatSavingsRange(finding)}` : "Cost evidence needed"}</p>
    {finding.review_status === "open" ? <><div className="mt-3 grid grid-cols-2 gap-2"><ReviewButton findingId={finding.id} label="Accept" nextStatus="accepted" acceptedAction={finding.recommended_action ?? "investigate"} classification="correct" /><ReviewButton findingId={finding.id} label="Investigate" nextStatus="action_planned" acceptedAction="investigate" /><ReviewButton findingId={finding.id} label="Defer" nextStatus="deferred" acceptedAction="insufficient_evidence" /><ReviewButton findingId={finding.id} label="Plan action" nextStatus="action_planned" acceptedAction={finding.recommended_action ?? "consolidate"} /></div>
    <form action={reviewSubscriptionUsageFindingAction} className="mt-2 flex gap-2"><input type="hidden" name="findingId" value={finding.id} /><input type="hidden" name="nextStatus" value="rejected" /><input type="hidden" name="feedbackClassification" value="incorrect" /><select name="feedbackReason" required className="min-w-0 flex-1 rounded-lg border border-slate-300 px-2 py-1 text-xs"><option value="">Rejection reason</option><option value="separate_departments">Separate departments</option><option value="compliance_requirement">Compliance requirement</option><option value="migration_in_progress">Migration in progress</option><option value="backup_requirement">Backup requirement</option><option value="incorrect_product_mapping">Incorrect mapping</option><option value="insufficient_evidence">Insufficient evidence</option></select><button className="rounded-lg border border-slate-300 px-2 py-1 text-xs font-semibold">Reject</button></form></> : <p className="mt-3 text-right text-xs text-slate-500">This recommendation has already been reviewed.</p>}
  </div></article>;
}

function ReviewButton({ findingId, label, nextStatus, acceptedAction, classification }: { findingId: string; label: string; nextStatus: string; acceptedAction: string; classification?: string }) {
  return <form action={reviewSubscriptionUsageFindingAction}><input type="hidden" name="findingId" value={findingId} /><input type="hidden" name="nextStatus" value={nextStatus} /><input type="hidden" name="acceptedAction" value={acceptedAction} />{classification ? <input type="hidden" name="feedbackClassification" value={classification} /> : null}<button className="w-full rounded-lg border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-800">{label}</button></form>;
}

function MetricCard({ label, value, detail }: { label: string; value: number | string; detail: string }) { return <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">{label}</p><p className="mt-2 text-2xl font-semibold text-slate-950">{value}</p><p className="mt-1 text-xs text-slate-500">{detail}</p></div>; }
function FilterSelect({ name, value, options }: { name: string; value?: string; options: string[] }) { return <select name={name} defaultValue={value ?? "all"} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">{options.map((option) => <option key={option} value={option}>{formatFindingType(option)}</option>)}</select>; }

async function listProviderConnections(organizationId: string) { const supabase = createServerSupabaseClient(); const { data, error } = await supabase.from("subscription_usage_provider_connections").select("id, provider, provider_tenant_id, provider_tenant_name, status, last_successful_sync_at, last_error_code, next_scheduled_sync_at").eq("organization_id", organizationId).order("updated_at", { ascending: false }).limit(10); if (error) throw error; return (data ?? []) as ConnectionRow[]; }
async function listLatestSyncs(organizationId: string) { const supabase = createServerSupabaseClient(); const { data, error } = await supabase.from("subscription_usage_sync_runs").select("id, provider, status, row_count, finding_count, duration_ms, retry_count, last_error_code, created_at").eq("organization_id", organizationId).order("created_at", { ascending: false }).limit(10); if (error) throw error; const latest = new Map<Provider, SyncRunRow>(); for (const row of (data ?? []) as SyncRunRow[]) if (!latest.has(row.provider)) latest.set(row.provider, row); return [...latest.values()]; }
async function listUsageFindings(organizationId: string) { const supabase = createServerSupabaseClient(); const { data, error } = await supabase.from("license_waste_opportunities").select("id, finding_type, provider, capability_category, estimated_savings, estimated_savings_min, estimated_savings_max, currency, confidence, recommended_action, review_status, matched_contract_ids, involved_providers, involved_products, warnings, evidence").eq("organization_id", organizationId).is("superseded_at", null).order("created_at", { ascending: false }).limit(200); if (error) throw error; return (data ?? []) as FindingRow[]; }
async function listLatestUsageRows(organizationId: string) { const supabase = createServerSupabaseClient(); const { data, error } = await supabase.from("usage_import_rows").select("provider, external_product_id, product_name, collected_at, purchased_seats, assigned_seats, active_users_30d").eq("organization_id", organizationId).in("provider", ["microsoft_365", "google_workspace"]).order("collected_at", { ascending: false }).limit(1000); if (error) throw error; const latest = new Map<string, UsageRow>(); for (const row of (data ?? []) as UsageRow[]) { const key = `${row.provider}:${row.external_product_id ?? row.product_name ?? "unknown"}`; if (!latest.has(key)) latest.set(key, row); } return [...latest.values()]; }

function filterFindings(findings: FindingRow[], filters: PageSearchParams) { return findings.filter((finding) => { if (filters.provider && filters.provider !== "all" && !finding.involved_providers?.includes(filters.provider) && finding.provider !== filters.provider) return false; if (filters.capability && filters.capability !== "all" && finding.capability_category !== filters.capability) return false; if (filters.confidence === "high" && finding.confidence < 0.75) return false; if (filters.confidence === "medium" && (finding.confidence < 0.5 || finding.confidence >= 0.75)) return false; if (filters.confidence === "low" && finding.confidence >= 0.5) return false; if (filters.reviewState && filters.reviewState !== "all" && finding.review_status !== filters.reviewState) return false; const deadlines = getContractDeadlineEvidence(finding.evidence).map((item) => item.noticeDeadlineDate ?? item.renewalDate).filter(Boolean) as string[]; if (filters.renewalWindow === "no_linked_deadline" && deadlines.length) return false; if (filters.renewalWindow === "30_days" && !deadlines.some((value) => isWithinDays(value, 30))) return false; if (filters.renewalWindow === "90_days" && !deadlines.some((value) => isWithinDays(value, 90))) return false; return true; }); }
function summarizeUsageRows(rows: UsageRow[]) { const empty = () => ({ purchasedSeats: 0, assignedSeats: 0, activeUsers30d: 0 }); const totals = { microsoft: empty(), google: empty() }; for (const row of rows) { const target = row.provider === "google_workspace" ? totals.google : row.provider === "microsoft_365" ? totals.microsoft : null; if (!target) continue; target.purchasedSeats += Number(row.purchased_seats ?? 0); target.assignedSeats += Number(row.assigned_seats ?? 0); target.activeUsers30d += Number(row.active_users_30d ?? 0); } return totals; }
function summarizeSavingsByCurrency(findings: FindingRow[]) { const totals = new Map<string, number>(); for (const finding of findings) if (finding.currency && finding.estimated_savings) totals.set(finding.currency, (totals.get(finding.currency) ?? 0) + finding.estimated_savings); return totals; }
function formatSavings(values: Map<string, number>) { if (values.size === 0) return "Evidence needed"; return [...values].map(([currency, amount]) => `${currency} ${amount.toLocaleString()}`).join(" · "); }
function formatSavingsRange(finding: FindingRow) { if (finding.estimated_savings_min != null && finding.estimated_savings_max != null) return `${finding.estimated_savings_min.toLocaleString()}–${finding.estimated_savings_max.toLocaleString()}`; return Number(finding.estimated_savings ?? 0).toLocaleString(); }
function formatDateTime(value: string | null) { if (!value) return "Not synced yet"; return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)); }
function formatFindingType(value: string) { return value.replaceAll("_", " ").replace(/\b\w/g, (match) => match.toUpperCase()); }
function formatProvider(value: string) { return value === "microsoft_365" ? "Microsoft 365" : value === "google_workspace" ? "Google Workspace" : formatFindingType(value); }
function getContractDeadlineEvidence(evidence: Record<string, unknown> | null) { const usageEvidence = evidence?.usageEvidence; if (!usageEvidence || typeof usageEvidence !== "object" || Array.isArray(usageEvidence)) return [] as Array<{ contractId: string; renewalDate: string | null; noticeDeadlineDate: string | null }>; const values = (usageEvidence as Record<string, unknown>).contract_deadlines; if (!Array.isArray(values)) return []; return values.flatMap((value) => { if (!value || typeof value !== "object" || Array.isArray(value)) return []; const record = value as Record<string, unknown>; if (typeof record.contract_id !== "string") return []; return [{ contractId: record.contract_id, renewalDate: typeof record.renewal_date === "string" ? record.renewal_date : null, noticeDeadlineDate: typeof record.notice_deadline_date === "string" ? record.notice_deadline_date : null }]; }); }
function isWithinDays(value: string, days: number) { const target = new Date(`${value}T00:00:00Z`).getTime(); const now = Date.now(); return Number.isFinite(target) && target >= now && target <= now + days * 24 * 60 * 60 * 1000; }
