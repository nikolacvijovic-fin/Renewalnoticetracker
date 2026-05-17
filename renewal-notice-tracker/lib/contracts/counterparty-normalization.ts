const STRIPPED_LEGAL_SUFFIXES = new Set([
  "inc",
  "llc",
  "ltd",
  "limited",
  "corp",
  "corporation",
  "company",
  "co",
  "gmbh",
  "doo",
  "dooel",
  "plc",
  "ag",
  "bv",
  "sa",
  "sro"
]);

export type CounterpartyIdentity = {
  rawCounterpartyName: string;
  normalizedCounterpartyName: string;
};

export type CounterpartyIdentityRecord = {
  id: string;
  raw_counterparty_name: string;
  normalized_counterparty_name: string;
  merged_into_counterparty_id?: string | null;
  contract_count?: number;
};

export type CounterpartyAliasRecord = {
  counterparty_id: string;
  alias_name: string;
  normalized_alias_name: string;
};

export type CounterpartyDuplicateSuggestion = {
  id: string;
  rawCounterpartyName: string;
  normalizedCounterpartyName: string;
  contractCount: number;
  score: number;
};

export function normalizeCounterpartyName(rawName: string) {
  const trimmed = rawName.trim();
  if (!trimmed) return "";

  const normalized = trimmed
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replaceAll("&", " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

  const tokens = normalized.split(/\s+/).filter(Boolean);
  while (tokens.length > 1 && STRIPPED_LEGAL_SUFFIXES.has(tokens[tokens.length - 1] ?? "")) {
    tokens.pop();
  }

  return tokens.join(" ");
}

export function buildCounterpartyIdentity(rawName: string): CounterpartyIdentity {
  return {
    rawCounterpartyName: rawName.trim(),
    normalizedCounterpartyName: normalizeCounterpartyName(rawName)
  };
}

export function resolveCounterpartyAlias(
  records: CounterpartyIdentityRecord[],
  aliases: CounterpartyAliasRecord[],
  rawName: string
) {
  const normalized = normalizeCounterpartyName(rawName);
  if (!normalized) return null;

  const canonicalRecord = records.find(
    (record) =>
      record.merged_into_counterparty_id == null &&
      record.normalized_counterparty_name === normalized
  );
  if (canonicalRecord) return canonicalRecord.id;

  const aliasMatch = aliases.find((alias) => alias.normalized_alias_name === normalized);
  if (!aliasMatch) return null;

  const aliasedRecord = records.find((record) => record.id === aliasMatch.counterparty_id);
  if (!aliasedRecord) return null;
  return aliasedRecord.merged_into_counterparty_id ?? aliasedRecord.id;
}

export function suggestDuplicateCounterparties(
  records: CounterpartyIdentityRecord[],
  rawName: string,
  currentId?: string | null
): CounterpartyDuplicateSuggestion[] {
  const identity = buildCounterpartyIdentity(rawName);
  const targetTokens = new Set(identity.normalizedCounterpartyName.split(" ").filter(Boolean));
  if (!identity.normalizedCounterpartyName) return [];

  return records
    .filter(
      (record) =>
        record.id !== currentId &&
        record.merged_into_counterparty_id == null &&
        record.normalized_counterparty_name.length > 0
    )
    .map((record) => {
      const suggestionTokens = new Set(record.normalized_counterparty_name.split(" ").filter(Boolean));
      const overlap = [...targetTokens].filter((token) => suggestionTokens.has(token)).length;
      const maxTokenCount = Math.max(targetTokens.size, suggestionTokens.size, 1);
      const overlapRatio = overlap / maxTokenCount;

      let score = 0;
      if (record.normalized_counterparty_name === identity.normalizedCounterpartyName) {
        score = 100;
      } else if (
        record.normalized_counterparty_name.includes(identity.normalizedCounterpartyName) ||
        identity.normalizedCounterpartyName.includes(record.normalized_counterparty_name)
      ) {
        score = 85;
      } else if (overlapRatio >= 0.5) {
        score = Math.round(overlapRatio * 100);
      }

      return {
        id: record.id,
        rawCounterpartyName: record.raw_counterparty_name,
        normalizedCounterpartyName: record.normalized_counterparty_name,
        contractCount: record.contract_count ?? 0,
        score
      };
    })
    .filter((suggestion) => suggestion.score >= 50)
    .sort((left, right) => right.score - left.score || right.contractCount - left.contractCount)
    .slice(0, 5);
}
