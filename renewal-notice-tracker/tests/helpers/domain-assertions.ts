import { expect, type Mock } from "vitest";
import {
  sanitizeSpreadsheetValue,
  type ExportColumnDefinition
} from "@/lib/contracts/export";

export function expectTenantScopedCall(mock: Mock, organizationId: string) {
  expect(mock).toHaveBeenCalledWith(
    expect.objectContaining({
      organizationId
    })
  );
}

export async function expectEntitlementDeniedResponse(response: Response) {
  expect([303, 402, 403]).toContain(response.status);
}

export async function expectIntelligenceAccessDeniedResponse(response: Response) {
  expect(response.status).toBe(403);
  await expect(response.json()).resolves.toEqual(
    expect.objectContaining({
      error: "Forbidden",
      requestId: expect.any(String)
    })
  );
}

export function expectExportPresetColumns(
  columns: readonly ExportColumnDefinition[],
  expectedKeys: string[]
) {
  expect(columns.map((column) => column.key)).toEqual(expectedKeys);
}

export function expectSpreadsheetInjectionSanitized(value: string) {
  expect(sanitizeSpreadsheetValue(value)).toBe(`'${value}`);
}

export async function expectInternalRouteSecretFailure(
  response: Response,
  operation: Mock
) {
  expect(response.status).toBe(401);
  await expect(response.json()).resolves.toEqual(
    expect.objectContaining({
      error: "Unauthorized",
      requestId: expect.any(String)
    })
  );
  expect(operation).not.toHaveBeenCalled();
}
