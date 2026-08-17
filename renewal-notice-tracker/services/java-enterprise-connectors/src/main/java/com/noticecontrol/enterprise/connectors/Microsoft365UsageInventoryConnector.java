package com.noticecontrol.enterprise.connectors;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.noticecontrol.enterprise.models.UsageInventoryRecord;
import com.noticecontrol.enterprise.models.UsageInventorySnapshotRequest;
import com.noticecontrol.enterprise.models.UsageInventorySnapshotResult;
import java.io.IOException;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

public final class Microsoft365UsageInventoryConnector implements UsageInventoryConnector {
  private static final int MAX_PAGE_SIZE = 500;
  private static final int MAX_RESPONSE_BYTES = 2_000_000;
  private static final int MAX_ATTEMPTS = 4;
  private final URI graphBaseUrl;
  private final HttpClient httpClient;
  private final MicrosoftGraphAccessTokenProvider tokenProvider;
  private final ObjectMapper objectMapper = new ObjectMapper();

  public Microsoft365UsageInventoryConnector(HttpClient httpClient, MicrosoftGraphAccessTokenProvider tokenProvider) {
    this(URI.create("https://graph.microsoft.com/v1.0"), httpClient, tokenProvider);
  }

  public Microsoft365UsageInventoryConnector(
      URI graphBaseUrl,
      HttpClient httpClient,
      MicrosoftGraphAccessTokenProvider tokenProvider
  ) {
    this.graphBaseUrl = graphBaseUrl;
    this.httpClient = httpClient;
    this.tokenProvider = tokenProvider;
  }

  @Override
  public UsageInventorySnapshotResult fetchUsageSnapshot(UsageInventorySnapshotRequest request) {
    if (!"subscription_usage".equals(request.connectorType()) || !"microsoft_365".equals(request.provider())) {
      return rejected(request.connectorType(), "unsupported_connector");
    }
    if (request.organizationId() == null || request.organizationId().isBlank() || request.tenantId() == null || request.tenantId().isBlank()) {
      return rejected(request.connectorType(), "missing_scope");
    }

    String token;
    try {
      token = tokenProvider.getAccessToken(request.tenantId(), request.credentialReference());
    } catch (RuntimeException exception) {
      return rejected(request.connectorType(), exception.getMessage() == null ? "credential_unavailable" : exception.getMessage());
    }

    try {
      List<UsageInventoryRecord> records = fetchSubscribedSkuRecords(token, Math.min(Math.max(request.pageSize(), 1), MAX_PAGE_SIZE));
      Map<String, ActivityCounts> activity30 = fetchActivityCounts(token, "D30");
      Map<String, ActivityCounts> activity90 = fetchActivityCounts(token, "D90");
      String collectedAt = Instant.now().toString();
      List<UsageInventoryRecord> merged = records.stream()
          .map(record -> mergeActivity(record, activity30, activity90, collectedAt))
          .toList();
      return new UsageInventorySnapshotResult(true, request.connectorType(), merged, null, List.of(), 0, false);
    } catch (GraphConnectorException exception) {
      return rejected(request.connectorType(), exception.safeCode());
    }
  }

  private List<UsageInventoryRecord> fetchSubscribedSkuRecords(String token, int pageSize) {
    String path = "/subscribedSkus?$select=skuId,skuPartNumber,consumedUnits,prepaidUnits";
    List<UsageInventoryRecord> records = new ArrayList<>();
    String next = path;
    while (next != null && records.size() < pageSize) {
      JsonNode payload = getJson(token, next);
      JsonNode values = payload.path("value");
      if (!values.isArray()) {
        throw new GraphConnectorException("malformed_subscribed_skus_response");
      }
      for (JsonNode item : values) {
        if (records.size() >= pageSize) break;
        String skuId = item.path("skuId").asText("");
        String sku = item.path("skuPartNumber").asText("");
        int purchased = Math.max(0, item.path("prepaidUnits").path("enabled").asInt(0));
        int assigned = Math.max(0, item.path("consumedUnits").asInt(0));
        if (!skuId.isBlank() && !sku.isBlank()) {
          records.add(new UsageInventoryRecord(skuId, "Microsoft", sku, "productivity", purchased, assigned, 0, 0, null, Instant.now().toString(), "Microsoft Graph subscribedSkus", List.of()));
        }
      }
      next = payload.path("@odata.nextLink").isTextual() ? payload.path("@odata.nextLink").asText() : null;
    }
    return records;
  }

  private Map<String, ActivityCounts> fetchActivityCounts(String token, String period) {
    String encodedPeriod = URLEncoder.encode("'" + period + "'", StandardCharsets.UTF_8).replace("%27", "'");
    String csv = getText(token, "/reports/getOffice365ActiveUserDetail(period=" + encodedPeriod + ")");
    Map<String, ActivityCounts> counts = new HashMap<>();
    String[] lines = csv.split("\\r?\\n");
    if (lines.length < 2) return counts;
    String[] headers = splitCsv(lines[0]);
    int productsIndex = indexOf(headers, "Assigned Products");
    int reportDateIndex = indexOf(headers, "Report Refresh Date");
    if (productsIndex < 0) return counts;
    for (int index = 1; index < lines.length; index += 1) {
      String[] cells = splitCsv(lines[index]);
      if (cells.length <= productsIndex) continue;
      String lastActivity = reportDateIndex >= 0 && cells.length > reportDateIndex ? cells[reportDateIndex] : null;
      for (String product : cells[productsIndex].split("\\+")) {
        String key = normalize(product);
        if (!key.isBlank()) {
          counts.computeIfAbsent(key, ignored -> new ActivityCounts()).increment(lastActivity);
        }
      }
    }
    return counts;
  }

