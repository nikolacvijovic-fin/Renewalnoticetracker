type WorkflowCard = {
  label: string;
  value: string;
  help: string;
};

type WorkflowNextAction = {
  label: string;
  help: string;
};

export function ContractWorkflowSummary({
  items,
  nextAction
}: {
  items: WorkflowCard[];
  nextAction: WorkflowNextAction;
}) {
  return (
    <div className="panel p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
            Next action
          </p>
          <p className="mt-2 text-lg font-semibold text-ink">{nextAction.label}</p>
          <p className="mt-2 max-w-2xl text-sm text-slate-600">{nextAction.help}</p>
        </div>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        {items.map((item) => (
          <div key={item.label} className="rounded-2xl border border-slate-200 bg-white p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
              {item.label}
            </p>
            <p className="mt-2 text-base font-semibold text-ink">{item.value}</p>
            <p className="mt-2 text-sm text-slate-600">{item.help}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
