export function MetricCard({
  label,
  value,
  accent
}: {
  label: string;
  value: number | string;
  accent: string;
}) {
  return (
    <div className="panel p-5">
      <div className={`mb-4 h-2 w-16 rounded-full ${accent}`} />
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-2 text-3xl font-semibold">{value}</p>
    </div>
  );
}
