import { expect, test } from "@playwright/test";

const baseURL =
  process.env.E2E_BASE_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
const authCookieName = process.env.E2E_AUTH_COOKIE_NAME;
const authCookieValue = process.env.E2E_AUTH_COOKIE_VALUE;
const secondaryAuthCookieValue = process.env.E2E_SECONDARY_AUTH_COOKIE_VALUE;
const memberAuthCookieValue = process.env.E2E_MEMBER_AUTH_COOKIE_VALUE;
const foreignContractPath = process.env.E2E_FOREIGN_CONTRACT_PATH ?? "/dashboard/contracts/foreign";
const reviewPath = process.env.E2E_REVIEW_CONTRACT_PATH ?? "/dashboard/contracts/review-target";
const seededForeignContractPathConfigured = Boolean(process.env.E2E_FOREIGN_CONTRACT_PATH);
const seededReviewPathConfigured = Boolean(process.env.E2E_REVIEW_CONTRACT_PATH);
const p0ContractTitle =
  process.env.E2E_P0_CONTRACT_TITLE ?? `P0 Renewal Workflow ${Date.now()}`;
const requireAuth = process.env.E2E_REQUIRE_AUTH === "1";
const primaryAuthConfigured = Boolean(authCookieName && authCookieValue);

if (requireAuth && !primaryAuthConfigured) {
  throw new Error("P0 E2E auth is required, but the primary auth cookie is not configured.");
}

if (requireAuth && !secondaryAuthCookieValue) {
  throw new Error("P0 E2E auth is required, but the secondary auth cookie is not configured.");
}

if (requireAuth && (!seededForeignContractPathConfigured || !seededReviewPathConfigured)) {
  throw new Error(
    "P0 E2E required mode needs E2E_REVIEW_CONTRACT_PATH and E2E_FOREIGN_CONTRACT_PATH seeded fixtures."
  );
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

  test("@p0 authenticated user reaches the dashboard", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.getByRole("heading", { name: /dashboard/i })).toBeVisible();
    await expect(page.getByText(/defense file reviewed|owner accountability|opt-out clock exposure/i)).toBeVisible();
  });

  test("@p0 manual contract -> review -> reminder state -> renewal decision", async ({ page }) => {
    await page.goto("/dashboard/contracts/new");
    await expect(page).toHaveURL(/\/dashboard\/contracts\/new/);
    await expect(page.getByRole("heading", { name: /upload contract/i })).toBeVisible();

    const manualForm = page.locator("form").filter({
      hasText: /secondary path: manual contract entry/i
    });
    await expect(manualForm.getByRole("button", { name: /save manual contract/i })).toBeEnabled();
    await manualForm.getByLabel(/contract title/i).fill(p0ContractTitle);
    await manualForm.getByLabel(/counterparty/i).fill("P0 Vendor Ltd");
    await manualForm.getByLabel(/reminder recipients/i).fill("p0-recipient@example.com");
    await manualForm.getByLabel(/notice deadline/i).fill("2030-11-15");
    await manualForm.getByLabel(/renewal date/i).fill("2030-12-15");
    await manualForm.getByLabel(/expiration date/i).fill("2031-01-15");
    await manualForm.getByLabel(/auto renewal/i).selectOption("true");

    const ownerSelect = manualForm.locator('select[name="owner_user_id"]');
    const ownerOptions = await ownerSelect.locator("option").count();
    if (ownerOptions > 1) {
      await ownerSelect.selectOption({ index: 1 });
    }

    await manualForm.getByRole("button", { name: /save manual contract/i }).click();
    await expect(page).toHaveURL(/\/dashboard\/contracts\//);
    await expect(page.getByRole("button", { name: /save review/i })).toBeVisible();

    await page.getByLabel(/expiration date/i).fill("2031-01-15");
    await page.getByLabel(/review outcome/i).selectOption("false");
    await page
      .getByLabel(/exception review reason/i)
      .fill("P0 E2E reviewer confirmed renewal-control dates and owner assignment.");
    await page.getByRole("button", { name: /save review/i }).click();

    await expect(page.getByText(/reminders scheduled|review complete|reviewed/i)).toBeVisible();
    await page.getByLabel(/status/i).selectOption("renew");
    await page.getByLabel(/decision date/i).fill("2030-10-01");
    await page
      .getByLabel(/summary/i)
      .fill("P0 E2E decision recorded before the opt-out and renewal window.");
    await page.getByLabel(/next steps/i).fill("Confirm renewal owner\nReview renewal budget");
    await page.getByRole("button", { name: /save decision/i }).click();

    await expect(page.getByText(/renew|decision/i)).toBeVisible();
  });

  test("@p0 review correction regenerates reminders and updates downstream state", async ({
    page
  }) => {
    await page.goto(reviewPath);

    await expect(page.getByRole("heading", { name: /contract detail|review/i })).toBeVisible();
    await page.getByLabel(/expiration date/i).fill("2031-01-15");
    await page.getByLabel(/review outcome/i).selectOption("false");
    await page
      .getByLabel(/exception review reason/i)
      .fill("P0 E2E review correction confirms reminder-driving fields.");
    await page.getByRole("button", { name: /save review/i }).click();

    await expect(page.getByText(/reminders scheduled|review complete|reviewed/i)).toBeVisible();
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
