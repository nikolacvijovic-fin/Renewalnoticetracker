package com.noticecontrol.enterprise.models;

import java.util.List;

public record UsageInventorySnapshotResult(
    boolean accepted,
    String connectorType,
    List<UsageInventoryRecord> records,
    String nextCursor,
    List<String> warnings
) {}
