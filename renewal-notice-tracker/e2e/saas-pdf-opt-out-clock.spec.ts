import { expect, test, type BrowserContext, type Page, type TestInfo } from "@playwright/test";

const baseURL = process.env.E2E_BASE_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
const cookieName = process.env.E2E_AUTH_COOKIE_NAME;
const primaryCookieValue = process.env.E2E_AUTH_COOKIE_VALUE;
const secondaryCookieValue = process.env.E2E_SECONDARY_AUTH_COOKIE_VALUE;
const pdfPath = process.env.E2E_CONTRACT_INTELLIGENCE_PDF_PATH;
const configured = Boolean(cookieName && primaryCookieValue && secondaryCookieValue && pdfPath);
const required = process.env.E2E_REQUIRE_SAAS_PDF_CLOCK === "1";

if (required && !configured) {
  throw new Error("Required SaaS PDF Opt-Out Clock browser acceptance configuration is incomplete.");
}

async function authenticate(context: BrowserContext, cookieValue: string) {
  await context.addCookies([{ name: cookieName!, value: cookieValue, url: baseURL, path: "/" }]);
}

async function screenshot(page: Page, testInfo: TestInfo, name: string) {
  await page.screenshot({ path: testInfo.outputPath(`${name}.png`), fullPage: true });
}

async function fillIfBlank(form: ReturnType<Page["locator"]>, name: string, value: string) {
  const field = form.locator(`[name="${name}"]`);
  await expect(field).toBeVisible();
  if (!(await field.inputValue())) await field.fill(value);
}

