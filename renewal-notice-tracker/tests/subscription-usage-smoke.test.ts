import { describe, expect, it } from "vitest";
import { buildMicrosoft365AdminConsentUrl, verifyMicrosoft365AdminConsentState } from "@/lib/subscription-usage/microsoft365";
import { buildGoogleWorkspaceAuthorizationUrl, verifyGoogleWorkspaceAuthorizationState } from "@/lib/subscription-usage/google-workspace";
import { prepareSubscriptionUsageFindingReview } from "@/lib/subscription-usage/findings";
import { runClaimedConnectionsWithBoundedConcurrency } from "@/lib/subscription-usage/scheduled-sync";

describe("subscription usage deployment smoke fixtures", () => {
  it("validates Microsoft and Google callback state fixtures", () => {
    const issuedAt = "2026-08-17T10:00:00.000Z";
    const microsoftState = { organizationId: "org-1", actorUserId: "user-1", nonce: "12345678-1234-1234-1234-123456789012", issuedAt };
    const microsoft = buildMicrosoft365AdminConsentUrl({
      config: { clientId: "client-1", redirectUri: "https://app.example.test/microsoft/callback", signingSecret: "state-secret" },
      state: microsoftState
    });
    expect(microsoft.ok).toBe(true);
    if (!microsoft.ok) return;
    expect(verifyMicrosoft365AdminConsentState(new URL(microsoft.url).searchParams.get("state") ?? "", "state-secret", new Date("2026-08-17T10:01:00Z"))).toEqual(microsoftState);

    const googleState = { ...microsoftState, customerId: "C01234567", domain: "example.test", nonce: "22345678-1234-1234-1234-123456789012" };
    const google = buildGoogleWorkspaceAuthorizationUrl({
      config: { clientId: "client-1", clientSecret: "secret", redirectUri: "https://app.example.test/google/callback", signingSecret: "state-secret", credentialEncryptionKey: "a-secure-test-encryption-key-123456" },
      state: googleState
    });
    expect(google.ok).toBe(true);
    if (!google.ok) return;
    expect(verifyGoogleWorkspaceAuthorizationState(new URL(google.url).searchParams.get("state") ?? "", "state-secret", new Date("2026-08-17T10:01:00Z"))).toEqual(googleState);
  });

  it("isolates a scheduled fixture and prepares a human-reviewed finding", async () => {
    const results = await runClaimedConnectionsWithBoundedConcurrency(["microsoft", "google"], 2, async (provider) => {
      if (provider === "google") throw new Error("safe_fixture_failure");
      return provider;
    });
    expect(results.map((result) => result.status)).toEqual(["fulfilled", "rejected"]);

    const review = prepareSubscriptionUsageFindingReview({
      findingId: "finding-1",
      organizationId: "org-1",
      actorUserId: "reviewer-1",
      nextStatus: "accepted",
      acceptedAction: "reduce_seats"
    });
    expect(review).toEqual(expect.objectContaining({ allowed: true, reviewStatus: "accepted" }));
    expect(JSON.stringify(review)).not.toMatch(/token|provider.payload|user@example/i);
  });
});
