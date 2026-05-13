import { Label } from "@/components/ui/label";

export function Field({
  label,
  description,
  children
}: {
  label: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {description ? <p className="text-xs text-slate-500">{description}</p> : null}
      {children}
    </div>
  );
}
