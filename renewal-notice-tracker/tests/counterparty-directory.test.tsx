import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { CounterpartyDirectory } from "@/components/contracts/counterparty-directory";

describe("CounterpartyDirectory", () => {
  it("frames the surface as vendor identity cleanup for renewal control", () => {
    render(
      <CounterpartyDirectory
        counterparties={[
          {
            id: "cp-1",
            raw_counterparty_name: "Acme, Inc.",
            normalized_counterparty_name: "acme",
            contract_count: 3,
            alias_names: ["Acme Europe"],
            duplicate_suggestions: [{ id: "cp-2", raw_counterparty_name: "Acme LLC", score: 100 }]
          }
        ]}
      />
    );

    expect(screen.getByRole("heading", { name: "Vendor identity cleanup" })).toBeInTheDocument();
    expect(screen.getByText(/renewal control/i)).toBeInTheDocument();
    expect(screen.queryByText(/vendor and customer contacts/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/contact email/i)).not.toBeInTheDocument();
  });
});
