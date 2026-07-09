import { cn } from "@/lib/utils";

export function Badge({
  children,
  tone = "default"
}: {
  children: React.ReactNode;
  tone?: "default" | "warning" | "urgent" | "critical" | "danger" | "success" | "safe" | "locked" | "automation";
}) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2.5 py-1 text-xs font-semibold",
        {
          "bg-slate-100 text-slate-700": tone === "default",
          "bg-warning/15 text-amber-800": tone === "warning",
          "bg-urgent/15 text-urgent": tone === "urgent",
          "bg-critical/10 text-critical": tone === "danger" || tone === "critical",
          "bg-success/10 text-success": tone === "success" || tone === "safe",
          "bg-locked/10 text-locked": tone === "locked",
          "bg-automation/10 text-automation": tone === "automation"
        }
      )}
    >
      {children}
    </span>
  );
}
