"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AlertTriangle, BarChart3, BriefcaseBusiness, CreditCard, FileText, LayoutDashboard, SendToBack, Settings, TimerReset, Wrench } from "lucide-react";
import { APP_NAME } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { SignOutButton } from "@/components/layout/sign-out-button";
import { SHIPPED_FIRST_SCOPE } from "@/lib/product/shipping-profile";

const ICONS = {
  "/dashboard": LayoutDashboard,
  "/onboarding": TimerReset,
  "/dashboard/risk-queue": AlertTriangle,
  "/dashboard/financial-intelligence": BarChart3,
  "/dashboard/procurement-analytics": BriefcaseBusiness,
  "/dashboard/internal-outreach": SendToBack,
  "/dashboard/saas-opt-out-clock": TimerReset,
  "/dashboard/revenue-intelligence": BarChart3,
  "/dashboard/contracts": FileText,
  "/dashboard/settings": Settings,
  "/pricing": CreditCard,
  "/services": Wrench
} as const;

export function AppSidebar() {
  const pathname = usePathname();

  return (
    <aside className="panel subtle-grid h-fit p-4">
      <div className="mb-6 rounded-2xl bg-ink p-4 text-white shadow-sm">
        <p className="text-xs uppercase tracking-[0.2em] text-brand-200">Ex Umbris</p>
        <h1 className="mt-2 text-lg font-semibold">{APP_NAME}</h1>
        <p className="mt-1 text-xs text-slate-300">CFO Opt-Out Clock</p>
      </div>
      <nav className="space-y-1">
        {SHIPPED_FIRST_SCOPE.customerNavigation.map((item) => {
          const Icon = ICONS[item.href as keyof typeof ICONS] ?? FileText;
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition",
                active ? "bg-brand-50 text-brand-700 ring-1 ring-brand-100" : "text-muted hover:bg-slate-100"
              )}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="mt-6 border-t border-slate-200 pt-4">
        <SignOutButton />
      </div>
    </aside>
  );
}
