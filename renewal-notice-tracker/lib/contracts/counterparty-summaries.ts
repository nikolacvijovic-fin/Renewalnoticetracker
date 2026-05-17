import { suggestDuplicateCounterparties } from "@/lib/contracts/counterparty-normalization";

export type CounterpartySummaryRecord = {
  id: string;
  name: string;
  raw_counterparty_name: string;
  normalized_counterparty_name: string;
  merged_into_counterparty_id: string | null;
};

export type CounterpartyAliasSummaryRecord = {
  counterparty_id: string;
  alias_name: string;
};

export type CounterpartyContractCountRecord = {
  counterparty_id: string | null;
};

export type CounterpartyDirectoryRecord = {
  id: string;
  name: string;
  raw_counterparty_name: string;
  normalized_counterparty_name: string;
  contract_count: number;
  alias_names: string[];
  duplicate_suggestions: Array<{ id: string; raw_counterparty_name: string; score: number }>;
};

export function buildCounterpartyDirectoryRecords(input: {
  counterparties: CounterpartySummaryRecord[];
  aliases: CounterpartyAliasSummaryRecord[];
  contracts: CounterpartyContractCountRecord[];
}) {
  const contractCounts = new Map<string, number>();
  for (const contract of input.contracts) {
    if (!contract.counterparty_id) continue;
    contractCounts.set(
      contract.counterparty_id,
      (contractCounts.get(contract.counterparty_id) ?? 0) + 1
    );
  }

  const canonicalCounterparties = input.counterparties.filter(
    (counterparty) => counterparty.merged_into_counterparty_id == null
  );

  return canonicalCounterparties.map<CounterpartyDirectoryRecord>((counterparty) => {
    const duplicateSuggestions = suggestDuplicateCounterparties(
      canonicalCounterparties.map((record) => ({
        ...record,
        contract_count: contractCounts.get(record.id) ?? 0
      })),
      counterparty.raw_counterparty_name,
      counterparty.id
    );

    return {
      id: counterparty.id,
      name: counterparty.name,
      raw_counterparty_name: counterparty.raw_counterparty_name,
      normalized_counterparty_name: counterparty.normalized_counterparty_name,
      contract_count: contractCounts.get(counterparty.id) ?? 0,
      alias_names: input.aliases
        .filter((alias) => alias.counterparty_id === counterparty.id)
        .map((alias) => alias.alias_name),
      duplicate_suggestions: duplicateSuggestions.map((suggestion) => ({
        id: suggestion.id,
        raw_counterparty_name: suggestion.rawCounterpartyName,
        score: suggestion.score
      }))
    };
  });
}
