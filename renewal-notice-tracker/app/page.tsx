import Link from "next/link";
import { LEGAL_DISCLAIMER } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { SHIPPED_FIRST_SCOPE } from "@/lib/product/shipping-profile";

export default function HomePage() {
  return (
    <main className="page-shell py-12">
      <section className="panel subtle-grid overflow-hidden p-8 lg:p-12">
        <div className="max-w-3xl">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-brand-700">
            Renewal / Notice Control
          </p>
          <h1 className="mt-4 text-4xl font-semibold tracking-tight text-ink sm:text-5xl">
            Stop surprise auto-renewals before they become finance, procurement, or legal fire drills.
          </h1>
          <p className="mt-6 max-w-2xl text-lg text-slate-600">
            Turn buried notice dates into owners, reminders, and decisions without buying CLM. Upload one contract, review the essential dates, assign one owner, and make upcoming obligations visible before they slip.
          </p>
          <div className="mt-6 grid gap-3 md:grid-cols-3">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
              Buyer sees value in one session: upload, review, owner, live obligation.
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
              Built for finance ops, procurement ops, vendor management, and legal ops-lite.
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
              Not CLM, not drafting, not e-signature. Operational follow-through only.
            </div>
          </div>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild>
              <Link href="/auth?source=homepage_primary_trial">Start 14-day trial</Link>
            </Button>
            <Button asChild variant="secondary">
              <Link href="/pricing?source=homepage_secondary_pricing">View pricing</Link>
            </Button>
            <Button asChild variant="ghost">
              <Link href="/services">Services</Link>
            </Button>
          </div>
        </div>
      </section>
      <section className="mt-8 grid gap-4 md:grid-cols-3">
        {[
          "Manual upload and fixed-template import get one live notice obligation visible fast.",
          "Reviewed truth and owner assignment gate reminders before they become trusted workflow.",
          "Built for vendor-side renewal control, not CLM or negotiation process sprawl."
        ].map((item) => (
          <div key={item} className="panel p-5 text-sm text-slate-600">
            {item}
          </div>
        ))}
      </section>
      <section className="mt-8 grid gap-4 md:grid-cols-4">
        {[
          "Reviewed coverage gained",
          "Owner coverage gained",
          "Due-soon obligations surfaced",
          SHIPPED_FIRST_SCOPE.productTagline
        ].map((item) => (
          <div key={item} className="rounded-2xl border border-slate-200 bg-white p-5 text-sm font-medium text-ink">
            {item}
          </div>
        ))}
      </section>
      <p className="mt-6 text-sm text-slate-500">{LEGAL_DISCLAIMER}</p>
    </main>
  );
}
