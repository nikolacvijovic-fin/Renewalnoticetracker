import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import ResetPasswordPage from "@/app/auth/reset/page";
import UpdatePasswordPage from "@/app/auth/update-password/page";

describe("password recovery pages", () => {
  it("keeps reset password framed as a secondary scaffold", () => {
    render(<ResetPasswordPage searchParams={{}} />);

    expect(screen.getByText(/scaffolded recovery flow/i)).toBeInTheDocument();
    expect(screen.getByText(/enable password-based auth later/i)).toBeInTheDocument();
  });

  it("keeps update-password framed as a secondary recovery route", () => {
    render(<UpdatePasswordPage searchParams={{}} />);

    expect(screen.getByText(/after a supabase recovery link/i)).toBeInTheDocument();
    expect(screen.getByText(/if your workspace enables password auth/i)).toBeInTheDocument();
  });
});
