import { getAppConfig } from "@/lib/config";

const config = getAppConfig();

// Compatibility view for older call sites. New runtime code should prefer
// the grouped config from "@/lib/config" so config ownership stays obvious.
export const env = config.raw;
