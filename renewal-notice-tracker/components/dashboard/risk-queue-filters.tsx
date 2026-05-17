"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { getRiskTrustFilterLabel, type RiskQueueBandFilter, type RiskQueueTrustFilter } from "@/lib/intelligence/risk/dashboard";

export function RiskQueueFilters({
  options,
  current
}: {
  options: {
    owners: Array<{ user_id: string; label: string }>;
    departments: string[];
    riskBands: readonly RiskQueueBandFilter[];
    dueWindows: readonly number[];
    trustStatuses: readonly RiskQueueTrustFilter[];
  };
  current: {
    ownerUserId: string;
    department: string;
    riskBand: RiskQueueBandFilter;
    dueWindowDays: string;
    trustStatus: RiskQueueTrustFilter;
  };
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function updateParam(param: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(param, value);
    else params.delete(param);
    router.push(`/dashboard/risk-queue?${params.toString()}`);
  }

  return (
    <div className="panel p-5">
      <h2 className="text-lg font-semibold text-slate-900">Queue filters</h2>
      <p className="mt-2 text-sm text-slate-500">
        Narrow the queue to the contracts that need review, ownership, acknowledgment, or decision work next.
      </p>
      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <FilterSelect
          label="Risk band"
          value={current.riskBand === "all" ? "" : current.riskBand}
          onChange={(value) => updateParam("riskBand", value)}
          options={options.riskBands
            .filter((riskBand) => riskBand !== "all")
            .map((riskBand) => ({
              value: riskBand,
              label:
                riskBand === "critical"
                  ? "Critical"
                  : riskBand === "high"
                    ? "High"
                    : riskBand === "medium"
                      ? "Medium"
                      : "Low"
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
          label="Owner"
          value={current.ownerUserId}
          onChange={(value) => updateParam("owner", value)}
          options={options.owners.map((owner) => ({
            value: owner.user_id,
            label: owner.label
          }))}
        />
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
          label="Trust status"
          value={current.trustStatus === "all" ? "" : current.trustStatus}
          onChange={(value) => updateParam("trustStatus", value)}
          options={options.trustStatuses.map((trustStatus) => ({
            value: trustStatus === "all" ? "" : trustStatus,
            label: getRiskTrustFilterLabel(trustStatus)
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
