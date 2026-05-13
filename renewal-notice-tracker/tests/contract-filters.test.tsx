import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ContractFilters } from "@/components/contracts/contract-filters";

const push = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push
  }),
  useSearchParams: () => new URLSearchParams("filter=all")
}));

describe("ContractFilters", () => {
  beforeEach(() => {
    push.mockReset();
    cleanup();
  });

  it("renders restored owner, department, and status-tag filters", () => {
    render(
      <ContractFilters
        facets={{
          owners: [{ user_id: "user-1", label: "Jane Doe" }],
          departments: ["Finance"],
          statusTags: ["active"]
        }}
        current={{
          filter: "all",
          owner: "",
          department: "",
          statusTag: ""
        }}
      />
    );

    expect(screen.getAllByLabelText("Owner")[0]!).toBeInTheDocument();
    expect(screen.getByLabelText("Department")).toBeInTheDocument();
    expect(screen.getByLabelText("Status tag")).toBeInTheDocument();
  });

  it("updates the route when an owner filter is selected", () => {
    render(
      <ContractFilters
        facets={{
          owners: [{ user_id: "user-1", label: "Jane Doe" }],
          departments: [],
          statusTags: []
        }}
        current={{
          filter: "all",
          owner: "",
          department: "",
          statusTag: ""
        }}
      />
    );

    fireEvent.change(screen.getAllByLabelText("Owner")[0]!, {
      target: { value: "user-1" }
    });

    expect(push).toHaveBeenCalledWith("/dashboard/contracts?filter=all&owner=user-1");
  });
});
