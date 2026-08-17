package com.noticecontrol.enterprise.connectors;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.noticecontrol.enterprise.models.UsageInventoryRecord;
import com.noticecontrol.enterprise.models.UsageInventorySnapshotRequest;
import com.noticecontrol.enterprise.models.UsageInventorySnapshotResult;
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
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.atomic.AtomicInteger;

public final class GoogleWorkspaceUsageInventoryConnector implements UsageInventoryConnector {
  private static final int MAX_PAGE_SIZE = 500;
  private static final int MAX_RESPONSE_BYTES = 2_000_000;
  private static final int MAX_ATTEMPTS = 4;
  private static final int MAX_PAGES = 100;
  private final URI licensingBaseUrl;
  private final URI adminBaseUrl;
  private final HttpClient httpClient;
  private final Duration requestTimeout;
  private final long retryBaseMillis;
  private final ObjectMapper objectMapper = new ObjectMapper();

  public GoogleWorkspaceUsageInventoryConnector(HttpClient httpClient) {
    this(URI.create("https://licensing.googleapis.com"), URI.create("https://admin.googleapis.com"), httpClient, Duration.ofSeconds(8), 100L);
  }

  public GoogleWorkspaceUsageInventoryConnector(URI licensingBaseUrl, URI adminBaseUrl, HttpClient httpClient) {
    this(licensingBaseUrl, adminBaseUrl, httpClient, Duration.ofSeconds(8), 100L);
  }

  GoogleWorkspaceUsageInventoryConnector(
      URI licensingBaseUrl,
      URI adminBaseUrl,
      HttpClient httpClient,
      Duration requestTimeout,
      long retryBaseMillis
  ) {
    this.licensingBaseUrl = licensingBaseUrl;
    this.adminBaseUrl = adminBaseUrl;
    this.httpClient = httpClient;
    this.requestTimeout = requestTimeout;
    this.retryBaseMillis = retryBaseMillis;
  }

  @Override
  public UsageInventorySnapshotResult fetchUsageSnapshot(UsageInventorySnapshotRequest request) {
    AtomicInteger retryCount = new AtomicInteger();
    if (!"subscription_usage".equals(request.connectorType()) || !"google_workspace".equals(request.provider())) {
      return rejected(request.connectorType(), "unsupported_connector", retryCount.get());
    }
    if (isBlank(request.organizationId()) || isBlank(request.customerId()) || isBlank(request.domain())) {
      return rejected(request.connectorType(), "missing_scope", retryCount.get());
    }
    if (isBlank(request.providerAccessToken())) return rejected(request.connectorType(), "missing_managed_secret", retryCount.get());

    List<String> warnings = new ArrayList<>();
    try {
      Map<String, Set<String>> assignments = fetchLicenseAssignments(request, request.providerAccessToken(), retryCount);
      ActivityEvidence activity;
      try {
        activity = fetchActivityEvidence(request, request.providerAccessToken(), retryCount);
      } catch (GoogleConnectorException exception) {
        if ("unauthorized".equals(exception.safeCode())) throw exception;
        warnings.add("partial_activity_data");
        activity = new ActivityEvidence(Set.of(), Set.of(), null);
      }

      warnings.add("purchased_seats_unavailable");
      warnings.add("activity_uses_account_login_proxy");
      String collectedAt = Instant.now().toString();
      List<UsageInventoryRecord> records = assignments.entrySet().stream()
          .limit(Math.min(Math.max(request.pageSize(), 1), MAX_PAGE_SIZE))
          .map(entry -> buildRecord(entry.getKey(), entry.getValue(), activity, collectedAt, warnings))
          .toList();
      return new UsageInventorySnapshotResult(
          true,
          request.connectorType(),
          records,
          null,
          warnings.stream().distinct().toList(),
          retryCount.get(),
          warnings.contains("partial_activity_data")
      );
    } catch (GoogleConnectorException exception) {
      return rejected(request.connectorType(), exception.safeCode(), retryCount.get());
    }
  }

