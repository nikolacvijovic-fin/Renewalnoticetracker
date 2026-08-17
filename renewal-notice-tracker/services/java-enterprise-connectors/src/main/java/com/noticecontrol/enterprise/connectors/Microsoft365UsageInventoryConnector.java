package com.noticecontrol.enterprise.connectors;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.noticecontrol.enterprise.models.UsageInventoryRecord;
import com.noticecontrol.enterprise.models.UsageInventorySnapshotRequest;
import com.noticecontrol.enterprise.models.UsageInventorySnapshotResult;
import java.io.IOException;
import java.io.StringReader;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.apache.commons.csv.CSVFormat;
import org.apache.commons.csv.CSVParser;
import org.apache.commons.csv.CSVRecord;

public final class Microsoft365UsageInventoryConnector implements UsageInventoryConnector {
  private static final int MAX_PAGE_SIZE = 500;
  private static final int MAX_RESPONSE_BYTES = 2_000_000;
  private static final int MAX_REPORT_ROWS = 50_000;
  private static final int MAX_ATTEMPTS = 4;
  private static final int STALE_REPORT_DAYS = 14;
  private final URI graphBaseUrl;
  private final HttpClient httpClient;
  private final MicrosoftGraphAccessTokenProvider developmentTokenProvider;
  private final ObjectMapper objectMapper = new ObjectMapper();
  private final MicrosoftSkuCatalog skuCatalog = MicrosoftSkuCatalog.loadDefault();

  public Microsoft365UsageInventoryConnector(HttpClient httpClient) {
    this(URI.create("https://graph.microsoft.com/v1.0"), httpClient, null);
  }

  /** Development/test compatibility only. Production supplies a short-lived request token. */
  public Microsoft365UsageInventoryConnector(HttpClient httpClient, MicrosoftGraphAccessTokenProvider tokenProvider) {
    this(URI.create("https://graph.microsoft.com/v1.0"), httpClient, tokenProvider);
  }

  public Microsoft365UsageInventoryConnector(URI graphBaseUrl, HttpClient httpClient, MicrosoftGraphAccessTokenProvider tokenProvider) {
    this.graphBaseUrl = graphBaseUrl;
    this.httpClient = httpClient;
    this.developmentTokenProvider = tokenProvider;
  }

  @Override
  public UsageInventorySnapshotResult fetchUsageSnapshot(UsageInventorySnapshotRequest request) {
    if (!"subscription_usage".equals(request.connectorType()) || !"microsoft_365".equals(request.provider())) {
      return rejected(request.connectorType(), "unsupported_connector");
    }
    if (isBlank(request.organizationId()) || isBlank(request.tenantId())) return rejected(request.connectorType(), "missing_scope");

    String token = request.providerAccessToken();
    try {
      if (isBlank(token) && developmentTokenProvider != null) {
        token = developmentTokenProvider.getAccessToken(request.tenantId(), request.credentialReference());
      }
      if (isBlank(token)) throw new IllegalStateException("credential_unavailable");
    } catch (RuntimeException exception) {
      return rejected(request.connectorType(), safeCode(exception, "credential_unavailable"));
    }

    try {
      Set<String> snapshotWarnings = new LinkedHashSet<>();
      List<Entitlement> entitlements = fetchSubscribedSkus(token, Math.min(Math.max(request.pageSize(), 1), MAX_PAGE_SIZE), snapshotWarnings);
      ActivityReport activity30 = safeActivityReport(token, "D30", "30d", snapshotWarnings);
      ActivityReport activity90 = safeActivityReport(token, "D90", "90d", snapshotWarnings);
      String collectedAt = Instant.now().toString();
      List<UsageInventoryRecord> records = entitlements.stream()
          .map(entitlement -> buildRecord(entitlement, activity30, activity90, collectedAt, snapshotWarnings))
          .toList();
      boolean partial = snapshotWarnings.stream().anyMatch(Microsoft365UsageInventoryConnector::isEvidenceWarning);
      return new UsageInventorySnapshotResult(true, request.connectorType(), records, null, List.copyOf(snapshotWarnings), 0, partial);
    } catch (GraphConnectorException exception) {
      return rejected(request.connectorType(), exception.safeCode());
    }
  }

