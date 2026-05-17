"use client";

import { useRouter, useSearchParams } from "next/navigation";

export function ProcurementAnalyticsFilters({
  options,
  current
}: {
  options: {
    departments: string[];
    owners: Array<{ user_id: string; label: string }>;
    counterparties: string[];
    dueWindows: readonly number[];
    trustStatuses: readonly string[];
  };
  current: {
    department: string;
    ownerUserId: string;
    counterpartyName: string;
    dueWindowDays: string;
    trustStatus: string;
  };
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function updateParam(param: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(param, value);
    else params.delete(param);
    router.push(`/dashboard/procurement-analytics?${params.toString()}`);
  }

  return (
    <div className="panel p-5">
      <h2 className="text-lg font-semibold text-slate-900">Portfolio filters</h2>
      <p className="mt-2 text-sm text-slate-500">
        Narrow the renewal portfolio to the contracts you need to act on now.
      </p>
      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <FilterSelect
          label="Department"
          value={current.department}
          onChange={(value) => updateParam("department", value)}
          options={options.departments.map((department) => ({
            value: department,
            label: department
          }))}
        />
        <FilterSelect
          label="Owner"
          value={current.ownerUserId}
          onChange={(value) => updateParam("owner", value)}
          options={options.owners.map((owner) => ({
            value: owner.user_id,
            label: owner.label
          }))}
        />
        <FilterSelect
          label="Counterparty"
          value={current.counterpartyName}
          onChange={(value) => updateParam("counterparty", value)}
          options={options.counterparties.map((counterparty) => ({
            value: counterparty,
            label: counterparty
          }))}
        />
        <FilterSelect
          label="Due window"
          value={current.dueWindowDays}
          onChange={(value) => updateParam("dueWindow", value)}
          options={options.dueWindows.map((days) => ({
            value: String(days),
            label: `Next ${days} days`
          }))}
        />
        <FilterSelect
          label="Trust status"
          value={current.trustStatus}
          onChange={(value) => updateParam("trustStatus", value)}
          options={options.trustStatuses.map((trustStatus) => ({
            value: trustStatus === "all" ? "" : trustStatus,
            label:
              trustStatus === "all"
                ? "All trust states"
                : trustStatus === "verified"
                  ? "Verified only"
                  : "Low confidence only"
          }))}
        />
      </div>
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <label className="space-y-1 text-sm">
      <span className="text-slate-600">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm"
      >
        <option value="">All</option>
        {options.map((option) => (
          <option key={`${label}-${option.value || "all"}`} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
