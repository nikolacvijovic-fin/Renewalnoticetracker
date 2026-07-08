declare module "@/scripts/verify-p0-e2e-fixtures.mjs" {
  export class P0FixtureVerificationError extends Error {
    issues: string[];
    constructor(message: string, issues?: string[]);
  }

  export function redactP0FixtureMessage(
    message: unknown,
    env?: Record<string, string | undefined>
  ): string;

  export function verifyP0E2EFixtures(options?: {
    env?: Record<string, string | undefined>;
    fetchImpl?: (
      input: URL,
      init?: {
        method?: string;
        headers?: Record<string, string>;
        redirect?: "manual" | "follow" | "error";
      }
    ) => Promise<{
      status: number;
      text?: () => Promise<string>;
    }>;
    required?: boolean;
    requireSecondary?: boolean;
    requireMember?: boolean;
  }): Promise<{
    ok: boolean;
    skipped: boolean;
    warnings: string[];
    checks: Array<{ name: string; status: number }>;
  }>;
}