test.describe("SaaS PDF upload to Opt-Out Clock", () => {
  test.skip(!configured, "Authenticated staging sessions and a synthetic PDF are not configured.");

  test.beforeEach(async ({ context }) => {
    await authenticate(context, primaryCookieValue!);
  });

  test("persists processing across refresh, requires review, activates once, and denies another organization", async ({
    page,
    browser
  }, testInfo) => {
    test.setTimeout(240_000);
    const contractTitle = `SaaS PDF Clock E2E ${Date.now()}`;
    const sensitiveConsoleMessages: string[] = [];
    page.on("console", (message) => {
      if (/service.role|supabase.*key|authorization:\s*bearer|raw contract text/i.test(message.text())) {
        sensitiveConsoleMessages.push(message.text());
      }
    });

    await page.goto("/dashboard/saas-opt-out-clock/pdf-upload");
    await expect(page.getByRole("heading", { name: /upload contract pdfs/i })).toBeVisible();
    await screenshot(page, testInfo, "01-empty-uploader-desktop");

    await page.locator('input[type="file"]').setInputFiles(pdfPath!);
    await screenshot(page, testInfo, "02-pdf-selected-desktop");

    const uploadResponsePromise = page.waitForResponse((response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname === "/api/contracts/pdf-upload"
    );
    await page.getByRole("button", { name: /upload 1 pdf/i }).click();
    const uploadResponse = await uploadResponsePromise;
    expect(uploadResponse.status()).toBe(202);
    expect(uploadResponse.headers()["cache-control"]).toContain("no-store");
    const uploadResult = await uploadResponse.json() as {
      ok: boolean;
      contractId?: string;
      uploadAttemptId?: string;
      jobId?: string;
      extractionStatus?: string;
    };
    expect(uploadResult).toMatchObject({ ok: true, extractionStatus: "processing" });
    expect(uploadResult.contractId).toBeTruthy();
    expect(uploadResult.uploadAttemptId).toBeTruthy();
    expect(uploadResult.jobId).toBeTruthy();
    await expect(page.getByRole("progressbar", { name: /extracting renewal fields progress/i })).toBeVisible();
    await screenshot(page, testInfo, "03-background-extraction-desktop");

    await page.waitForFunction(() => {
      const raw = sessionStorage.getItem("noticecontrol:saas-pdf-upload-attempts");
      return Boolean(raw && JSON.parse(raw).length === 1);
    });
    await page.reload();
    await expect(page.getByText(/recovered pdf upload|ready for human review/i).first()).toBeVisible();
    await expect(page.getByRole("link", { name: /review contract/i })).toBeVisible({ timeout: 180_000 });
    await expect(page.getByText(/ready for human review/i)).toBeVisible({ timeout: 180_000 });
    await screenshot(page, testInfo, "04-recovered-attempt-desktop");

    const contractPath = await page.getByRole("link", { name: /review contract/i }).getAttribute("href");
    expect(contractPath).toMatch(/^\/dashboard\/contracts\/[0-9a-f-]+$/i);
    await page.goto(contractPath!);
    const reviewForm = page.locator("form").filter({
      has: page.getByRole("button", { name: "Save review" })
    });
    await expect(reviewForm).toBeVisible();
    await reviewForm.locator('[name="contract_title"]').fill(contractTitle);
    await reviewForm.locator('[name="counterparty_name"]').fill("NoticeControl E2E Vendor");
    await fillIfBlank(reviewForm, "renewal_date", "2027-12-31");
    await fillIfBlank(reviewForm, "expiration_date", "2027-12-31");
    await fillIfBlank(reviewForm, "notice_deadline_date", "2027-11-30");
    await reviewForm.locator('[name="auto_renewal"]').selectOption("true");
    await reviewForm.locator('[name="contract_value_amount"]').fill("12000");
    await reviewForm.locator('[name="contract_value_currency"]').fill("EUR");
    const owner = reviewForm.locator('[name="owner_user_id"]');
    const firstOwner = await owner.locator('option:not([value=""])').first().getAttribute("value");
    expect(firstOwner).toBeTruthy();
    await owner.selectOption(firstOwner!);
    await reviewForm.locator('[name="needs_review"]').selectOption("false");
    await reviewForm.locator('[name="review_reason"]').fill(
      "Synthetic staging contract reviewed for SaaS PDF Opt-Out Clock acceptance."
    );
    await screenshot(page, testInfo, "05-review-required-contract-desktop");
    await reviewForm.getByRole("button", { name: "Save review" }).click();

    await expect(page.getByText("Reviewed and ready")).toBeVisible({ timeout: 30_000 });
    const activationForm = page.locator("form").filter({
      has: page.getByRole("button", { name: /activate for opt-out clock/i })
    });
    const candidateSelect = activationForm.locator('[name="software_id"]');
    if (await candidateSelect.count()) {
      const firstCandidate = await candidateSelect.locator('option:not([value=""])').first().getAttribute("value");
      expect(firstCandidate).toBeTruthy();
      await candidateSelect.selectOption(firstCandidate!);
    }
    await screenshot(page, testInfo, "06-activation-selection-desktop");
    await activationForm.getByRole("button", { name: /activate for opt-out clock/i }).click();
    await expect(page.getByText(contractTitle).first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/SaaS opt-out|Notice-only/).first()).toBeVisible();

    await page.goto("/dashboard/saas-opt-out-clock");
    const matchingClockRows = page.locator("tbody tr").filter({ hasText: contractTitle });
    await expect(matchingClockRows).toHaveCount(1);
    await expect(matchingClockRows).toContainText(/EUR|€/);
    await expect(matchingClockRows).toContainText(/2027-11-30|Nov 30, 2027|30 Nov 2027/);
    await screenshot(page, testInfo, "07-populated-clock-desktop");
    await page.setViewportSize({ width: 390, height: 844 });
    await screenshot(page, testInfo, "08-populated-clock-mobile");

    const calendarDownload = page.waitForEvent("download");
    await page.getByRole("link", { name: /download opt-out calendar/i }).click();
    expect((await calendarDownload).suggestedFilename()).toBe("noticecontrol-saas-opt-out-deadlines.ics");

    const secondaryContext = await browser.newContext({ baseURL });
    await authenticate(secondaryContext, secondaryCookieValue!);
    const secondaryPage = await secondaryContext.newPage();
    const attemptResponse = await secondaryPage.request.get(
      `/api/contracts/pdf-upload?attemptId=${uploadResult.uploadAttemptId}`
    );
    expect([403, 404]).toContain(attemptResponse.status());
    await secondaryPage.goto(contractPath!);
    await expect(secondaryPage.getByText(/not found|forbidden|unauthorized|could not be found/i)).toBeVisible();
    await secondaryContext.close();
    expect(sensitiveConsoleMessages).toEqual([]);
  });
});
