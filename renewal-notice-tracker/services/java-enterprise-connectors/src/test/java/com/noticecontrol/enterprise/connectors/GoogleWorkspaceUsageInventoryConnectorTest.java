package com.noticecontrol.enterprise.connectors;

import com.noticecontrol.enterprise.models.UsageInventorySnapshotRequest;
import com.noticecontrol.enterprise.models.UsageInventorySnapshotResult;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import java.net.InetSocketAddress;
import java.net.URI;
import java.net.http.HttpClient;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class GoogleWorkspaceUsageInventoryConnectorTest {
  @Test
  void paginatesLicensingAndUsageWithoutReturningUserIdentities() throws Exception {
    AtomicInteger licensingCalls = new AtomicInteger();
    AtomicInteger reportCalls = new AtomicInteger();
    HttpServer server = server(exchange -> {
      if (exchange.getRequestURI().getPath().contains("/apps/licensing/")) {
        int call = licensingCalls.incrementAndGet();
        json(exchange, 200, call == 1
            ? "{\"items\":[{\"skuId\":\"sku-1\",\"skuName\":\"Google Workspace Business Standard\",\"userId\":\"person-one@example.com\"}],\"nextPageToken\":\"next\"}"
            : "{\"items\":[{\"skuId\":\"sku-1\",\"skuName\":\"Google Workspace Business Standard\",\"userId\":\"person-two@example.com\"}]}"
        );
        return;
      }
      int call = reportCalls.incrementAndGet();
      json(exchange, 200, call == 1
          ? usage("person-one@example.com", "2026-08-16T09:00:00Z", "next")
          : usage("person-two@example.com", "2026-08-16T08:00:00Z", null));
    });
    try {
      UsageInventorySnapshotResult result = connector(server, Duration.ofSeconds(1)).fetchUsageSnapshot(request());
      assertTrue(result.accepted());
      assertEquals(2, licensingCalls.get());
      assertEquals(2, reportCalls.get());
      assertEquals(2, result.records().get(0).assignedSeats());
      assertEquals(2, result.records().get(0).activeUsers30d());
      assertFalse(result.toString().contains("person-one"));
      assertFalse(result.toString().contains("access-token"));
    } finally {
      server.stop(0);
    }
  }

  @Test
  void retriesThrottledRequestsWithBoundedBackoff() throws Exception {
    AtomicInteger calls = new AtomicInteger();
    HttpServer server = server(exchange -> {
      if (exchange.getRequestURI().getPath().contains("/apps/licensing/") && calls.incrementAndGet() == 1) {
        exchange.getResponseHeaders().add("Retry-After", "0");
        json(exchange, 429, "{\"error\":\"provider payload must not leak\"}");
      } else if (exchange.getRequestURI().getPath().contains("/apps/licensing/")) {
        json(exchange, 200, licensing());
      } else {
        json(exchange, 200, usage("person@example.com", "2026-08-16T09:00:00Z", null));
      }
    });
    try {
      UsageInventorySnapshotResult result = connector(server, Duration.ofSeconds(1)).fetchUsageSnapshot(request());
      assertTrue(result.accepted());
      assertEquals(1, result.retryCount());
      assertFalse(result.toString().contains("provider payload"));
    } finally {
      server.stop(0);
    }
  }

  @Test
  void reportsRevokedAccessWithoutProviderPayloads() throws Exception {
    HttpServer server = server(exchange -> json(exchange, 401, "{\"token\":\"raw-secret\"}"));
    try {
      UsageInventorySnapshotResult result = connector(server, Duration.ofSeconds(1)).fetchUsageSnapshot(request());
      assertFalse(result.accepted());
      assertTrue(result.warnings().contains("unauthorized"));
      assertFalse(result.toString().contains("raw-secret"));
    } finally {
      server.stop(0);
    }
  }

  @Test
  void preservesLicensingDataWhenActivityIsTemporarilyUnavailable() throws Exception {
    HttpServer server = server(exchange -> {
      if (exchange.getRequestURI().getPath().contains("/apps/licensing/")) json(exchange, 200, licensing());
      else json(exchange, 500, "{\"internal\":\"raw provider failure\"}");
    });
    try {
      UsageInventorySnapshotResult result = connector(server, Duration.ofSeconds(1)).fetchUsageSnapshot(request());
      assertTrue(result.accepted());
      assertTrue(result.partial());
      assertTrue(result.warnings().contains("partial_activity_data"));
      assertFalse(result.toString().contains("raw provider failure"));
    } finally {
      server.stop(0);
    }
  }

  @Test
  void rejectsMalformedLicensingResponsesSafely() throws Exception {
    HttpServer server = server(exchange -> json(exchange, 200, "{\"items\":{\"unexpected\":true}}"));
    try {
      UsageInventorySnapshotResult result = connector(server, Duration.ofSeconds(1)).fetchUsageSnapshot(request());
      assertFalse(result.accepted());
      assertTrue(result.warnings().contains("malformed_licensing_response"));
    } finally {
      server.stop(0);
    }
  }

  @Test
  void timesOutWithOnlyASafeFailureCode() throws Exception {
    HttpServer server = server(exchange -> {
      try {
        Thread.sleep(150);
      } catch (InterruptedException exception) {
        Thread.currentThread().interrupt();
      }
      json(exchange, 200, licensing());
    });
    try {
      UsageInventorySnapshotResult result = connector(server, Duration.ofMillis(25)).fetchUsageSnapshot(request());
      assertFalse(result.accepted());
      assertTrue(result.warnings().contains("provider_timeout"));
    } finally {
      server.stop(0);
    }
  }

  private static GoogleWorkspaceUsageInventoryConnector connector(HttpServer server, Duration timeout) {
    URI base = URI.create("http://localhost:" + server.getAddress().getPort());
    return new GoogleWorkspaceUsageInventoryConnector(
        base,
        base,
        HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(1)).build(),
        timeout,
        1L
    );
  }

  private static UsageInventorySnapshotRequest request() {
    return new UsageInventorySnapshotRequest(
        "org-1", "subscription_usage", "google_workspace", null, "C01234567", "example.com",
        "managed-secret-ref", "access-token", null, 500, "idem-1"
    );
  }

  private static HttpServer server(Handler handler) throws Exception {
    HttpServer server = HttpServer.create(new InetSocketAddress(0), 0);
    server.createContext("/", exchange -> handler.handle(exchange));
    server.start();
    return server;
  }

  private static String licensing() {
    return "{\"items\":[{\"skuId\":\"sku-1\",\"skuName\":\"Google Workspace Business Standard\",\"userId\":\"person@example.com\"}]}";
  }

  private static String usage(String user, String lastLogin, String nextPageToken) {
    String next = nextPageToken == null ? "" : ",\"nextPageToken\":\"" + nextPageToken + "\"";
    return "{\"usageReports\":[{\"entity\":{\"userEmail\":\"" + user + "\"},\"parameters\":[{\"name\":\"accounts:last_login_time\",\"datetimeValue\":\"" + lastLogin + "\"}]}]" + next + "}";
  }

  private static void json(HttpExchange exchange, int status, String value) throws java.io.IOException {
    byte[] body = value.getBytes(StandardCharsets.UTF_8);
    exchange.getResponseHeaders().add("Content-Type", "application/json");
    exchange.sendResponseHeaders(status, body.length);
    exchange.getResponseBody().write(body);
    exchange.close();
  }

  @FunctionalInterface
  private interface Handler {
    void handle(HttpExchange exchange) throws java.io.IOException;
  }
}
