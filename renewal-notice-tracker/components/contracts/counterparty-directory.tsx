export function CounterpartyDirectory({
  counterparties
}: {
  counterparties: Array<{
    id: string;
    raw_counterparty_name: string;
    normalized_counterparty_name: string;
    contract_count: number;
    alias_names: string[];
    duplicate_suggestions: Array<{ id: string; raw_counterparty_name: string; score: number }>;
  }>;
}) {
  return (
    <div className="panel p-6">
      <h2 className="text-lg font-semibold">Vendor identity cleanup</h2>
      <p className="mt-1 text-sm text-slate-500">
        Keep vendor names clean enough for renewal control without turning this into a company
        directory.
      </p>
      <div className="mt-4 space-y-4">
        {counterparties.length > 0 ? (
          counterparties.map((counterparty) => (
            <div key={counterparty.id} className="rounded-xl border border-slate-200 p-4">
              <p className="font-medium">{counterparty.raw_counterparty_name}</p>
              <p className="mt-1 text-sm text-slate-500">
                Normalized as {counterparty.normalized_counterparty_name || "not set"} |{" "}
                {counterparty.contract_count} linked contracts
              </p>
              {counterparty.alias_names.length > 0 ? (
                <p className="mt-2 text-sm text-slate-600">
                  Aliases: {counterparty.alias_names.join(", ")}
                </p>
              ) : null}
              {counterparty.duplicate_suggestions.length > 0 ? (
                <p className="mt-2 text-sm text-amber-700">
                  Possible duplicates:{" "}
                  {counterparty.duplicate_suggestions
                    .map((suggestion) => suggestion.raw_counterparty_name)
                    .join(", ")}
                </p>
              ) : null}
            </div>
          ))
        ) : (
          <p className="text-sm text-slate-500">No vendor identities need cleanup yet.</p>
        )}
      </div>
    </div>
  );
}
