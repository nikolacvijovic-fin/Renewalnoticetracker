import { describe, expect, it } from "vitest";
import { LEARNING_INTEGRATION_MAP } from "@/lib/learning/integration-map";

describe("multi-language integration map", () => {
  it("keeps customer UI from calling service runtimes directly", () => {
    const uiFlows = LEARNING_INTEGRATION_MAP.filter((flow) => flow.from === "react_ui");

    expect(uiFlows).toHaveLength(1);
    expect(uiFlows[0]).toMatchObject({
      to: "typescript_orchestration",
      allowedInCustomerRuntime: true
    });
  });

  it("marks R as read-only/export-consumer architecture", () => {
    const rFlows = LEARNING_INTEGRATION_MAP.filter((flow) => flow.from === "r_analytics_research");

    expect(rFlows).toHaveLength(1);
    expect(rFlows[0]).toMatchObject({
      communication: "csv_export",
      allowedInCustomerRuntime: false
    });
    expect(rFlows[0]?.securityBoundary).toMatch(/read-only/i);
  });

  it("keeps SQL as audit and reporting source of truth", () => {
    const sqlFlow = LEARNING_INTEGRATION_MAP.find((flow) => flow.id === "typescript_to_sql");

    expect(sqlFlow?.to).toBe("sql_trust_reporting");
    expect(sqlFlow?.securityBoundary).toMatch(/RLS|audit ledgers|reporting truth/i);
  });

  it("keeps TypeScript as the only product orchestration layer", () => {
    const orchestrationTargets = LEARNING_INTEGRATION_MAP.filter(
      (flow) => flow.to === "typescript_orchestration"
    );
    const orchestrationSources = LEARNING_INTEGRATION_MAP.filter(
      (flow) => flow.from === "typescript_orchestration"
    );

    expect(orchestrationTargets.map((flow) => flow.from)).toEqual(["react_ui"]);
    expect(orchestrationSources.length).toBeGreaterThan(0);
  });

  it("marks Java optional enterprise-only and Go reliability-owned", () => {
    const javaFlow = LEARNING_INTEGRATION_MAP.find((flow) => flow.to === "java_enterprise_connectors");
    const goFlow = LEARNING_INTEGRATION_MAP.find((flow) => flow.to === "go_reliability_worker");

    expect(javaFlow?.securityBoundary).toMatch(/enterprise-only/i);
    expect(goFlow?.purpose).toMatch(/reliability workers/i);
  });
});
