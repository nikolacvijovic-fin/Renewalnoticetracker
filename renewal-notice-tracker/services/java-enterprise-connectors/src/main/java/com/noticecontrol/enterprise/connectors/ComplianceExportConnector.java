package com.noticecontrol.enterprise.connectors;

import com.noticecontrol.enterprise.models.ConnectorRequest;
import com.noticecontrol.enterprise.models.ConnectorResult;

public interface ComplianceExportConnector {
  ConnectorResult execute(ConnectorRequest request);
}
