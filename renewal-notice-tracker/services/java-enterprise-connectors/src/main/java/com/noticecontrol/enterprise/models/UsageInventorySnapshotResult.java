package com.noticecontrol.enterprise.models;

import com.fasterxml.jackson.annotation.JsonProperty;
import java.util.List;

public record UsageInventorySnapshotResult(
    @JsonProperty("accepted")
    boolean accepted,
    @JsonProperty("connector_type")
    String connectorType,
    @JsonProperty("records")
    List<UsageInventoryRecord> records,
    @JsonProperty("next_cursor")
    String nextCursor,
    @JsonProperty("warnings")
    List<String> warnings,
    @JsonProperty("retry_count")
    int retryCount,
    @JsonProperty("partial")
    boolean partial
) {}
