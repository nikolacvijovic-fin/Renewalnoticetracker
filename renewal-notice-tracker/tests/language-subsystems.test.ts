import { describe, expect, it } from "vitest";
import { LANGUAGE_SUBSYSTEMS, type LearningLanguage } from "@/lib/learning/language-subsystems";

const EXPECTED_LANGUAGES: LearningLanguage[] = [
  "TypeScript",
  "React",
  "SQL",
  "Python",
  "Go",
  "R",
  "Java"
];

describe("language subsystem registry", () => {
  it("represents all seven enterprise learning languages", () => {
    expect(LANGUAGE_SUBSYSTEMS.map((subsystem) => subsystem.language).sort()).toEqual(
      [...EXPECTED_LANGUAGES].sort()
    );
  });

  it("gives every subsystem commercial value and real learning tasks", () => {
    for (const subsystem of LANGUAGE_SUBSYSTEMS) {
      expect(subsystem.subsystemName.trim().length, subsystem.language).toBeGreaterThan(0);
      expect(subsystem.productPurpose.trim().length, subsystem.language).toBeGreaterThan(0);
      expect(subsystem.commercialValue.trim().length, subsystem.language).toBeGreaterThan(0);
      expect(subsystem.enterpriseReadinessImpact.trim().length, subsystem.language).toBeGreaterThan(0);
      expect(subsystem.runtimeLocation.trim().length, subsystem.language).toBeGreaterThan(0);
      expect(subsystem.beginnerTasks.length, subsystem.language).toBeGreaterThan(0);
      expect(subsystem.intermediateTasks.length, subsystem.language).toBeGreaterThan(0);
      expect(subsystem.advancedTasks.length, subsystem.language).toBeGreaterThan(0);
      expect(subsystem.filesToStudy.length, subsystem.language).toBeGreaterThan(0);
      expect(subsystem.testsToRun.length, subsystem.language).toBeGreaterThan(0);
      expect(subsystem.integrationPoints.length, subsystem.language).toBeGreaterThan(0);
    }
  });

  it("does not assign duplicate ownership of the same responsibility", () => {
    const responsibilities = LANGUAGE_SUBSYSTEMS.map((subsystem) => subsystem.ownedResponsibility);
    expect(new Set(responsibilities).size).toBe(responsibilities.length);
  });

  it("keeps service runtimes scaffolded rather than production-ready by default", () => {
    const serviceLanguages = LANGUAGE_SUBSYSTEMS.filter((subsystem) =>
      ["Python", "Go", "R", "Java"].includes(subsystem.language)
    );

    expect(serviceLanguages.every((subsystem) => subsystem.currentStatus === "scaffolded")).toBe(true);
  });
});
