package com.noticecontrol.enterprise.models;

import com.fasterxml.jackson.annotation.JsonProperty;

public record UsageInventorySnapshotRequest(
    @JsonProperty("organization_id")
    String organizationId,
    @JsonProperty("connector_type")
    String connectorType,
    @JsonProperty("provider")
    String provider,
    @JsonProperty("tenant_id")
    String tenantId,
    @JsonProperty("customer_id")
    String customerId,
    @JsonProperty("domain")
    String domain,
    @JsonProperty("credential_reference")
    String credentialReference,
    @JsonProperty("provider_access_token")
    String providerAccessToken,
    @JsonProperty("cursor")
    String cursor,
    @JsonProperty("page_size")
    int pageSize,
    @JsonProperty("idempotency_key")
    String idempotencyKey
) {}
