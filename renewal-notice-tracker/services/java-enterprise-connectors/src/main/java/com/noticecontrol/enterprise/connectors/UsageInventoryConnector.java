package com.noticecontrol.enterprise.connectors;

import com.noticecontrol.enterprise.models.UsageInventorySnapshotRequest;
import com.noticecontrol.enterprise.models.UsageInventorySnapshotResult;

public interface UsageInventoryConnector {
  UsageInventorySnapshotResult fetchUsageSnapshot(UsageInventorySnapshotRequest request);
}