  private Map<String, Set<String>> fetchLicenseAssignments(UsageInventorySnapshotRequest request, String token, AtomicInteger retryCount) {
    Map<String, Set<String>> assignments = new HashMap<>();
    String nextPageToken = null;
    int pageCount = 0;
    do {
      if (++pageCount > MAX_PAGES) throw new GoogleConnectorException("provider_page_limit_exceeded");
      String path = "/apps/licensing/v1/product/Google-Apps/users?customerId=" + encode(request.customerId()) + "&maxResults=1000";
      if (nextPageToken != null) path += "&pageToken=" + encode(nextPageToken);
      JsonNode payload = getJson(licensingBaseUrl.resolve(path), token, retryCount);
      JsonNode items = payload.path("items");
      if (!items.isMissingNode() && !items.isArray()) throw new GoogleConnectorException("malformed_licensing_response");
      for (JsonNode item : items) {
        String skuId = item.path("skuId").asText("");
        String skuName = item.path("skuName").asText("");
        String userId = item.path("userId").asText("");
        if (!skuId.isBlank() && !userId.isBlank()) {
          String key = skuId + "\u001f" + (skuName.isBlank() ? "Google Workspace " + skuId : skuName);
          assignments.computeIfAbsent(key, ignored -> new HashSet<>()).add(normalizeIdentity(userId));
        }
      }
      nextPageToken = payload.path("nextPageToken").asText(null);
    } while (nextPageToken != null && !nextPageToken.isBlank());
    return assignments;
  }

  private ActivityEvidence fetchActivityEvidence(UsageInventorySnapshotRequest request, String token, AtomicInteger retryCount) {
    Set<String> active30 = new HashSet<>();
    Set<String> active90 = new HashSet<>();
    Instant latestActivity = null;
    String reportDate = LocalDate.now(ZoneOffset.UTC).minusDays(1).toString();
    String nextPageToken = null;
    int pageCount = 0;
    do {
      if (++pageCount > MAX_PAGES) throw new GoogleConnectorException("provider_page_limit_exceeded");
      String path = "/admin/reports/v1/usage/users/all/dates/" + reportDate
          + "?customerId=" + encode(request.customerId())
          + "&parameters=accounts:last_login_time&maxResults=500";
      if (nextPageToken != null) path += "&pageToken=" + encode(nextPageToken);
      JsonNode payload = getJson(adminBaseUrl.resolve(path), token, retryCount);
      JsonNode reports = payload.path("usageReports");
      if (!reports.isMissingNode() && !reports.isArray()) throw new GoogleConnectorException("malformed_reports_response");
      for (JsonNode report : reports) {
        String identity = normalizeIdentity(report.path("entity").path("userEmail").asText(""));
        Instant lastLogin = readLastLogin(report.path("parameters"));
        if (identity.isBlank() || lastLogin == null) continue;
        if (lastLogin.isAfter(Instant.now().minus(Duration.ofDays(90)))) active90.add(identity);
        if (lastLogin.isAfter(Instant.now().minus(Duration.ofDays(30)))) active30.add(identity);
        if (latestActivity == null || lastLogin.isAfter(latestActivity)) latestActivity = lastLogin;
      }
      nextPageToken = payload.path("nextPageToken").asText(null);
    } while (nextPageToken != null && !nextPageToken.isBlank());
    return new ActivityEvidence(active30, active90, latestActivity);
  }

  private UsageInventoryRecord buildRecord(
      String key,
      Set<String> assignedUsers,
      ActivityEvidence activity,
      String collectedAt,
      List<String> snapshotWarnings
  ) {
    String[] parts = key.split("\u001f", 2);
    int active30 = (int) assignedUsers.stream().filter(activity.active30()::contains).count();
    int active90 = (int) assignedUsers.stream().filter(activity.active90()::contains).count();
    return new UsageInventoryRecord(
        parts[0],
        "Google",
        parts.length > 1 ? parts[1] : "Google Workspace",
        "productivity_suite",
        null,
        assignedUsers.size(),
        active30,
        active90,
        activity.latestActivity() == null ? null : activity.latestActivity().toString(),
        collectedAt,
        "Google Enterprise License Manager and Admin Reports",
        List.copyOf(snapshotWarnings)
    );
  }

