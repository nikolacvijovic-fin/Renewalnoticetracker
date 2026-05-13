import { expect, test } from "@playwright/test";

const baseURL =
  process.env.E2E_BASE_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
const authCookieName = process.env.E2E_AUTH_COOKIE_NAME;
const authCookieValue = process.env.E2E_AUTH_COOKIE_VALUE;
const shouldSkip = !authCookieName || !authCookieValue;

test.describe("Phase 3 operational workflows", () => {
  test.skip(shouldSkip, "E2E auth cookie not configured.");

  test.beforeEach(async ({ context }) => {
    await context.addCookies([
      {
        name: authCookieName!,
        value: authCookieValue!,
        url: baseURL,
        path: "/"
      }
    ]);
  });

  test("bulk import creates a visible import job", async ({ page }) => {
    await page.goto("/dashboard/contracts/new");

    const importPanel = page.getByRole("heading", { name: "Bulk spreadsheet import" }).locator("..");
    await importPanel
      .locator('input[type="file"][name="file"]')
      .setInputFiles({
        name: "phase3_import.csv",
        mimeType: "text/csv",
        buffer: Buffer.from("contract_title,expiration_date\nPhase 3 MSA,2030-01-01")
      });
    await importPanel.getByRole("button", { name: "Import contracts" }).click();

    await page.goto("/dashboard/admin");
    await expect(page.getByRole("heading", { name: "Recent import jobs" })).toBeVisible();
    await expect(page.getByText("phase3_import.csv")).toBeVisible();
  });
});
