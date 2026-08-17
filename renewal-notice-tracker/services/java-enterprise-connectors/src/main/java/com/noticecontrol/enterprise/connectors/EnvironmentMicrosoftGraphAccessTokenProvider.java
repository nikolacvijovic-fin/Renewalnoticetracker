package com.noticecontrol.enterprise.connectors;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HexFormat;

public final class EnvironmentMicrosoftGraphAccessTokenProvider implements MicrosoftGraphAccessTokenProvider {
  @Override
  public String getAccessToken(String tenantId, String credentialReference) {
    if (credentialReference == null || credentialReference.isBlank()) {
      throw new IllegalStateException("missing_credential_reference");
    }
    String envName = "MICROSOFT_GRAPH_ACCESS_TOKEN_" + fingerprint(credentialReference).substring(0, 16).toUpperCase();
    String token = System.getenv(envName);
    if (token == null || token.isBlank()) {
      throw new IllegalStateException("missing_managed_secret");
    }
    return token;
  }

  private static String fingerprint(String value) {
    try {
      MessageDigest digest = MessageDigest.getInstance("SHA-256");
      return HexFormat.of().formatHex(digest.digest(value.getBytes(StandardCharsets.UTF_8)));
    } catch (Exception exception) {
      throw new IllegalStateException("sha256_unavailable", exception);
    }
  }
}
