package com.noticecontrol.enterprise.connectors;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.InputStream;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;

final class MicrosoftSkuCatalog {
  record Product(String canonicalId, String displayName, String category) {}

  private final String version;
  private final Map<String, Product> bySkuPartNumber;
  private final Map<String, Product> byReportName;

  private MicrosoftSkuCatalog(String version, Map<String, Product> bySkuPartNumber, Map<String, Product> byReportName) {
    this.version = version;
    this.bySkuPartNumber = bySkuPartNumber;
    this.byReportName = byReportName;
  }

  static MicrosoftSkuCatalog loadDefault() {
    try (InputStream stream = MicrosoftSkuCatalog.class.getResourceAsStream("/microsoft-sku-mapping.v1.json")) {
      if (stream == null) throw new IllegalStateException("microsoft_sku_mapping_missing");
      JsonNode root = new ObjectMapper().readTree(stream);
      Map<String, Product> bySku = new HashMap<>();
      Map<String, Product> byReport = new HashMap<>();
      for (JsonNode item : root.path("products")) {
        Product product = new Product(
            item.path("canonicalId").asText(),
            item.path("displayName").asText(),
            item.path("category").asText("productivity_suite")
        );
        item.path("skuPartNumbers").forEach(value -> bySku.put(normalize(value.asText()), product));
        item.path("reportProductNames").forEach(value -> byReport.put(normalize(value.asText()), product));
      }
      return new MicrosoftSkuCatalog(root.path("version").asText("microsoft_sku_mapping_unknown"), bySku, byReport);
    } catch (Exception exception) {
      throw new IllegalStateException("microsoft_sku_mapping_invalid");
    }
  }

  Optional<Product> bySkuPartNumber(String value) {
    return Optional.ofNullable(bySkuPartNumber.get(normalize(value)));
  }

  Optional<Product> byReportName(String value) {
    return Optional.ofNullable(byReportName.get(normalize(value)));
  }

  String version() {
    return version;
  }

  private static String normalize(String value) {
    return value == null ? "" : value.trim().toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9]+", " ").trim();
  }
}
