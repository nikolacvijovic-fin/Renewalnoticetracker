package com.noticecontrol.enterprise.connectors;

public interface MicrosoftGraphAccessTokenProvider {
  String getAccessToken(String tenantId, String credentialReference);
}