  private List<Entitlement> fetchSubscribedSkus(String token, int pageSize, Set<String> warnings) {
    String next = "/subscribedSkus?$select=skuId,skuPartNumber,consumedUnits,prepaidUnits";
    List<Entitlement> records = new ArrayList<>();
    while (next != null && records.size() < pageSize) {
      JsonNode payload = getJson(token, next);
      JsonNode values = payload.path("value");
      if (!values.isArray()) throw new GraphConnectorException("malformed_subscribed_skus_response");
      for (JsonNode item : values) {
        if (records.size() >= pageSize) break;
        String skuId = item.path("skuId").asText("");
        String skuPartNumber = item.path("skuPartNumber").asText("");
        if (skuId.isBlank() || skuPartNumber.isBlank()) continue;
        MicrosoftSkuCatalog.Product mapped = skuCatalog.bySkuPartNumber(skuPartNumber).orElse(null);
        List<String> recordWarnings = new ArrayList<>();
        if (mapped == null) {
          warnings.add("unmapped_microsoft_sku");
          recordWarnings.add("unmapped_microsoft_sku");
        }
        records.add(new Entitlement(
            mapped == null ? "unmapped:" + skuId : mapped.canonicalId(),
            mapped == null ? skuPartNumber : mapped.displayName(),
            mapped == null ? "unknown" : mapped.category(),
            Math.max(0, item.path("prepaidUnits").path("enabled").asInt(0)),
            Math.max(0, item.path("consumedUnits").asInt(0)),
            recordWarnings
        ));
      }
      next = payload.path("@odata.nextLink").isTextual() ? payload.path("@odata.nextLink").asText() : null;
    }
    return records;
  }

  private ActivityReport safeActivityReport(String token, String period, String label, Set<String> warnings) {
    try {
      return fetchActivityReport(token, period, warnings);
    } catch (GraphConnectorException exception) {
      if ("unauthorized".equals(exception.safeCode())) throw exception;
      warnings.add("missing_activity_report_" + label);
      return ActivityReport.missing();
    }
  }

  private ActivityReport fetchActivityReport(String token, String period, Set<String> warnings) {
    String encodedPeriod = URLEncoder.encode("'" + period + "'", StandardCharsets.UTF_8).replace("%27", "'");
    String csv = getText(token, "/reports/getOffice365ActiveUserDetail(period=" + encodedPeriod + ")");
    if (csv.isBlank()) throw new GraphConnectorException("missing_activity_report");
    if (csv.charAt(0) == '\ufeff') csv = csv.substring(1);
    Map<String, ActivityCounts> counts = new HashMap<>();
    try (CSVParser parser = CSVFormat.DEFAULT.builder()
        .setHeader()
        .setSkipHeaderRecord(true)
        .setIgnoreEmptyLines(true)
        .get()
        .parse(new StringReader(csv))) {
      String productsHeader = findHeader(parser, "Assigned Products");
      String reportDateHeader = findHeader(parser, "Report Refresh Date");
      if (productsHeader == null) throw new GraphConnectorException("malformed_activity_report");
      int rows = 0;
      for (CSVRecord record : parser) {
        rows += 1;
        if (rows > MAX_REPORT_ROWS) throw new GraphConnectorException("provider_row_limit_exceeded");
        String reportDate = reportDateHeader == null ? null : record.get(reportDateHeader);
        if (isStaleReport(reportDate)) warnings.add("stale_activity_report");
        for (String reportProduct : record.get(productsHeader).split("\\+")) {
          MicrosoftSkuCatalog.Product mapped = skuCatalog.byReportName(reportProduct).orElse(null);
          if (mapped == null) {
            if (!reportProduct.isBlank()) warnings.add("unmapped_activity_product");
            continue;
          }
          counts.computeIfAbsent(mapped.canonicalId(), ignored -> new ActivityCounts()).increment(reportDate);
        }
      }
      return new ActivityReport(counts, true);
    } catch (GraphConnectorException exception) {
      throw exception;
    } catch (IOException | IllegalArgumentException exception) {
      throw new GraphConnectorException("malformed_activity_report");
    }
  }

