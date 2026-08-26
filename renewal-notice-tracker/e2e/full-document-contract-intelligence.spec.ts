import { expect, test } from "@playwright/test";

const baseURL = process.env.E2E_BASE_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
const cookieName = process.env.E2E_AUTH_COOKIE_NAME;
const cookieValue = process.env.E2E_AUTH_COOKIE_VALUE;
const pdfPath = process.env.E2E_CONTRACT_INTELLIGENCE_PDF_PATH;
const configured = Boolean(cookieName && cookieValue && pdfPath);
const required = process.env.E2E_REQUIRE_CONTRACT_INTELLIGENCE === "1";

if (required && !configured) {
  throw new Error("Required contract-intelligence browser acceptance configuration is incomplete.");
}

test.describe("full-document commercial contract intelligence", () => {
  test.skip(!configured, "Synthetic PDF and authenticated staging cookie are not configured.");

  test.beforeEach(async ({ context }) => {
    await context.addCookies([{ name: cookieName!, value: cookieValue!, url: baseURL, path: "/" }]);
  });

  test("uploads real bytes, reviews page evidence, and produces reviewed commercial analysis", async ({ page }) => {
    test.setTimeout(180_000);
    await page.goto("/dashboard/contracts/new");
    const uploadForm = page.locator("form").filter({ hasText: /primary path: upload one contract/i });
    await uploadForm.getByLabel(/working title/i).fill(`Commercial Intelligence E2E ${Date.now()}`);
    await uploadForm.getByLabel(/contract pdf/i).setInputFiles(pdfPath!);
    await uploadForm.getByRole("button", { name: /upload and extract/i }).click();

    await expect(page).toHaveURL(/\/dashboard\/contracts\/[a-z0-9-]+/i, { timeout: 120_000 });
    await expect(page.getByText(/latest run: completed/i)).toBeVisible({ timeout: 120_000 });
    await expect(page.getByRole("link", { name: /open source evidence/i }).first()).toBeVisible();

    const requiredFields = [
      "notice_deadline_date",
      "auto_renewal",
      "contract_value_amount",
      "contract_value_currency",
      "billing_frequency",
      "fixed_uplift_percentage"
    ];
    for (const fieldKey of requiredFields) {
      const card = page.getByTestId(`extracted-field-${fieldKey}`).first();
      await expect(card, `Expected provider-backed evidence for ${fieldKey}`).toBeVisible();
      await card.getByRole("button", { name: /accept evidence/i }).click();
      await expect(page.getByTestId(`extracted-field-${fieldKey}`).first()).toContainText(/accepted/i);
    }

    const analysis = page.getByText(/commercial analysis/i).locator("..").locator("..");
    await expect(analysis).toContainText(/reviewed evidence only/i);
    await expect(analysis).not.toContainText(/annual committed cost\s+not confirmed/i);
    await expect(analysis).toContainText(/automatic renewal exposure/i);
    await expect(analysis).toContainText(/price increase exposure|automatic price uplift|uncapped or unclear price uplift/i);
    await expect(page.getByText(/realized savings/i)).toHaveCount(0);
  });
});
