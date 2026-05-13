"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CreditCard, FileText, LayoutDashboard, Settings, Wrench } from "lucide-react";
import { APP_NAME } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { SignOutButton } from "@/components/layout/sign-out-button";
import { SHIPPED_FIRST_SCOPE } from "@/lib/product/shipping-profile";

const ICONS = {
  "/dashboard": LayoutDashboard,
  "/dashboard/contracts": FileText,
  "/dashboard/settings": Settings,
  "/pricing": CreditCard,
  "/services": Wrench
} as const;

export function AppSidebar() {
  const pathname = usePathname();

  return (
    <aside className="panel subtle-grid h-fit p-4">
      <div className="mb-6 rounded-2xl bg-brand-900 p-4 text-white">
        <p className="text-xs uppercase tracking-[0.2em] text-brand-100">Renewal Ops</p>
        <h1 className="mt-2 text-lg font-semibold">{APP_NAME}</h1>
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
                active ? "bg-brand-100 text-brand-900" : "text-slate-600 hover:bg-slate-100"
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
