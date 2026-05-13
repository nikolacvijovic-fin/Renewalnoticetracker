import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export function CommercialNotice({
  title = "Billing notice",
  message,
  tone = "warning"
}: {
  title?: string;
  message: string | null | undefined;
  tone?: "warning" | "danger" | "default";
}) {
  if (!message) return null;

  return (
    <div
      className={cn("rounded-2xl border p-4 text-sm", {
        "border-amber-200 bg-amber-50 text-amber-900": tone === "warning",
        "border-red-200 bg-red-50 text-red-900": tone === "danger",
        "border-slate-200 bg-slate-50 text-slate-700": tone === "default"
      })}
    >
      <div className="flex items-start gap-3">
        <Badge tone={tone === "danger" ? "danger" : tone === "default" ? "default" : "warning"}>
          {title}
        </Badge>
        <p className="leading-6">{message}</p>
      </div>
    </div>
  );
}
