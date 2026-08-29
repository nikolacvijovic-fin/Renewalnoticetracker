import { Badge } from "@/components/ui/badge";
import { requireInternalRole } from "@/lib/internal-access";
import { computeEnterpriseReadinessScore } from "@/lib/enterprise-readiness/enterprise-readiness-score";
import { getEnterpriseReadinessEvidence } from "@/lib/enterprise-readiness/enterprise-readiness-evidence";

function statusTone(status: string) {
  if (status === "enterprise_ready") return "success" as const;
  if (status === "getting_ready") return "warning" as const;
  return "critical" as const;
}

export default async function AdminEnterpriseReadinessPage({
  searchParams
}: {
  searchParams?: Promise<{ organizationId?: string }>;
}) {
  await requireInternalRole(["internal_admin", "internal_support"]);
  const resolvedSearchParams = await searchParams;
  const organizationId = resolvedSearchParams?.organizationId?.trim() ?? "";

  if (!organizationId) {
    return (
      <main className="mx-auto max-w-6xl space-y-6 p-8">
        <section className="rounded-3xl border border-line bg-white p-8 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-brand-600">
            Enterprise governance
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">Enterprise readiness</h1>
          <p className="mt-3 max-w-3xl text-sm text-muted">
            Add an explicit organizationId query parameter to score enterprise readiness without
            broad cross-tenant reads.
          </p>
        </section>
      </main>
    );
  }

  const evidenceResult = await getEnterpriseReadinessEvidence(organizationId);
  const result = computeEnterpriseReadinessScore(evidenceResult.scoreInput);

  return (
    <main className="mx-auto max-w-6xl space-y-6 p-8">
      <section>
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-brand-600">
          Enterprise governance
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Enterprise readiness</h1>
        <p className="mt-2 max-w-3xl text-sm text-muted">
          Readiness combines shipped trust controls, audit coverage, operational evidence, and
          unresolved security-sensitive audit events. It is intentionally conservative.
        </p>
      </section>

      <section className="rounded-3xl border border-line bg-white p-8 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-muted">Overall score</p>
            <p className="mt-2 text-6xl font-semibold tracking-tight text-ink">{result.overallScore}</p>
          </div>
          <Badge tone={statusTone(result.status)}>{result.status.replaceAll("_", " ")}</Badge>
        </div>
        <p className="mt-6 rounded-2xl bg-slate-50 p-4 text-sm text-muted">
          Next recommended control: <span className="font-semibold text-ink">{result.nextRecommendedControl}</span>
        </p>
      </section>

      <section className="grid gap-6 lg:grid-cols-3">
        <div className="rounded-3xl border border-line bg-white p-6 shadow-sm">
          <h2 className="font-semibold text-ink">Critical blockers</h2>
          <ul className="mt-4 space-y-2 text-sm text-muted">
            {result.blockers.length > 0 ? (
              result.blockers.map((blocker) => <li key={blocker}>{blocker}</li>)
            ) : (
              <li>No critical blockers detected.</li>
            )}
          </ul>
        </div>
        <div className="rounded-3xl border border-line bg-white p-6 shadow-sm">
          <h2 className="font-semibold text-ink">Warnings</h2>
          <ul className="mt-4 space-y-2 text-sm text-muted">
            {result.warnings.length > 0 ? (
              result.warnings.map((warning) => <li key={warning}>{warning}</li>)
            ) : (
              <li>No maturity warnings detected.</li>
            )}
          </ul>
        </div>
        <div className="rounded-3xl border border-line bg-white p-6 shadow-sm">
          <h2 className="font-semibold text-ink">Completed controls</h2>
          <ul className="mt-4 space-y-2 text-sm text-muted">
            {result.completedControls.map((control) => (
              <li key={control}>{control.replaceAll("_", " ")}</li>
            ))}
          </ul>
        </div>
      </section>
      <section className="rounded-3xl border border-line bg-white p-6 shadow-sm">
        <h2 className="font-semibold text-ink">Evidence sources</h2>
        <div className="mt-4 grid gap-3">
          {evidenceResult.evidence.map((item) => (
            <div key={item.controlId} className="rounded-2xl border border-line p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-ink">{item.controlId.replaceAll("_", " ")}</p>
                  <p className="mt-1 text-sm text-muted">{item.summary}</p>
                  <p className="mt-1 text-xs text-muted">Source: {item.source} | Checked {item.checkedAt}</p>
                </div>
                <Badge tone={item.status === "passed" ? "success" : item.status === "warning" ? "warning" : "critical"}>
                  {item.status}
                </Badge>
              </div>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
