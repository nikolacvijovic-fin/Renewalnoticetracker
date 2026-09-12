import type { ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import AuthPage from "@/app/auth/page";

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  )
}));

describe("AuthPage", () => {
  it("renders sign-in and sign-up sections safely", async () => {
    render(
      await AuthPage({
        searchParams: Promise.resolve({
          message: "Check your inbox.",
          source: "pricing_growth_cta"
        })
      })
    );

    expect(screen.getByText("Sign in")).toBeInTheDocument();
    expect(screen.getByText("Create account")).toBeInTheDocument();
    expect(screen.getByText("Check your inbox.")).toBeInTheDocument();
    expect(screen.getByText("Reset password")).toBeInTheDocument();
  });
});
