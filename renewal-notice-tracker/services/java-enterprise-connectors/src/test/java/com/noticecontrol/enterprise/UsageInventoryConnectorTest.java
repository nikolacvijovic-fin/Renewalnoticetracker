package com.noticecontrol.enterprise;

import com.noticecontrol.enterprise.models.UsageInventorySnapshotRequest;
import com.noticecontrol.enterprise.models.UsageInventorySnapshotResult;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class UsageInventoryConnectorTest {
  @Test
  void fixtureUsageConnectorReturnsPaginatedContractWithoutRawCredentials() {
    FixtureUsageInventoryConnector connector = new FixtureUsageInventoryConnector(false);
    UsageInventorySnapshotResult result = connector.fetchUsageSnapshot(
        new UsageInventorySnapshotRequest("org-1", "subscription_usage", "credential-ref-1", null, 50, "idem-1")
    );

    assertTrue(result.accepted());
    assertEquals("subscription_usage", result.connectorType());
    assertEquals(1, result.records().size());
    assertFalse(result.toString().contains("secret"));
    assertFalse(result.toString().contains("token"));
  }

  @Test
  void fixtureUsageConnectorIsDisabledInProduction() {
    FixtureUsageInventoryConnector connector = new FixtureUsageInventoryConnector(true);
    UsageInventorySnapshotResult result = connector.fetchUsageSnapshot(
        new UsageInventorySnapshotRequest("org-1", "subscription_usage", "credential-ref-1", null, 50, "idem-1")
    );

    assertFalse(result.accepted());
    assertTrue(result.warnings().contains("fixture_adapter_disabled_in_production"));
  }
}
