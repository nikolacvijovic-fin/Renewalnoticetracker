import { cn } from "@/lib/utils";

export function Badge({
  children,
  tone = "default"
}: {
  children: React.ReactNode;
  tone?: "default" | "warning" | "danger" | "success";
}) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2.5 py-1 text-xs font-semibold",
        {
          "bg-slate-100 text-slate-700": tone === "default",
          "bg-amber-100 text-amber-800": tone === "warning",
          "bg-red-100 text-red-800": tone === "danger",
          "bg-emerald-100 text-emerald-800": tone === "success"
        }
      )}
    >
      {children}
    </span>
  );
}
