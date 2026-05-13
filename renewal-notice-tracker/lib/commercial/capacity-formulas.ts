const CAPACITY_WEIGHTS = {
  cronPressure: 0.15,
  retryBacklog: 0.15,
  reminderFailurePressure: 0.15,
  webhookPressure: 0.1,
  importQueuePressure: 0.1,
  dbPressure: 0.15,
  errorBudgetPressure: 0.1,
  supportOverload: 0.1
} as const;

function clampScore(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, value));
}

export function calculateOverallCapacity(input: {
  cronPressure: number;
  retryBacklog: number;
  reminderFailurePressure: number;
  webhookPressure: number;
  importQueuePressure: number;
  dbPressure: number;
  errorBudgetPressure: number;
  supportOverload: number;
}) {
  const score =
    clampScore(input.cronPressure) * CAPACITY_WEIGHTS.cronPressure +
    clampScore(input.retryBacklog) * CAPACITY_WEIGHTS.retryBacklog +
    clampScore(input.reminderFailurePressure) * CAPACITY_WEIGHTS.reminderFailurePressure +
    clampScore(input.webhookPressure) * CAPACITY_WEIGHTS.webhookPressure +
    clampScore(input.importQueuePressure) * CAPACITY_WEIGHTS.importQueuePressure +
    clampScore(input.dbPressure) * CAPACITY_WEIGHTS.dbPressure +
    clampScore(input.errorBudgetPressure) * CAPACITY_WEIGHTS.errorBudgetPressure +
    clampScore(input.supportOverload) * CAPACITY_WEIGHTS.supportOverload;

  return Math.round(score);
}

export { CAPACITY_WEIGHTS };
