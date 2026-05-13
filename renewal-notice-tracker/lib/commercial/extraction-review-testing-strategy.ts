export type ExtractionReviewTestArea = {
  area: string;
  whatMustBeTested: string[];
  dangerousFailures: string[];
  howToTestConfidenceReviewBehavior: string[];
  mustBlockRelease: string[];
};

export const extractionReviewTestingAreas: ExtractionReviewTestArea[] = [
  {
    area: "text extraction success/failure",
    whatMustBeTested: [
      "successful text extraction persists usable source text or extracted document context",
      "extraction failures record processing errors visibly",
      "failed extraction still leaves the contract in a safe reviewable or diagnosable state"
    ],
    dangerousFailures: [
      "text extraction fails silently and the user sees an apparently normal contract",
      "empty or partial text is treated as fully extracted",
      "operators cannot see why extraction failed"
    ],
    howToTestConfidenceReviewBehavior: [
      "seed provider success and failure responses and verify needs_review or failure state is set correctly",
      "verify failed text extraction never results in trusted dates without review",
      "verify low-text/empty-text results create visible uncertainty"
    ],
    mustBlockRelease: [
      "silent extraction failure",
      "contract appears trusted after text extraction failure"
    ]
  },
  {
    area: "field extraction success/failure",
    whatMustBeTested: [
      "field extraction persists expected metadata fields when provider returns valid data",
      "field extraction failures are recorded and surfaced",
      "partial field extraction behaves predictably rather than fabricating completeness"
    ],
    dangerousFailures: [
      "wrong notice or renewal dates are treated as valid with no review warning",
      "field extraction failure clears or corrupts otherwise valid metadata",
      "partially extracted records look complete"
    ],
    howToTestConfidenceReviewBehavior: [
      "seed exact field-level extraction payloads with mixed success/failure",
      "verify missing high-value fields keep contract in review-oriented state",
      "verify low-confidence outputs do not skip review"
    ],
    mustBlockRelease: [
      "bad extracted dates become trusted automatically",
      "field extraction failure is hidden from review flow"
    ]
  },
  {
    area: "fallback metadata behavior",
    whatMustBeTested: [
      "fallback metadata is applied only where explicitly intended",
      "fallback values do not masquerade as reviewed or high-confidence extracted values",
      "fallback metadata remains distinguishable from extracted and reviewed metadata"
    ],
    dangerousFailures: [
      "fallback defaults create false operational certainty",
      "fallback metadata overwrites real extracted values incorrectly",
      "users cannot tell the record is running on fallback assumptions"
    ],
    howToTestConfidenceReviewBehavior: [
      "exercise extraction paths that return partial metadata and verify fallback markers",
      "verify fallback values still leave record requiring review when appropriate",
      "verify UI/state distinguishes fallback from reviewed truth"
    ],
    mustBlockRelease: [
      "fallback metadata is treated as trusted reviewed data",
      "fallback overwrites valid extracted metadata silently"
    ]
  },
  {
    area: "low-confidence handling",
    whatMustBeTested: [
      "low-confidence extracted fields are persisted with their confidence context",
      "low-confidence contracts are routed into needs-review workflow",
      "confidence thresholds do not accidentally mark uncertain results as safe"
    ],
    dangerousFailures: [
      "low-confidence extraction is hidden or collapsed into a normal-looking record",
      "confidence values are lost before review",
      "different fields with different confidence are flattened into one misleading state"
    ],
    howToTestConfidenceReviewBehavior: [
      "seed low-confidence field payloads and verify review flags, badges, and status behavior",
      "test mixed-confidence records where one critical date is uncertain",
      "verify low-confidence records do not generate trusted automation without review"
    ],
    mustBlockRelease: [
      "low-confidence records bypass review",
      "critical uncertain dates drive reminders before human review"
    ]
  },
  {
    area: "needs_review logic",
    whatMustBeTested: [
      "contracts needing review are marked consistently across upload, extraction, and partial extraction paths",
      "needs_review clears only after proper review completion",
      "needs_review counts and queues reflect real state"
    ],
    dangerousFailures: [
      "contract escapes review queue while still uncertain",
      "reviewed contract stays stuck in needs_review incorrectly",
      "dashboard understates review backlog"
    ],
    howToTestConfidenceReviewBehavior: [
      "test transitions from extracted to needs_review to reviewed state",
      "verify missing required trust fields force needs_review",
      "verify review completion clears needs_review only when required fields are resolved"
    ],
    mustBlockRelease: [
      "uncertain contract missing from review queue",
      "needs_review clears without actual review completion"
    ]
  },
  {
    area: "evidence/source snippet persistence",
    whatMustBeTested: [
      "evidence rows persist correct field-to-snippet mapping",
      "confidence values remain attached to the correct evidence row",
      "empty or invalid evidence is suppressed cleanly"
    ],
    dangerousFailures: [
      "wrong source snippet is shown for a field",
      "confidence is attached to the wrong evidence",
      "reviewers are shown fabricated or mismatched evidence"
    ],
    howToTestConfidenceReviewBehavior: [
      "seed multiple extracted fields with distinct snippets and confidence values",
      "verify sparse evidence does not scramble row ordering or associations",
      "verify review form shows evidence that matches persisted field data"
    ],
    mustBlockRelease: [
      "evidence points to the wrong clause/snippet for critical dates",
      "confidence metadata becomes detached from field evidence"
    ]
  },
  {
    area: "review save behavior",
    whatMustBeTested: [
      "review submission persists manual corrections",
      "review save updates evidence and status consistently",
      "invalid review submissions fail safely without partial writes"
    ],
    dangerousFailures: [
      "review appears saved but metadata is stale",
      "partial review write corrupts contract state",
      "manual corrections are lost after save"
    ],
    howToTestConfidenceReviewBehavior: [
      "submit review with corrected dates and verify they become canonical values",
      "submit invalid review payloads and verify no partial persistence",
      "verify reviewed data supersedes extracted uncertainty"
    ],
    mustBlockRelease: [
      "review save drops or ignores reviewer corrections",
      "review save partially writes contract and reminder state"
    ]
  },
  {
    area: "reminder regeneration after review",
    whatMustBeTested: [
      "system reminders regenerate from reviewed dates after review save",
      "stale generated reminders are replaced safely",
      "manual reminders are preserved across regeneration"
    ],
    dangerousFailures: [
      "reminders stay based on extracted guesses after review correction",
      "manual reminders are deleted or duplicated",
      "new reviewed dates do not flow into reminder schedule"
    ],
    howToTestConfidenceReviewBehavior: [
      "review a contract with corrected dates and inspect generated reminders afterward",
      "compare reminder sets before and after review save",
      "verify regenerated reminders reflect reviewed truth, not extracted confidence state"
    ],
    mustBlockRelease: [
      "reviewed corrections do not update system reminders",
      "manual reminders are destroyed by review regeneration"
    ]
  },
  {
    area: "status transitions after review",
    whatMustBeTested: [
      "review completion moves contract into correct next status",
      "partial or incomplete review does not produce reviewed/active state incorrectly",
      "manual and extracted contracts follow expected review transition rules"
    ],
    dangerousFailures: [
      "contract is marked reviewed/active without sufficient data",
      "reviewed contract remains in incorrect stale state",
      "status transitions diverge between similar review outcomes"
    ],
    howToTestConfidenceReviewBehavior: [
      "test complete vs incomplete review outcomes on extracted and manual contracts",
      "verify status transition logic aligns with trust rules and needs_review clearing",
      "verify terminal or downstream states are not entered prematurely"
    ],
    mustBlockRelease: [
      "incomplete review yields trusted active status",
      "reviewed contract stays in wrong workflow state"
    ]
  },
  {
    area: "edge cases with missing dates / unclear clauses",
    whatMustBeTested: [
      "records missing notice or expiration dates fail safely",
      "unclear clause scenarios stay review-oriented and do not over-automate",
      "mixed date availability still produces understandable UI and workflow state"
    ],
    dangerousFailures: [
      "app invents a reminder schedule from unclear or absent dates",
      "user sees false precision on unclear clause extraction",
      "missing dates silently break downstream workflows without warning"
    ],
    howToTestConfidenceReviewBehavior: [
      "seed contracts with one date missing, both dates missing, or ambiguous snippets",
      "verify these records remain visibly uncertain and need review",
      "verify no trusted reminder automation is created from ambiguous inputs unless policy allows safely"
    ],
    mustBlockRelease: [
      "ambiguous or missing-date contracts generate trusted reminders silently",
      "unclear clause handling presents false confidence"
    ]
  },
  {
    area: "manual corrections overriding extraction",
    whatMustBeTested: [
      "reviewer-entered values supersede extracted values in canonical metadata",
      "subsequent views, exports, ICS, and reminders use corrected values",
      "old extracted values do not reappear after save or refresh"
    ],
    dangerousFailures: [
      "manual correction is saved visually but extracted value still drives downstream behavior",
      "export/ICS uses stale extracted value instead of reviewed correction",
      "reviewed correction is overwritten on later processing"
    ],
    howToTestConfidenceReviewBehavior: [
      "correct key dates during review and then verify list/detail/export/reminder outputs",
      "refresh/reload after save and confirm corrected values remain canonical",
      "verify source evidence remains informative without replacing reviewed truth"
    ],
    mustBlockRelease: [
      "manual correction does not become canonical source of truth",
      "downstream automation uses stale extracted values after review"
    ]
  },
  {
    area: "template defaults applied to extracted records",
    whatMustBeTested: [
      "template defaults apply predictably to extracted records without masking uncertainty",
      "template offsets and defaults do not override reviewed or explicit extracted values incorrectly",
      "template-driven reminders remain explainable after review"
    ],
    dangerousFailures: [
      "template defaults make extracted record look more certain than it is",
      "template offsets override corrected dates",
      "template application creates opaque reminder behavior users cannot trace"
    ],
    howToTestConfidenceReviewBehavior: [
      "apply templates to partially extracted and fully reviewed contracts and compare behavior",
      "verify templates supplement but do not silently replace trusted reviewed values",
      "verify extracted records with low confidence still show need for review after template application"
    ],
    mustBlockRelease: [
      "template defaults override reviewed truth silently",
      "template application creates false confidence on low-confidence extracted records"
    ]
  }
];

export const extractionReviewReleaseBlockers = [
  "Silent extraction or field-extraction failure.",
  "Low-confidence or ambiguous records bypass review.",
  "Fallback metadata is treated as trusted reviewed data.",
  "Wrong evidence or source snippets are shown for critical dates.",
  "Review save drops reviewer corrections or writes partial state.",
  "Reviewed corrections do not update reminders and downstream workflow state.",
  "Incomplete review yields trusted active status.",
  "Missing or unclear dates generate trusted reminder automation silently.",
  "Manual corrections do not become the canonical source of truth.",
  "Template defaults override reviewed truth or create false confidence."
];