  private JsonNode getJson(URI uri, String token, AtomicInteger retryCount) {
    int attempt = 0;
    while (attempt < MAX_ATTEMPTS) {
      attempt += 1;
      try {
        HttpRequest request = buildProviderRequest(uri, token, "GET");
        HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
        if (response.body() != null && response.body().getBytes(StandardCharsets.UTF_8).length > MAX_RESPONSE_BYTES) {
          throw new GoogleConnectorException("provider_payload_too_large");
        }
        if (response.statusCode() == 429 || response.statusCode() == 503 || response.statusCode() == 504) {
          retryCount.incrementAndGet();
          sleepBackoff(response, attempt);
          continue;
        }
        if (response.statusCode() == 401 || response.statusCode() == 403) throw new GoogleConnectorException("unauthorized");
        if (response.statusCode() >= 400) throw new GoogleConnectorException("provider_request_failed");
        try {
          return objectMapper.readTree(response.body() == null ? "{}" : response.body());
        } catch (Exception exception) {
          throw new GoogleConnectorException("malformed_provider_response");
        }
      } catch (GoogleConnectorException exception) {
        throw exception;
      } catch (InterruptedException exception) {
        Thread.currentThread().interrupt();
        throw new GoogleConnectorException("provider_timeout");
      } catch (Exception exception) {
        if (attempt >= MAX_ATTEMPTS) throw new GoogleConnectorException("provider_timeout");
        retryCount.incrementAndGet();
        sleepMillis(retryBaseMillis * attempt);
      }
    }
    throw new GoogleConnectorException("provider_retry_exhausted");
  }

  HttpRequest buildProviderRequest(URI uri, String token, String method) {
    if (!"GET".equals(method)) throw new GoogleConnectorException("mutation_method_forbidden");
    boolean allowedEndpoint = isAllowedEndpoint(uri, licensingBaseUri)
        || isAllowedEndpoint(uri, adminReportsBaseUri);
    if (!allowedEndpoint) throw new GoogleConnectorException("provider_endpoint_forbidden");
    return HttpRequest.newBuilder(uri)
        .timeout(requestTimeout)
        .header("Authorization", "Bearer " + token)
        .header("Accept", "application/json")
        .GET()
        .build();
  }

  private static boolean isAllowedEndpoint(URI candidate, URI base) {
    int candidatePort = candidate.getPort() == -1 ? defaultPort(candidate.getScheme()) : candidate.getPort();
    int basePort = base.getPort() == -1 ? defaultPort(base.getScheme()) : base.getPort();
    String basePath = base.getPath() == null || base.getPath().isBlank() ? "/" : base.getPath();
    String candidatePath = candidate.getPath() == null || candidate.getPath().isBlank() ? "/" : candidate.getPath();
    return base.getScheme().equalsIgnoreCase(candidate.getScheme())
        && base.getHost().equalsIgnoreCase(candidate.getHost())
        && basePort == candidatePort
        && ("/".equals(basePath) || candidatePath.equals(basePath) || candidatePath.startsWith(basePath + "/"));
  }

  private static int defaultPort(String scheme) {
    return "https".equalsIgnoreCase(scheme) ? 443 : "http".equalsIgnoreCase(scheme) ? 80 : -1;
  }

  private static Instant readLastLogin(JsonNode parameters) {
    if (!parameters.isArray()) return null;
    for (JsonNode parameter : parameters) {
      if ("accounts:last_login_time".equals(parameter.path("name").asText())) {
        try {
          return Instant.parse(parameter.path("datetimeValue").asText(""));
        } catch (Exception ignored) {
          return null;
        }
      }
    }
    return null;
  }

  private void sleepBackoff(HttpResponse<?> response, int attempt) {
    long delay = retryBaseMillis * attempt;
    try {
      delay = Math.min(2_000L, Long.parseLong(response.headers().firstValue("Retry-After").orElse("0")) * 1_000L);
    } catch (NumberFormatException ignored) {
      delay = retryBaseMillis * attempt;
    }
    sleepMillis(delay);
  }

  private static void sleepMillis(long delay) {
    try {
      Thread.sleep(Math.min(delay, 2_000L));
    } catch (InterruptedException exception) {
      Thread.currentThread().interrupt();
      throw new GoogleConnectorException("provider_timeout");
    }
  }

  private UsageInventorySnapshotResult rejected(String connectorType, String code, int retryCount) {
    return new UsageInventorySnapshotResult(false, connectorType, List.of(), null, List.of(code), retryCount, false);
  }

  private static String normalizeIdentity(String value) {
    return value == null ? "" : value.trim().toLowerCase();
  }

  private static String encode(String value) {
    return URLEncoder.encode(value, StandardCharsets.UTF_8);
  }

  private static boolean isBlank(String value) {
    return value == null || value.isBlank();
  }

  private record ActivityEvidence(Set<String> active30, Set<String> active90, Instant latestActivity) {}

  private static final class GoogleConnectorException extends RuntimeException {
    private final String safeCode;

    private GoogleConnectorException(String safeCode) {
      super(safeCode);
      this.safeCode = safeCode;
    }

    private String safeCode() {
      return safeCode;
    }
  }
}
