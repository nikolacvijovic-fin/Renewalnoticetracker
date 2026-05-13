import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

describe("ServicesPage", () => {
  it("keeps only the trimmed services surface", async () => {
    const Page = (await import("@/app/(marketing)/services/page")).default;
    render(await Page());

    expect(screen.getByText("Onboarding Setup")).toBeInTheDocument();
    expect(screen.getByText("Import Cleanup")).toBeInTheDocument();
    expect(screen.getByText("Renewal Ops Setup")).toBeInTheDocument();
    expect(screen.queryByText("Quarterly Review Package")).not.toBeInTheDocument();
    expect(screen.queryByText("Reporting Package")).not.toBeInTheDocument();
    expect(screen.queryByText("Admin / Training Package")).not.toBeInTheDocument();
  });
});
