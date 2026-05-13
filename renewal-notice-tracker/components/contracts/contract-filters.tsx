"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { CONTRACT_FILTERS } from "@/lib/constants";
import { cn } from "@/lib/utils";

export function ContractFilters({
  facets,
  current: currentFilters
}: {
  facets: {
    owners: Array<{ user_id: string; label: string }>;
    departments: string[];
    statusTags: string[];
  };
  current: {
    filter: string;
    owner: string;
    department: string;
    statusTag: string;
  };
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const current = currentFilters.filter || searchParams.get("filter") || "all";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {CONTRACT_FILTERS.map((filter) => (
          <button
            key={filter}
            type="button"
            onClick={() => {
              const params = new URLSearchParams(searchParams.toString());
              if (filter === "all") params.delete("filter");
              else params.set("filter", filter);
              router.push(`/dashboard/contracts?${params.toString()}`);
            }}
            className={cn(
              "rounded-full px-3 py-1.5 text-sm font-medium capitalize",
              current === filter
                ? "bg-brand-700 text-white"
                : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"
            )}
          >
            {filter.replace("_", " ")}
          </button>
        ))}
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        <FilterSelect
          label="Owner"
          param="owner"
          options={facets.owners.map((owner) => ({ value: owner.user_id, label: owner.label }))}
          currentValue={currentFilters.owner}
        />
        <FilterSelect
          label="Department"
          param="department"
          options={facets.departments.map((department) => ({ value: department, label: department }))}
          currentValue={currentFilters.department}
        />
        <FilterSelect
          label="Status tag"
          param="statusTag"
          options={facets.statusTags.map((statusTag) => ({
            value: statusTag,
            label: statusTag.replaceAll("_", " ")
          }))}
          currentValue={currentFilters.statusTag}
        />
      </div>
    </div>
  );
}

function FilterSelect({
  label,
  param,
  options,
  currentValue
}: {
  label: string;
  param: string;
  options: Array<{ value: string; label: string }>;
  currentValue: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  return (
    <label className="space-y-1 text-sm">
      <span className="text-slate-600">{label}</span>
      <select
        value={currentValue}
        onChange={(event) => {
          const params = new URLSearchParams(searchParams.toString());
          if (event.target.value) params.set(param, event.target.value);
          else params.delete(param);
          router.push(`/dashboard/contracts?${params.toString()}`);
        }}
        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm"
      >
        <option value="">All</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
