package com.noticecontrol.enterprise.models;

public record UsageInventoryRecord(
    String externalProductId,
    String vendor,
    String product,
    String category,
    int purchasedSeats,
    int assignedSeats,
    int activeUsers30d,
    int activeUsers90d,
    String lastActivityAt,
    String collectedAt,
    String sourceLabel
) {}
