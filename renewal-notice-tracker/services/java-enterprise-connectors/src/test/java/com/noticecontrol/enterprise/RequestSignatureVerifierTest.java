package com.noticecontrol.enterprise;

import com.noticecontrol.enterprise.security.RequestSignatureVerifier;
import java.time.Instant;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class RequestSignatureVerifierTest {
  @Test
  void verifiesValidSignatureAndRejectsInvalidSignature() {
    Instant now = Instant.parse("2026-07-13T12:00:00Z");
    byte[] body = "{\"organization_id\":\"org-1\"}".getBytes();
    String bodyHash = RequestSignatureVerifier.bodySha256(body);
    String timestamp = now.toString();
    String signature = RequestSignatureVerifier.sign("POST", "/connectors/execute", timestamp, bodyHash, "secret");

    assertTrue(RequestSignatureVerifier.verify("POST", "/connectors/execute", timestamp, body, bodyHash, signature, "secret", now));
    assertFalse(RequestSignatureVerifier.verify("POST", "/connectors/execute", timestamp, body, bodyHash, "sha256=bad", "secret", now));
    assertFalse(RequestSignatureVerifier.verify("POST", "/connectors/execute", now.minusSeconds(600).toString(), body, bodyHash, signature, "secret", now));
  }
}
