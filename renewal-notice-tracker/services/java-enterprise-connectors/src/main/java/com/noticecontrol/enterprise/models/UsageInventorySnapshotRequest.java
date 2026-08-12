package com.noticecontrol.enterprise.models;

public record UsageInventorySnapshotRequest(
    String organizationId,
    String connectorType,
    String credentialReference,
    String cursor,
    int pageSize,
    String idempotencyKey
) {}
