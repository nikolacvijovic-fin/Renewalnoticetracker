export type DocumentProcessingSection = {
  title: string;
  summary: string;
  items: string[];
};

export const uploadSecurityRisks: DocumentProcessingSection = {
  title: "Upload security risks",
  summary: "Uploaded contracts are untrusted input and should be treated as a hostile data surface until proven otherwise.",
  items: [
    "Oversized PDFs or DOCX files can become memory, parsing, or cost-amplification attacks.",
    "Unsupported or malformed documents can trigger parser crashes, retries, or noisy processing failures.",
    "MIME type, file extension, and actual file content can disagree; trusting one signal alone is unsafe.",
    "Storing raw uploaded files indefinitely without policy turns every upload into a long-lived privacy liability.",
    "Service-role upload flows can hide weak validation because the storage write itself succeeds."
  ]
};

export const parsingExtractionRisks: DocumentProcessingSection = {
  title: "Parsing and extraction risks",
  summary: "Text extraction and field extraction sit on the boundary between untrusted input and trusted workflow state.",
  items: [
    "Corrupt or tricky PDFs/DOCX files can produce parser errors, partial text, or misleading truncated output.",
    "Extraction failures may create noisy processing_error rows that leak document content or internal parser details if not sanitized.",
    "Low-confidence or ambiguous clauses can still produce plausible-looking metadata that users over-trust.",
    "Repeated parse retries can magnify compute cost or create inconsistent intermediate state if not controlled.",
    "Template defaults applied after extraction can blur the line between observed data and inferred data."
  ]
};

export const dataExposureRisks: DocumentProcessingSection = {
  title: "Data exposure risks",
  summary: "The dangerous part is not just the file itself, but every derivative artifact created from it.",
  items: [
    "Extracted full text is often more searchable and easier to leak than the source file.",
    "Evidence snippets can expose sensitive clauses out of context if surfaced too broadly.",
    "Processing error logs can accidentally retain parser traces, snippets, or user-supplied content.",
    "Admin/debug views can become a second exposure channel for extracted content and failure detail.",
    "Exports, audit logs, and analytics should never silently include full extracted text or raw snippets unless explicitly designed to."
  ]
};

export const storageRetentionRisks: DocumentProcessingSection = {
  title: "Storage and retention risks",
  summary: "Document retention is a real security decision, not just a storage-cost decision.",
  items: [
    "Raw uploaded contracts, extracted text, evidence rows, and processing errors all need different retention rules.",
    "Keeping deleted-org contract files indefinitely breaks privacy posture and buyer trust.",
    "Evidence snippets can outlive the source file if retention logic is not coordinated across tables.",
    "Storage paths scoped by organization help, but do not solve retention or lifecycle hygiene.",
    "Backup and restore posture matters because retained document data may reappear after customer deletion unless policy is explicit."
  ]
};

export const trustIntegrityRisks: DocumentProcessingSection = {
  title: "Trust and integrity risks",
  summary: "The product becomes unsafe when extracted suggestion is confused with reviewed truth.",
  items: [
    "Users may mistake extracted metadata for confirmed metadata if the UI does not keep the distinction obvious.",
    "Evidence snippets can create false confidence if they are incomplete, stale, or attached to later-corrected values.",
    "Manual corrections must become canonical and visibly override extraction.",
    "Reminder generation must follow reviewed truth, not stale extracted suggestion.",
    "Processing status transitions must never imply trust that has not been earned through review."
  ]
};

export const documentHardeningRecommendations: DocumentProcessingSection = {
  title: "Hardening recommendations",
  summary: "Keep ingestion narrow, sanitize every derivative artifact, and preserve a hard line between extracted suggestion and reviewed truth.",
  items: [
    "Enforce strict size, extension, and MIME/content-type validation before storing or processing files.",
    "Quarantine or reject unsupported and corrupt files cleanly without repeated parser churn.",
    "Store extracted text and evidence snippets only as long as they support the renewal workflow, not indefinitely by default.",
    "Sanitize processing errors so they capture failure class and traceability without dumping document content.",
    "Render evidence snippets safely and minimally; avoid rich rendering or broad snippet exposure in admin/debug views.",
    "Make reviewed fields, not extracted fields, the only source for trusted downstream reminders and status progression.",
    "Log extraction provenance and correction lineage so the system can explain where a date came from.",
    "Add per-file processing limits and retry ceilings to avoid abuse and cost blowups."
  ]
};

export const minimumSafePolicies: DocumentProcessingSection = {
  title: "Minimum safe policies",
  summary: "These are the minimum policies needed to keep document processing defensible for real customers.",
  items: [
    "Allow only the file types you intentionally support and reject everything else early.",
    "Define maximum upload size and maximum extraction workload per file.",
    "Keep extracted full text and evidence snippets out of logs, analytics, and broad admin surfaces.",
    "Tag extracted outputs as generated/unreviewed until a human review action makes them canonical.",
    "Define retention and deletion rules for source files, extracted text, evidence, and processing errors.",
    "Use sanitized error messages externally and richer detail only in secure server logs with trace ids.",
    "Never display or export more extracted content than the user needs to review and trust the workflow."
  ]
};

export const dangerousShortcuts = [
  "Trusting file extension alone instead of validating MIME and parser support.",
  "Keeping raw extracted text forever because it is 'useful later'.",
  "Letting evidence snippets or parser errors spill into admin UI without tight scope.",
  "Treating extraction success as workflow trust without clear human review completion.",
  "Regenerating reminders from stale extracted fields after a user correction.",
  "Using broad debug logging that accidentally captures contract content.",
  "Assuming document storage path scoping is enough without deletion and retention controls.",
  "Applying template defaults in ways that make inferred values look like extracted facts."
];

export const bestDocumentProcessingApproach: DocumentProcessingSection = {
  title: "Best implementation approach",
  summary: "Process as little as necessary, retain as little as necessary, and make provenance and review state impossible to confuse.",
  items: [
    "Treat uploaded files as untrusted input and validate before processing.",
    "Keep extracted full text and snippets tightly scoped to review workflows.",
    "Make review the explicit trust boundary before reminders or operational decisions rely on data.",
    "Apply retention rules separately for source files, extracted text, snippets, and processing errors.",
    "Audit and test the full path from upload to extraction to review to reminder regeneration."
  ]
};