  private UsageInventoryRecord mergeActivity(
      UsageInventoryRecord record,
      Map<String, ActivityCounts> activity30,
      Map<String, ActivityCounts> activity90,
      String collectedAt
  ) {
    String key = normalize(record.product());
    ActivityCounts d30 = activity30.getOrDefault(key, new ActivityCounts());
    ActivityCounts d90 = activity90.getOrDefault(key, new ActivityCounts());
    return new UsageInventoryRecord(
        record.externalProductId(),
        record.vendor(),
        record.product(),
        record.category(),
        record.purchasedSeats(),
        record.assignedSeats(),
        d30.count,
        d90.count,
        d30.lastActivityAt,
        collectedAt,
        "Microsoft Graph subscribedSkus and usage reports",
        List.of()
    );
  }

  private JsonNode getJson(String token, String pathOrUrl) {
    try {
      return objectMapper.readTree(getText(token, pathOrUrl));
    } catch (IOException exception) {
      throw new GraphConnectorException("malformed_graph_json");
    }
  }

  private String getText(String token, String pathOrUrl) {
    URI uri = pathOrUrl.startsWith("https://") ? URI.create(pathOrUrl) : graphBaseUrl.resolve(pathOrUrl);
    int attempt = 0;
    while (attempt < MAX_ATTEMPTS) {
      attempt += 1;
      try {
        HttpRequest request = HttpRequest.newBuilder(uri)
            .timeout(Duration.ofSeconds(8))
            .header("Authorization", "Bearer " + token)
            .header("Accept", "application/json,text/csv")
            .GET()
            .build();
        HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
        if (response.body() != null && response.body().getBytes(StandardCharsets.UTF_8).length > MAX_RESPONSE_BYTES) {
          throw new GraphConnectorException("provider_payload_too_large");
        }
        if (response.statusCode() == 429 || response.statusCode() == 503 || response.statusCode() == 504) {
          sleepBackoff(response, attempt);
          continue;
        }
        if (response.statusCode() >= 300 && response.statusCode() < 400) {
          String location = response.headers().firstValue("Location").orElse("");
          if (!location.isBlank()) return getText(token, location);
        }
        if (response.statusCode() == 401 || response.statusCode() == 403) throw new GraphConnectorException("unauthorized");
        if (response.statusCode() >= 400) throw new GraphConnectorException("provider_request_failed");
        return response.body() == null ? "" : response.body();
      } catch (GraphConnectorException exception) {
        throw exception;
      } catch (InterruptedException exception) {
        Thread.currentThread().interrupt();
        throw new GraphConnectorException("provider_timeout");
      } catch (Exception exception) {
        if (attempt >= MAX_ATTEMPTS) throw new GraphConnectorException("provider_timeout");
        sleepMillis(100L * attempt);
      }
    }
    throw new GraphConnectorException("provider_retry_exhausted");
  }

  private static void sleepBackoff(HttpResponse<?> response, int attempt) {
    String retryAfter = response.headers().firstValue("Retry-After").orElse("");
    long retryMillis = 100L * attempt;
    try {
      if (!retryAfter.isBlank()) retryMillis = Math.min(2_000L, Long.parseLong(retryAfter) * 1_000L);
    } catch (NumberFormatException ignored) {
      retryMillis = 100L * attempt;
    }
    sleepMillis(retryMillis);
  }

  private static void sleepMillis(long millis) {
    try {
      Thread.sleep(Math.min(millis, 2_000L));
    } catch (InterruptedException exception) {
      Thread.currentThread().interrupt();
      throw new GraphConnectorException("provider_timeout");
    }
  }

  private static UsageInventorySnapshotResult rejected(String connectorType, String warning) {
    return new UsageInventorySnapshotResult(false, connectorType, List.of(), null, List.of(warning), 0, false);
  }

  private static String[] splitCsv(String line) {
    return line.split(",", -1);
  }

  private static int indexOf(String[] values, String expected) {
    for (int index = 0; index < values.length; index += 1) {
      if (expected.equalsIgnoreCase(values[index].trim())) return index;
    }
    return -1;
  }

  private static String normalize(String value) {
    return value == null ? "" : value.toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9]+", " ").trim();
  }

  private static final class ActivityCounts {
    private int count = 0;
    private String lastActivityAt = null;

    private void increment(String lastActivity) {
      count += 1;
      if (lastActivity != null && !lastActivity.isBlank()) lastActivityAt = lastActivity;
    }
  }

  private static final class GraphConnectorException extends RuntimeException {
    private final String safeCode;

    private GraphConnectorException(String safeCode) {
      super(safeCode);
      this.safeCode = safeCode;
    }

    private String safeCode() {
      return safeCode;
    }
  }
}
