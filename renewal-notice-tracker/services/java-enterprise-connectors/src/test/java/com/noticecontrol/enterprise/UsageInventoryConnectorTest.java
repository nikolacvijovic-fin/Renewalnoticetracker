package com.noticecontrol.enterprise;

import com.noticecontrol.enterprise.connectors.Microsoft365UsageInventoryConnector;
import com.noticecontrol.enterprise.models.UsageInventorySnapshotRequest;
import com.noticecontrol.enterprise.models.UsageInventorySnapshotResult;
import com.sun.net.httpserver.HttpServer;
import java.net.InetSocketAddress;
import java.net.URI;
import java.net.http.HttpClient;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

class UsageInventoryConnectorTest {
  @Test
  void fixtureUsageConnectorReturnsPaginatedContractWithoutRawCredentials() {
    FixtureUsageInventoryConnector connector = new FixtureUsageInventoryConnector(false);
    UsageInventorySnapshotResult result = connector.fetchUsageSnapshot(
        microsoftRequest("credential-ref-1")
    );

    assertTrue(result.accepted());
    assertEquals("subscription_usage", result.connectorType());
    assertEquals(1, result.records().size());
    assertFalse(result.toString().contains("secret"));
    assertFalse(result.toString().contains("token"));
  }

  @Test
  void fixtureUsageConnectorIsDisabledInProduction() {
    FixtureUsageInventoryConnector connector = new FixtureUsageInventoryConnector(true);
    UsageInventorySnapshotResult result = connector.fetchUsageSnapshot(
        microsoftRequest("credential-ref-1")
    );

    assertFalse(result.accepted());
    assertTrue(result.warnings().contains("fixture_adapter_disabled_in_production"));
  }

