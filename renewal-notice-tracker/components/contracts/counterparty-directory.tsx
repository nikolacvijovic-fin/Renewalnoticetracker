export function CounterpartyDirectory({
  counterparties
}: {
  counterparties: Array<{
    id: string;
    name: string;
    contact_email: string | null;
    contact_name: string | null;
    notes: string | null;
  }>;
}) {
  return (
    <div className="panel p-6">
      <h2 className="text-lg font-semibold">Counterparty directory</h2>
      <div className="mt-4 space-y-4">
        {counterparties.length > 0 ? (
          counterparties.map((counterparty) => (
            <div key={counterparty.id} className="rounded-xl border border-slate-200 p-4">
              <p className="font-medium">{counterparty.name}</p>
              <p className="mt-1 text-sm text-slate-500">
                {counterparty.contact_name ?? "No contact"} • {counterparty.contact_email ?? "No email"}
              </p>
              {counterparty.notes ? <p className="mt-2 text-sm text-slate-600">{counterparty.notes}</p> : null}
            </div>
          ))
        ) : (
          <p className="text-sm text-slate-500">No counterparties yet.</p>
        )}
      </div>
    </div>
  );
}
