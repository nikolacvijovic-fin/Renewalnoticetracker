"use client";

import { useState, type ReactNode } from "react";

type SecondaryTab = {
  key: string;
  label: string;
  content: ReactNode;
};

function getButtonClassName(active: boolean) {
  return active
    ? "rounded-full bg-ink px-4 py-2 text-sm font-medium text-white"
    : "rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600";
}

export function ContractSecondaryTabs({
  tabs,
  defaultTabKey
}: {
  tabs: SecondaryTab[];
  defaultTabKey?: string;
}) {
  const initialTab = defaultTabKey ?? tabs[0]?.key ?? "secondary";
  const [activeTab, setActiveTab] = useState(initialTab);
  const selectedTab = tabs.find((tab) => tab.key === activeTab) ?? tabs[0];

  if (!selectedTab) {
    return null;
  }

  return (
    <div className="panel p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Secondary detail</h2>
          <p className="mt-1 text-sm text-slate-500">
            Keep evidence, notes, audit history, and processing errors available without crowding the operator workflow.
          </p>
        </div>
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Contract secondary detail">
          {tabs.map((tab) => {
            const active = tab.key === selectedTab.key;
            return (
              <button
                key={tab.key}
                type="button"
                role="tab"
                aria-selected={active}
                aria-controls={`contract-secondary-panel-${tab.key}`}
                className={getButtonClassName(active)}
                onClick={() => setActiveTab(tab.key)}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      <div
        id={`contract-secondary-panel-${selectedTab.key}`}
        role="tabpanel"
        className="mt-6"
      >
        {selectedTab.content}
      </div>
    </div>
  );
}
