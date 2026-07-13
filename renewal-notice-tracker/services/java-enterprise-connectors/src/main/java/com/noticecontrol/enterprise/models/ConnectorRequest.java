package com.noticecontrol.enterprise.models;

import java.util.Map;

public record ConnectorRequest(
    String organizationId,
    String connectorType,
    String operation,
    Map<String, Object> payload
) {}