  @Test
  void microsoft365ConnectorNormalizesGraphSubscribedSkusAndActivity() throws Exception {
    HttpServer server = startGraphServer(200, subscribedSkusBody(), activeUsersCsv(), activeUsersCsv());
    try {
      Microsoft365UsageInventoryConnector connector = new Microsoft365UsageInventoryConnector(
          URI.create("http://localhost:" + server.getAddress().getPort()),
          HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(2)).build(),
          null
      );

      UsageInventorySnapshotResult result = connector.fetchUsageSnapshot(
          microsoftRequest("managed-secret-ref")
      );

      assertTrue(result.accepted());
      assertEquals(1, result.records().size());
      assertEquals("Microsoft", result.records().get(0).vendor());
      assertEquals("Office 365 E3", result.records().get(0).product());
      assertEquals(25, result.records().get(0).purchasedSeats());
      assertEquals(20, result.records().get(0).assignedSeats());
      assertTrue(result.records().get(0).activeUsers30d() >= 1);
      assertFalse(result.toString().contains("test-token"));
    } finally {
      server.stop(0);
    }
  }

  @Test
  void microsoft365ConnectorHandlesAuthenticationFailureSafely() throws Exception {
    HttpServer server = startGraphServer(401, "{\"error\":\"raw token should not leak\"}", "", "");
    try {
      Microsoft365UsageInventoryConnector connector = new Microsoft365UsageInventoryConnector(
          URI.create("http://localhost:" + server.getAddress().getPort()),
          HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(2)).build(),
          null
      );

      UsageInventorySnapshotResult result = connector.fetchUsageSnapshot(
          microsoftRequest("managed-secret-ref")
      );

      assertFalse(result.accepted());
      assertTrue(result.warnings().contains("unauthorized"));
      assertFalse(result.toString().contains("raw token"));
    } finally {
      server.stop(0);
    }
  }

  @Test
  void microsoft365ConnectorRejectsMalformedGraphPayloadSafely() throws Exception {
    HttpServer server = startGraphServer(200, "{\"notValue\":[]}", activeUsersCsv(), activeUsersCsv());
    try {
      Microsoft365UsageInventoryConnector connector = new Microsoft365UsageInventoryConnector(
          URI.create("http://localhost:" + server.getAddress().getPort()),
          HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(2)).build(),
          null
      );

      UsageInventorySnapshotResult result = connector.fetchUsageSnapshot(
          microsoftRequest("managed-secret-ref")
      );

      assertFalse(result.accepted());
      assertTrue(result.warnings().contains("malformed_subscribed_skus_response"));
    } finally {
      server.stop(0);
    }
  }

  @Test
  void microsoft365ConnectorBoundsThrottledRequestRetries() throws Exception {
    HttpServer server = startGraphServer(429, "{\"error\":\"provider payload must not leak\"}", "", "");
    try {
      UsageInventorySnapshotResult result = connector(server).fetchUsageSnapshot(microsoftRequest("managed-secret-ref"));

      assertFalse(result.accepted());
      assertTrue(result.warnings().contains("provider_retry_exhausted"));
      assertFalse(result.toString().contains("provider payload"));
    } finally {
      server.stop(0);
    }
  }

  @Test
  void microsoft365ConnectorParsesBomCrLfQuotedCommaEscapedQuoteAndMultilineCsv() throws Exception {
    String csv = "\ufeffReport Refresh Date,User Principal Name,Assigned Products,Detail\r\n"
        + "2026-08-17,\"Doe, Jane\",\"Office 365 E3\",\"uses \"\"desktop\"\"\r\nand web\"\r\n";
    HttpServer server = startGraphServer(200, subscribedSkusBody(), csv, csv);
    try {
      Microsoft365UsageInventoryConnector connector = connector(server);
      UsageInventorySnapshotResult result = connector.fetchUsageSnapshot(microsoftRequest("managed-secret-ref"));
      assertTrue(result.accepted());
      assertEquals(1, result.records().get(0).activeUsers30d());
      assertFalse(result.toString().contains("Doe"));
      assertFalse(result.toString().contains("desktop"));
    } finally {
      server.stop(0);
    }
  }

  @Test
  void microsoft365ConnectorKeepsMissingActivityUnknownAndWarnsOnUnknownSku() throws Exception {
    String body = "{\"value\":["
        + "{\"skuId\":\"sku-1\",\"skuPartNumber\":\"ENTERPRISEPACK\",\"consumedUnits\":20,\"prepaidUnits\":{\"enabled\":25}},"
        + "{\"skuId\":\"sku-unknown\",\"skuPartNumber\":\"UNKNOWN_SKU\",\"consumedUnits\":2,\"prepaidUnits\":{\"enabled\":3}}]}";
    HttpServer server = startGraphServer(200, body, "", "");
    try {
      UsageInventorySnapshotResult result = connector(server).fetchUsageSnapshot(microsoftRequest("managed-secret-ref"));
      assertTrue(result.accepted());
      assertTrue(result.partial());
      assertTrue(result.warnings().contains("unmapped_microsoft_sku"));
      assertTrue(result.warnings().contains("missing_activity_report_30d"));
      assertNull(result.records().get(0).activeUsers30d());
    } finally {
      server.stop(0);
    }
  }

  @Test
  void microsoft365ConnectorMarksStaleReportsAsInsufficientEvidence() throws Exception {
    String stale = "Report Refresh Date,User Principal Name,Assigned Products\n2020-01-01,redacted-user,Office 365 E3\n";
    HttpServer server = startGraphServer(200, subscribedSkusBody(), stale, stale);
    try {
      UsageInventorySnapshotResult result = connector(server).fetchUsageSnapshot(microsoftRequest("managed-secret-ref"));
      assertTrue(result.accepted());
      assertTrue(result.partial());
      assertTrue(result.warnings().contains("stale_activity_report"));
    } finally {
      server.stop(0);
    }
  }

  private static HttpServer startGraphServer(int subscribedSkusStatus, String subscribedSkusBody, String d30Body, String d90Body) throws Exception {
    HttpServer server = HttpServer.create(new InetSocketAddress(0), 0);
    server.createContext("/subscribedSkus", exchange -> {
      byte[] body = subscribedSkusBody.getBytes(StandardCharsets.UTF_8);
      exchange.sendResponseHeaders(subscribedSkusStatus, body.length);
      exchange.getResponseBody().write(body);
      exchange.close();
    });
    server.createContext("/reports/getOffice365ActiveUserDetail", exchange -> {
      String query = exchange.getRequestURI().getQuery();
      byte[] body = (query != null && query.contains("D90") ? d90Body : d30Body).getBytes(StandardCharsets.UTF_8);
      exchange.sendResponseHeaders(200, body.length);
      exchange.getResponseBody().write(body);
      exchange.close();
    });
    server.start();
    return server;
  }

  private static String subscribedSkusBody() {
    return "{\"value\":[{\"skuId\":\"sku-1\",\"skuPartNumber\":\"ENTERPRISEPACK\",\"consumedUnits\":20,\"prepaidUnits\":{\"enabled\":25}}]}";
  }

  private static String activeUsersCsv() {
    return "Report Refresh Date,User Principal Name,Assigned Products\n2026-08-17,redacted-user,Office 365 E3\n";
  }

  private static Microsoft365UsageInventoryConnector connector(HttpServer server) {
    return new Microsoft365UsageInventoryConnector(
        URI.create("http://localhost:" + server.getAddress().getPort()),
        HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(2)).build(),
        null
    );
  }

  private static UsageInventorySnapshotRequest microsoftRequest(String credentialReference) {
    return new UsageInventorySnapshotRequest(
        "org-1", "subscription_usage", "microsoft_365", "tenant-1", null, null,
        credentialReference, "test-token", null, 50, "idem-1"
    );
  }
}
