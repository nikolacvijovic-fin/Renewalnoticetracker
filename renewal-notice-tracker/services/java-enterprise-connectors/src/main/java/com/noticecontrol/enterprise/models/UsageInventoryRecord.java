package com.noticecontrol.enterprise.models;

import com.fasterxml.jackson.annotation.JsonProperty;
import java.util.List;

public record UsageInventoryRecord(
    @JsonProperty("external_product_id")
    String externalProductId,
    @JsonProperty("vendor")
    String vendor,
    @JsonProperty("product")
    String product,
    @JsonProperty("category")
    String category,
    @JsonProperty("purchased_seats")
    int purchasedSeats,
    @JsonProperty("assigned_seats")
    int assignedSeats,
    @JsonProperty("active_users_30d")
    int activeUsers30d,
    @JsonProperty("active_users_90d")
    int activeUsers90d,
    @JsonProperty("last_activity_at")
    String lastActivityAt,
    @JsonProperty("collected_at")
    String collectedAt,
    @JsonProperty("source_label")
    String sourceLabel,
    @JsonProperty("warning_codes")
    List<String> warningCodes
) {}
