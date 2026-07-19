package com.noticecontrol.enterprise.security;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Duration;
import java.time.Instant;
import java.util.HexFormat;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

public final class RequestSignatureVerifier {
  private static final Duration MAX_SKEW = Duration.ofMinutes(5);

  private RequestSignatureVerifier() {}

  public static String bodySha256(byte[] body) {
    try {
      MessageDigest digest = MessageDigest.getInstance("SHA-256");
      return HexFormat.of().formatHex(digest.digest(body));
    } catch (Exception exception) {
      throw new IllegalStateException("sha256_unavailable", exception);
    }
  }

  public static String sign(String method, String path, String timestamp, String bodyHash, String secret) {
    try {
      String payload = String.join("\n", method.toUpperCase(), path, timestamp, bodyHash);
      Mac mac = Mac.getInstance("HmacSHA256");
      mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
      return "sha256=" + HexFormat.of().formatHex(mac.doFinal(payload.getBytes(StandardCharsets.UTF_8)));
    } catch (Exception exception) {
      throw new IllegalStateException("hmac_unavailable", exception);
    }
  }

  public static boolean verify(
      String method,
      String path,
      String timestamp,
      byte[] body,
      String bodyHash,
      String signature,
      String secret,
      Instant now
  ) {
    if (secret == null || secret.isBlank() || timestamp == null || bodyHash == null || signature == null) {
      return false;
    }
    Instant parsed = Instant.parse(timestamp);
    if (Duration.between(parsed, now).abs().compareTo(MAX_SKEW) > 0) {
      return false;
    }
    if (!MessageDigest.isEqual(bodySha256(body).getBytes(StandardCharsets.UTF_8), bodyHash.getBytes(StandardCharsets.UTF_8))) {
      return false;
    }
    String expected = sign(method, path, timestamp, bodyHash, secret);
    return MessageDigest.isEqual(expected.getBytes(StandardCharsets.UTF_8), signature.getBytes(StandardCharsets.UTF_8));
  }
}
