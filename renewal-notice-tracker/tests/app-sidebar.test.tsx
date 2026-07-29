import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { AppSidebar } from "@/components/layout/app-sidebar";

vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard"
}));

vi.mock("next/link", () => ({
  default: ({ href, children, className }: { href: string; children: ReactNode; className?: string }) => (
    <a href={href} className={className}>
      {children}
    </a>
  )
}));

vi.mock("@/components/layout/sign-out-button", () => ({
  SignOutButton: () => <button type="button">Sign out</button>
}));

describe("AppSidebar", () => {
  it("shows only the shipped-first customer navigation", () => {
    render(<AppSidebar />);

    expect(screen.getByRole("link", { name: /Overview/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Risk Queue/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Financial/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Procurement/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Revenue Intelligence/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Contracts/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Settings/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Pricing/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Services/i })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Admin/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Counterparties/i })).not.toBeInTheDocument();
  });
});
