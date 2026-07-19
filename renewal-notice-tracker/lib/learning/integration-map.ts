export type RuntimeNode =
  | "react_ui"
  | "typescript_orchestration"
  | "sql_trust_reporting"
  | "python_intelligence"
  | "go_reliability_worker"
  | "r_analytics_research"
  | "java_enterprise_connectors";

export type IntegrationFlow = {
  id: string;
  from: RuntimeNode;
  to: RuntimeNode;
  communication: "in_process" | "supabase" | "signed_http" | "internal_route" | "csv_export" | "scaffold_contract";
  purpose: string;
  allowedInCustomerRuntime: boolean;
  securityBoundary: string;
};

export const LEARNING_INTEGRATION_MAP: IntegrationFlow[] = [
  {
    id: "react_to_typescript",
    from: "react_ui",
    to: "typescript_orchestration",
    communication: "in_process",
    purpose: "Customer and admin UI call typed server actions, view models, and route helpers.",
    allowedInCustomerRuntime: true,
    securityBoundary: "React never calls Python, Go, R, or Java service implementations directly."
  },
  {
    id: "typescript_to_sql",
    from: "typescript_orchestration",
    to: "sql_trust_reporting",
    communication: "supabase",
    purpose: "Product orchestration reads and writes tenant-scoped source-of-truth records.",
    allowedInCustomerRuntime: true,
    securityBoundary: "SQL owns RLS, constraints, audit ledgers, and reporting truth."
  },
  {
    id: "typescript_to_python",
    from: "typescript_orchestration",
    to: "python_intelligence",
    communication: "signed_http",
    purpose: "TypeScript calls contract intelligence and extraction contracts through signed clients.",
    allowedInCustomerRuntime: false,
    securityBoundary: "Only TypeScript add-on clients may call Python; raw documents must not be logged."
  },
  {
    id: "typescript_to_go",
    from: "typescript_orchestration",
    to: "go_reliability_worker",
    communication: "internal_route",
    purpose: "TypeScript exposes trusted internal routes and job contracts for reliability workers.",
    allowedInCustomerRuntime: false,
    securityBoundary: "Go owns retry/idempotency execution, not billing or customer UI."
  },
  {
    id: "go_to_sql",
    from: "go_reliability_worker",
    to: "sql_trust_reporting",
    communication: "scaffold_contract",
    purpose: "Go records job status, reminder outcomes, and operational evidence through trusted paths.",
    allowedInCustomerRuntime: false,
    securityBoundary: "Worker writes must remain tenant-scoped and auditable."
  },
  {
    id: "r_consumes_exports",
    from: "r_analytics_research",
    to: "sql_trust_reporting",
    communication: "csv_export",
    purpose: "R consumes redacted exports/reporting data for analytics and research.",
    allowedInCustomerRuntime: false,
    securityBoundary: "R is read-only and does not connect directly to production databases."
  },
  {
    id: "typescript_to_java",
    from: "typescript_orchestration",
    to: "java_enterprise_connectors",
    communication: "signed_http",
    purpose: "TypeScript calls optional enterprise connector APIs through signed clients.",
    allowedInCustomerRuntime: false,
    securityBoundary: "Java remains enterprise-only and optional until gated connector integrations ship."
  }
];

export function listLearningIntegrationFlows() {
  return LEARNING_INTEGRATION_MAP;
}
