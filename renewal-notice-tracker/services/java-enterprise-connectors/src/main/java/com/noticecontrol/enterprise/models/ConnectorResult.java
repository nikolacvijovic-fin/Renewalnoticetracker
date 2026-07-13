package com.noticecontrol.enterprise.models;

import java.util.List;

public record ConnectorResult(
    boolean accepted,
    String connectorType,
    String externalReferenceId,
    List<String> warnings
) {}