  private UsageInventoryRecord buildRecord(Entitlement entitlement, ActivityReport activity30, ActivityReport activity90, String collectedAt, Set<String> snapshotWarnings) {
    ActivityCounts d30 = activity30.counts().get(entitlement.canonicalId());
    ActivityCounts d90 = activity90.counts().get(entitlement.canonicalId());
    Integer active30 = activity30.available() ? d30 == null ? 0 : d30.count : null;
    Integer active90 = activity90.available() ? d90 == null ? 0 : d90.count : null;
    List<String> warnings = new ArrayList<>(entitlement.warnings());
    if (!activity30.available()) warnings.add("missing_activity_report_30d");
    if (!activity90.available()) warnings.add("missing_activity_report_90d");
    if (active30 != null && (active30 > entitlement.assigned() || active30 > entitlement.purchased())) {
      warnings.add("active_users_exceed_entitlement");
      snapshotWarnings.add("active_users_exceed_entitlement");
    }
    if (snapshotWarnings.contains("stale_activity_report")) warnings.add("stale_activity_report");
    return new UsageInventoryRecord(
        entitlement.canonicalId(), "Microsoft", entitlement.displayName(), entitlement.category(),
        entitlement.purchased(), entitlement.assigned(), active30, active90,
        d30 == null ? null : d30.lastActivityAt, collectedAt,
        "Microsoft Graph subscribedSkus and usage reports; " + skuCatalog.version(),
        List.copyOf(new LinkedHashSet<>(warnings))
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
    URI uri = pathOrUrl.startsWith("https://") || pathOrUrl.startsWith("http://")
        ? URI.create(pathOrUrl)
        : graphBaseUrl.resolve(pathOrUrl);
    if (!sameOrigin(uri, graphBaseUrl)) throw new GraphConnectorException("provider_endpoint_forbidden");
    int attempt = 0;
    while (attempt < MAX_ATTEMPTS) {
      attempt += 1;
      try {
        HttpRequest request = HttpRequest.newBuilder(uri).timeout(Duration.ofSeconds(8))
            .header("Authorization", "Bearer " + token).header("Accept", "application/json,text/csv").GET().build();
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

  private static String findHeader(CSVParser parser, String expected) {
    return parser.getHeaderMap().keySet().stream()
        .filter(header -> expected.equalsIgnoreCase(header.replace("\ufeff", "").trim()))
        .findFirst().orElse(null);
  }

  private static boolean sameOrigin(URI candidate, URI base) {
    int candidatePort = candidate.getPort() == -1 ? defaultPort(candidate.getScheme()) : candidate.getPort();
    int basePort = base.getPort() == -1 ? defaultPort(base.getScheme()) : base.getPort();
    return base.getScheme().equalsIgnoreCase(candidate.getScheme())
        && base.getHost().equalsIgnoreCase(candidate.getHost())
        && candidatePort == basePort;
  }

  private static int defaultPort(String scheme) {
    return "https".equalsIgnoreCase(scheme) ? 443 : "http".equalsIgnoreCase(scheme) ? 80 : -1;
  }

  private static boolean isStaleReport(String value) {
    try {
      Instant reportDate = LocalDate.parse(value).atStartOfDay().toInstant(ZoneOffset.UTC);
      return ChronoUnit.DAYS.between(reportDate, Instant.now()) > STALE_REPORT_DAYS;
    } catch (Exception ignored) {
      return false;
    }
  }

  private static boolean isEvidenceWarning(String warning) {
    return warning.startsWith("missing_activity") || warning.startsWith("unmapped_")
        || warning.startsWith("stale_") || warning.startsWith("partial_")
        || "active_users_exceed_entitlement".equals(warning);
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

  private static String safeCode(RuntimeException exception, String fallback) {
    String value = exception.getMessage();
    return value != null && value.matches("[a-z0-9_]{3,80}") ? value : fallback;
  }

  private static boolean isBlank(String value) {
    return value == null || value.isBlank();
  }

  private record Entitlement(String canonicalId, String displayName, String category, int purchased, int assigned, List<String> warnings) {}

  private record ActivityReport(Map<String, ActivityCounts> counts, boolean available) {
    private static ActivityReport missing() { return new ActivityReport(Map.of(), false); }
  }

  private static final class ActivityCounts {
    private int count = 0;
    private String lastActivityAt = null;
    private void increment(String reportDate) {
      count += 1;
      if (reportDate != null && !reportDate.isBlank()) lastActivityAt = reportDate;
    }
  }

  private static final class GraphConnectorException extends RuntimeException {
    private final String safeCode;
    private GraphConnectorException(String safeCode) { super(safeCode); this.safeCode = safeCode; }
    private String safeCode() { return safeCode; }
  }
}
