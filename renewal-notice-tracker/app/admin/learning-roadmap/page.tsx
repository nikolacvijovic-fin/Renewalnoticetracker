import { Badge } from "@/components/ui/badge";
import { requireInternalRole } from "@/lib/internal-access";
import { listLanguageSubsystems } from "@/lib/learning/language-subsystems";

function statusTone(status: string) {
  if (status === "production_ready") return "success" as const;
  if (status === "active") return "automation" as const;
  if (status === "scaffolded") return "warning" as const;
  return "default" as const;
}

export default async function AdminLearningRoadmapPage() {
  await requireInternalRole(["internal_admin", "internal_support"]);
  const subsystems = listLanguageSubsystems();

  return (
    <main className="mx-auto max-w-7xl space-y-6 p-8">
      <section>
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-brand-600">
          Internal architecture
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Multi-language learning roadmap</h1>
        <p className="mt-2 max-w-3xl text-sm text-muted">
          Internal-only map of how TypeScript, React, SQL, Python, Go, R, and Java each own a
          commercial subsystem without leaking service implementations into customer-facing UI.
        </p>
      </section>

      <section className="grid gap-5">
        {subsystems.map((subsystem) => (
          <article key={subsystem.language} className="rounded-3xl border border-line bg-white p-6 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-xl font-semibold text-ink">{subsystem.language}</h2>
                  <Badge tone={statusTone(subsystem.currentStatus)}>
                    {subsystem.currentStatus.replaceAll("_", " ")}
                  </Badge>
                </div>
                <p className="mt-2 text-sm font-semibold text-ink">{subsystem.subsystemName}</p>
                <p className="mt-1 max-w-4xl text-sm text-muted">{subsystem.productPurpose}</p>
              </div>
              <p className="rounded-2xl bg-slate-50 px-4 py-3 text-xs font-semibold uppercase tracking-[0.14em] text-muted">
                {subsystem.runtimeLocation}
              </p>
            </div>

            <div className="mt-5 grid gap-4 lg:grid-cols-3">
              <div className="rounded-2xl border border-line p-4">
                <h3 className="text-sm font-semibold text-ink">Commercial value</h3>
                <p className="mt-2 text-sm text-muted">{subsystem.commercialValue}</p>
              </div>
              <div className="rounded-2xl border border-line p-4">
                <h3 className="text-sm font-semibold text-ink">Integration points</h3>
                <ul className="mt-2 space-y-1 text-sm text-muted">
                  {subsystem.integrationPoints.map((item) => <li key={item}>{item}</li>)}
                </ul>
              </div>
              <div className="rounded-2xl border border-line p-4">
                <h3 className="text-sm font-semibold text-ink">Enterprise readiness impact</h3>
                <p className="mt-2 text-sm text-muted">{subsystem.enterpriseReadinessImpact}</p>
              </div>
            </div>

            <div className="mt-5 grid gap-4 lg:grid-cols-3">
              <div>
                <h3 className="text-sm font-semibold text-ink">Beginner tasks</h3>
                <ul className="mt-2 space-y-1 text-sm text-muted">
                  {subsystem.beginnerTasks.map((task) => <li key={task}>{task}</li>)}
                </ul>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-ink">Intermediate tasks</h3>
                <ul className="mt-2 space-y-1 text-sm text-muted">
                  {subsystem.intermediateTasks.map((task) => <li key={task}>{task}</li>)}
                </ul>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-ink">Advanced tasks</h3>
                <ul className="mt-2 space-y-1 text-sm text-muted">
                  {subsystem.advancedTasks.map((task) => <li key={task}>{task}</li>)}
                </ul>
              </div>
            </div>

            <div className="mt-5 grid gap-4 lg:grid-cols-2">
              <div>
                <h3 className="text-sm font-semibold text-ink">Files to study</h3>
                <ul className="mt-2 space-y-1 font-mono text-xs text-muted">
                  {subsystem.filesToStudy.map((file) => <li key={file}>{file}</li>)}
                </ul>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-ink">Tests to run</h3>
                <ul className="mt-2 space-y-1 font-mono text-xs text-muted">
                  {subsystem.testsToRun.map((command) => <li key={command}>{command}</li>)}
                </ul>
              </div>
            </div>
          </article>
        ))}
      </section>
    </main>
  );
}
