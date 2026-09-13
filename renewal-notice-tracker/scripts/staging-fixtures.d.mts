export function getStagingFixturePath(env?: Record<string, string | undefined>): string;
export function prepareStagingFixtures(input?: {
  env?: Record<string, string | undefined>;
  confirmed?: boolean;
}): Promise<{ pdfPath: string }>;
