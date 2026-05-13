import Link from "next/link";
import { Button } from "@/components/ui/button";
import { SHIPPED_FIRST_SCOPE } from "@/lib/product/shipping-profile";

export default function PricingPage() {
  return (
    <main className="page-shell py-12">
      <div className="space-y-8">
        <section className="panel max-w-5xl p-8">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-brand-700">
            Pricing
          </p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight text-ink">
            Pay for active tracked contract coverage and coordination depth, not CLM bloat.
          </h1>
          <p className="mt-4 max-w-3xl text-base text-slate-600">
            NoticeControl is priced around vendor-side tracked-contract coverage and coordination depth.
            Starter handles the shipped-first workflow, Growth supports bigger portfolios and broader
            team coordination, and Portfolio is custom for larger rollouts.
          </p>
          <div className="mt-6 grid gap-4 md:grid-cols-3">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-600">
              14-day trial focused on the core workflow: upload, review, owner, live obligation
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-600">
              Annual Growth and Portfolio plans include stronger rollout economics and lower churn risk
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-600">
              Paid setup is standardized for onboarding, cleanup/import, and renewal-ops setup
            </div>
          </div>
        </section>

        <section className="grid gap-4 xl:grid-cols-3">
          {SHIPPED_FIRST_SCOPE.publicPlans.map((plan) => (
            <div
              key={plan.slug}
              className={`rounded-3xl border p-6 ${
                plan.highlight
                  ? "border-brand-300 bg-brand-50 shadow-sm"
                  : "border-slate-200 bg-white"
              }`}
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-xl font-semibold">{plan.name}</h2>
                  {plan.highlight ? (
                    <span className="rounded-full bg-brand-700 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-white">
                      Best fit
                    </span>
                  ) : null}
                </div>
                <div>
                  <p className="text-3xl font-semibold">
                    {plan.price}
                    <span className="text-base font-medium text-slate-500">{plan.cadence}</span>
                  </p>
                  <p className="mt-1 text-xs text-slate-500">{plan.annualLabel}</p>
                  <p className="mt-1 text-sm font-medium text-slate-700">{plan.contractBand}</p>
                </div>
                <p className="text-sm text-slate-600">{plan.description}</p>
              </div>
              <ul className="mt-6 space-y-3 text-sm text-slate-700">
                {plan.features.map((feature) => (
                  <li key={feature}>{feature}</li>
                ))}
              </ul>
              <div className="mt-8">
                <Button asChild variant={plan.highlight ? "primary" : "secondary"}>
                  <Link
                    href={
                      plan.name === "Portfolio"
                        ? "/auth?source=pricing_portfolio_contact"
                        : `/auth?source=pricing_${plan.slug}_cta`
                    }
                  >
                    {plan.name === "Portfolio" ? "Talk to sales" : "Start trial"}
                  </Link>
                </Button>
              </div>
            </div>
          ))}
        </section>

        <section className="panel max-w-5xl p-8">
          <h2 className="text-2xl font-semibold">Why teams upgrade naturally</h2>
          <div className="mt-4 grid gap-4 md:grid-cols-3">
            {[
              "Contract-cap pressure when more obligations need active tracking",
              "Deeper review and ownership coordination across more contracts",
              "Broader rollout, support, and governance needs"
            ].map((item) => (
              <div key={item} className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-600">
                {item}
              </div>
            ))}
          </div>
        </section>

        <section className="panel max-w-5xl p-8">
          <h2 className="text-2xl font-semibold">Why teams buy</h2>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            {[
              "Missed notice windows create avoidable renewal risk and last-minute fire drills.",
              "Spreadsheet coverage is not enough when ownership and reminders are weak.",
              "Teams need one reviewed truth for due-soon exposure, owner gaps, and decision gaps."
            ].map((hook) => (
              <div key={hook} className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-600">
                {hook}
              </div>
            ))}
          </div>
        </section>

        <section className="panel max-w-5xl p-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="max-w-3xl">
              <h2 className="text-2xl font-semibold">Fixed-scope rollout services</h2>
              <p className="mt-3 text-sm text-slate-600">
                Customer-facing services stay tightly scoped to onboarding, import cleanup, and
                renewal-ops setup so they speed up adoption instead of turning the product into consulting.
              </p>
            </div>
            <Button asChild variant="secondary">
              <Link href="/services">View service packages</Link>
            </Button>
          </div>
          <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {SHIPPED_FIRST_SCOPE.customerFacingServices.map((servicePackage) => (
              <div key={servicePackage.name} className="rounded-2xl border border-slate-200 bg-white p-5">
                <h3 className="text-base font-semibold">{servicePackage.name}</h3>
                <p className="mt-2 text-sm text-slate-600">{servicePackage.summary}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="panel max-w-5xl p-8">
          <h2 className="text-2xl font-semibold">What is not included on purpose</h2>
          <p className="mt-3 max-w-3xl text-sm text-slate-600">
            This product is not full CLM, drafting, negotiation workflow, or e-signature. The value
            is operational follow-through on renewal and notice obligations.
          </p>
        </section>

        <section className="panel max-w-5xl p-8">
          <h2 className="text-2xl font-semibold">Wedge-specific ROI</h2>
          <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            {[
              "Reviewed coverage gained",
              "Owner coverage gained",
              "Due-soon obligations surfaced",
              "Risk exposure visibility improved",
              "Time-to-value"
            ].map((item) => (
              <div key={item} className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-600">
                {item}
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
