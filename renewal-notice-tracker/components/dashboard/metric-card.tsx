export function MetricCard({
  label,
  value,
  accent,
  description
}: {
  label: string;
  value: number | string;
  accent: string;
  description?: string;
}) {
  return (
    <div className="panel p-5 ring-1 ring-white/70">
      <div className={`mb-4 h-2 w-16 rounded-full ${accent}`} />
      <p className="text-sm font-medium text-muted">{label}</p>
      <p className="mt-2 text-3xl font-semibold tracking-tight text-ink">{value}</p>
      {description ? <p className="mt-2 text-xs leading-5 text-muted">{description}</p> : null}
    </div>
  );
}
