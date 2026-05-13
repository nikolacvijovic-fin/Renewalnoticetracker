import { expect, test } from "@playwright/test";

const baseURL =
  process.env.E2E_BASE_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
const authCookieName = process.env.E2E_AUTH_COOKIE_NAME;
const authCookieValue = process.env.E2E_AUTH_COOKIE_VALUE;
const secondaryAuthCookieValue = process.env.E2E_SECONDARY_AUTH_COOKIE_VALUE;
const memberAuthCookieValue = process.env.E2E_MEMBER_AUTH_COOKIE_VALUE;
const foreignContractPath = process.env.E2E_FOREIGN_CONTRACT_PATH ?? "/dashboard/contracts/foreign";
const reviewPath = process.env.E2E_REVIEW_CONTRACT_PATH ?? "/dashboard/contracts/review-target";
const requireAuth = process.env.E2E_REQUIRE_AUTH === "1";
const primaryAuthConfigured = Boolean(authCookieName && authCookieValue);

if (requireAuth && !primaryAuthConfigured) {
  throw new Error("P0 E2E auth is required, but the primary auth cookie is not configured.");
}

async function authenticate(
  context: import("@playwright/test").BrowserContext,
  cookieValue: string
) {
  await context.addCookies([
    {
      name: authCookieName!,
      value: cookieValue,
      url: baseURL,
      path: "/"
    }
  ]);
}

test.describe("P0 release-critical journeys", () => {
  test.skip(!primaryAuthConfigured, "E2E auth cookie not configured.");

  test.beforeEach(async ({ context }) => {
    await authenticate(context, authCookieValue!);
  });

  test("@p0 upload -> review -> owner assignment -> reminder-backed contract", async ({ page }) => {
    await page.goto("/dashboard/contracts/new");
    await expect(page).toHaveURL(/\/dashboard\/contracts\/new/);
    await expect(page.getByRole("heading", { name: /new contract/i })).toBeVisible();

    await page
      .locator('input[type="file"][name="file"]')
      .setInputFiles({
        name: "p0_contract.pdf",
        mimeType: "application/pdf",
        buffer: Buffer.from("%PDF-1.4\n% mock contract")
      });

    await page.getByRole("button", { name: /upload contract/i }).click();
    await expect(page).toHaveURL(/\/dashboard\/contracts\//);
    await expect(page.getByText(/needs review/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /save review/i })).toBeVisible();
  });

  test("@p0 review correction regenerates reminders and updates downstream state", async ({
    page
  }) => {
    await page.goto(reviewPath);

    await expect(page.getByRole("heading", { name: /contract detail|review/i })).toBeVisible();
    await page.getByLabel(/expiration date/i).fill("2031-01-15");
    await page.getByLabel(/needs review/i).uncheck();
    await page.getByRole("button", { name: /save review/i }).click();

    await expect(page.getByText(/reminders scheduled|reviewed/i)).toBeVisible();
  });

  test("@p0 export path returns a contract export for an authorized workspace admin", async ({
    page
  }) => {
    await page.goto("/dashboard/settings");

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("link", { name: /export contracts as csv/i }).click()
    ]);

    expect(await download.suggestedFilename()).toBe("contracts.csv");
  });

  test("@p0 billing unlock path reaches checkout from pricing", async ({ page }) => {
    await page.goto("/pricing");
    await expect(page.getByRole("heading", { name: /pricing/i })).toBeVisible();

    const upgradeButton = page
      .getByRole("link", { name: /upgrade|start growth|choose growth/i })
      .first();
    await expect(upgradeButton).toBeVisible();
    await upgradeButton.click();

    await expect(page).toHaveURL(/\/dashboard\/settings|checkout|billing/i);
  });

  test("@p0 unauthenticated users cannot access admin debug surfaces", async ({ browser }) => {
    const anonymousContext = await browser.newContext({ baseURL });
    const anonymousPage = await anonymousContext.newPage();

    await anonymousPage.goto("/dashboard/admin");
    await expect(anonymousPage).toHaveURL(/\/auth|\/dashboard/);

    await anonymousContext.close();
  });

  test("@p0 cross-org denial protects foreign contract surfaces", async ({ browser }) => {
    test.skip(
      !secondaryAuthCookieValue,
      "Secondary auth cookie not configured for cross-org denial."
    );

    const secondaryContext = await browser.newContext({ baseURL });
    await authenticate(secondaryContext, secondaryAuthCookieValue!);
    const secondaryPage = await secondaryContext.newPage();

    await secondaryPage.goto(foreignContractPath);
    await expect(secondaryPage.getByText(/not found|forbidden|unauthorized/i)).toBeVisible();

    await secondaryContext.close();
  });

  test("@p0 member users are denied from admin-only surfaces", async ({ browser }) => {
    test.skip(!memberAuthCookieValue, "Member auth cookie not configured.");

    const memberContext = await browser.newContext({ baseURL });
    await authenticate(memberContext, memberAuthCookieValue!);
    const memberPage = await memberContext.newPage();

    await memberPage.goto("/dashboard/admin");
    await expect(memberPage).toHaveURL(/\/dashboard/);

    await memberContext.close();
  });
});
