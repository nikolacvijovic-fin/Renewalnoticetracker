import Link from "next/link";
import { Button } from "@/components/ui/button";
import { SHIPPED_FIRST_SCOPE } from "@/lib/product/shipping-profile";

export default function ServicesPage() {
  return (
    <main className="page-shell py-12">
      <div className="space-y-8">
        <section className="panel max-w-5xl p-8">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-brand-700">
            Services
          </p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight text-ink">
            Fixed-scope services that speed up rollout without turning NoticeControl into consulting.
          </h1>
          <p className="mt-4 max-w-3xl text-base text-slate-600">
            The only customer-facing services are onboarding, import cleanup, and renewal-ops setup.
            No legal review, no drafting, no negotiation, and no custom integration projects.
          </p>
        </section>

        <section className="grid gap-4">
          {SHIPPED_FIRST_SCOPE.customerFacingServices.map((servicePackage) => (
            <div key={servicePackage.slug} className="rounded-3xl border border-slate-200 bg-white p-6">
              <h2 className="text-2xl font-semibold">{servicePackage.name}</h2>
              <p className="mt-3 text-sm text-slate-600">{servicePackage.summary}</p>
              <ul className="mt-4 space-y-3 text-sm text-slate-700">
                {servicePackage.includes.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          ))}
        </section>

        <section className="panel max-w-5xl p-8">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="max-w-3xl">
              <h2 className="text-2xl font-semibold">Best use of services</h2>
              <p className="mt-3 text-sm text-slate-600">
                Services should accelerate first value, import cleanup, and a working renewal cadence.
                They should not turn the company into outsourced contract operations.
              </p>
            </div>
            <Button asChild>
              <Link href="/auth?source=services_page_cta">Talk to us</Link>
            </Button>
          </div>
          <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-5">
            <h3 className="text-base font-semibold">What we do not offer</h3>
            <ul className="mt-3 space-y-2 text-sm text-slate-700">
              {[
                "Legal review",
                "Contract drafting or redlining",
                "Negotiation support",
                "Custom CRM or ERP integration projects"
              ].map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        </section>
      </div>
    </main>
  );
}
