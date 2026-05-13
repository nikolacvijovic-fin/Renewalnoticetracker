export function sanitizeInternalError(error: unknown) {
  if (!(error instanceof Error)) {
    return "Unexpected error.";
  }

  return error.message
    .replace(/https?:\/\/\S+/gi, "[redacted-url]")
    .replace(/api[_-]?key[^,\s]*/gi, "[redacted]")
    .replace(/bearer\s+[a-z0-9\-_\.]+/gi, "Bearer [redacted]")
    .slice(0, 240);
}

export function mapUserSafeErrorMessage(context: "upload" | "extraction" | "notification" | "auth") {
  switch (context) {
    case "upload":
      return "The file could not be uploaded safely. Please try again with a valid PDF or DOCX.";
    case "extraction":
      return "The contract could not be parsed into reliable metadata. Review the file and try again.";
    case "notification":
      return "The reminder could not be delivered right now. The attempt was logged for follow-up.";
    case "auth":
      return "Authentication could not be completed. Please retry from a valid sign-in link.";
  }
}
