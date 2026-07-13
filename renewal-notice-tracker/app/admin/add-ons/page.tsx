import { Badge } from "@/components/ui/badge";
import { requireInternalRole } from "@/lib/internal-access";
import { ADD_ON_MANIFESTS, type AddOnManifest } from "@/lib/add-ons/add-on-registry";
import { checkPythonIntelligenceHealth } from "@/lib/add-ons/python-intelligence-client";
import { checkGoWorkerHealth } from "@/lib/add-ons/go-worker-client";
import { checkJavaEnterpriseHealth } from "@/lib/add-ons/java-enterprise-client";

type AddOnHealthRow = {
  manifest: AddOnManifest;
  healthStatus: "ok" | "degraded" | "unavailable" | "not_configured" | "not_applicable";
  lastChecked: string;
};

async function checkHealth(manifest: AddOnManifest) {
  if (!manifest.healthCheckPath) return "not_applicable" as const;

  const result =
    manifest.id === "python_contract_intelligence"
      ? await checkPythonIntelligenceHealth()
      : manifest.id === "go_reliability_worker"
        ? await checkGoWorkerHealth()
        : manifest.id === "java_enterprise_connectors"
          ? await checkJavaEnterpriseHealth()
          : null;

  if (!result) return "not_applicable" as const;
  if (!result.ok) return result.errorCode === "not_configured" ? "not_configured" : "unavailable";
  return result.output.status;
}

async function getAddOnHealthRows(): Promise<AddOnHealthRow[]> {
  const lastChecked = new Date().toISOString();
  return Promise.all(
    ADD_ON_MANIFESTS.map(async (manifest) => ({
      manifest,
      healthStatus: await checkHealth(manifest),
      lastChecked
    }))
  );
}

const statusTone: Record<AddOnManifest["status"], "success" | "warning" | "critical" | "default"> = {
  active: "success",
  scaffolded: "warning",
  planned: "default",
  disabled: "critical"
};

export default async function AdminAddOnsPage() {
  await requireInternalRole(["internal_admin", "internal_support"]);
  const rows = await getAddOnHealthRows();

  return (
    <main className="mx-auto max-w-6xl space-y-6 p-8">
      <section>
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-brand-600">Internal operations</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Add-on control plane</h1>
        <p className="mt-2 max-w-3xl text-sm text-muted">
          Operator-only status for scaffolded add-on services. This page does not enable future modules; it shows
          whether registered boundaries are configured and healthy.
        </p>
      </section>

      <section className="overflow-hidden rounded-3xl border border-line bg-white shadow-sm">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-[0.16em] text-muted">
            <tr>
              <th className="px-4 py-3">Add-on</th>
              <th className="px-4 py-3">Runtime</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Entitlement</th>
              <th className="px-4 py-3">Health</th>
              <th className="px-4 py-3">Risk</th>
              <th className="px-4 py-3">Commercial value</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ manifest, healthStatus, lastChecked }) => (
              <tr key={manifest.id} className="border-t border-line align-top">
                <td className="px-4 py-4">
                  <p className="font-semibold text-ink">{manifest.name}</p>
                  <p className="mt-1 text-xs text-muted">{manifest.id}</p>
                </td>
                <td className="px-4 py-4">{manifest.runtime}</td>
                <td className="px-4 py-4">
                  <Badge tone={statusTone[manifest.status]}>{manifest.status}</Badge>
                </td>
                <td className="px-4 py-4 font-mono text-xs">{manifest.requiredEntitlement}</td>
                <td className="px-4 py-4">
                  <p className="font-semibold">{healthStatus}</p>
                  <p className="mt-1 text-xs text-muted">Checked {lastChecked}</p>
                </td>
                <td className="px-4 py-4">{manifest.riskLevel}</td>
                <td className="px-4 py-4 text-muted">{manifest.commercialValue}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}
