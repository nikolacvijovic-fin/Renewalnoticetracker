package com.noticecontrol.enterprise;

import com.noticecontrol.enterprise.connectors.UsageInventoryConnector;
import com.noticecontrol.enterprise.models.UsageInventoryRecord;
import com.noticecontrol.enterprise.models.UsageInventorySnapshotRequest;
import com.noticecontrol.enterprise.models.UsageInventorySnapshotResult;
import java.util.List;

final class FixtureUsageInventoryConnector implements UsageInventoryConnector {
  private final boolean production;

  FixtureUsageInventoryConnector(boolean production) {
    this.production = production;
  }

  @Override
  public UsageInventorySnapshotResult fetchUsageSnapshot(UsageInventorySnapshotRequest request) {
    if (production) {
      return new UsageInventorySnapshotResult(false, request.connectorType(), List.of(), null, List.of("fixture_adapter_disabled_in_production"));
    }
    if (request.credentialReference() == null || request.credentialReference().isBlank()) {
      return new UsageInventorySnapshotResult(false, request.connectorType(), List.of(), null, List.of("missing_credential_reference"));
    }
    int pageSize = Math.max(1, Math.min(request.pageSize(), 100));
    List<UsageInventoryRecord> records = List.of(
        new UsageInventoryRecord("fixture-1", "Acme", "Acme Suite", "collaboration", 100, 90, 35, 50, "2026-08-01T00:00:00Z", "2026-08-12T00:00:00Z", "fixture")
    ).subList(0, Math.min(1, pageSize));
    return new UsageInventorySnapshotResult(true, request.connectorType(), records, null, List.of("fixture_only_not_production_connector"));
  }
}
