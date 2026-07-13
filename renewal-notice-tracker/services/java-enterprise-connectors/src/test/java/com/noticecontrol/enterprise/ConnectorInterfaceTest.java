package com.noticecontrol.enterprise;

import com.noticecontrol.enterprise.connectors.ProcurementConnector;
import com.noticecontrol.enterprise.models.ConnectorRequest;
import com.noticecontrol.enterprise.models.ConnectorResult;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class ConnectorInterfaceTest {
  @Test
  void procurementConnectorInterfaceCompiles() {
    ProcurementConnector connector = request ->
        new ConnectorResult(true, request.connectorType(), "ref-1", List.of());

    ConnectorResult result = connector.execute(
        new ConnectorRequest("org-1", "procurement", "health", Map.of())
    );

    assertTrue(result.accepted());
    assertEquals("procurement", result.connectorType());
  }
}
