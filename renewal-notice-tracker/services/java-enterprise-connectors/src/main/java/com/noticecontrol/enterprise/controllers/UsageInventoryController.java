package com.noticecontrol.enterprise.controllers;

import com.noticecontrol.enterprise.connectors.EnvironmentMicrosoftGraphAccessTokenProvider;
import com.noticecontrol.enterprise.connectors.Microsoft365UsageInventoryConnector;
import com.noticecontrol.enterprise.connectors.GoogleWorkspaceUsageInventoryConnector;
import com.noticecontrol.enterprise.connectors.UsageInventoryConnector;
import com.noticecontrol.enterprise.models.UsageInventorySnapshotRequest;
import com.noticecontrol.enterprise.models.UsageInventorySnapshotResult;
import java.net.http.HttpClient;
import java.time.Duration;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class UsageInventoryController {
  private final UsageInventoryConnector microsoftConnector;
  private final UsageInventoryConnector googleConnector;

  public UsageInventoryController() {
    HttpClient client = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).followRedirects(HttpClient.Redirect.NORMAL).build();
    this.microsoftConnector = new Microsoft365UsageInventoryConnector(
        client,
        new EnvironmentMicrosoftGraphAccessTokenProvider()
    );
    this.googleConnector = new GoogleWorkspaceUsageInventoryConnector(client);
  }

  @PostMapping("/connectors/subscription-usage/snapshot")
  public UsageInventorySnapshotResult snapshot(@RequestBody UsageInventorySnapshotRequest request) {
    return "google_workspace".equals(request.provider())
        ? googleConnector.fetchUsageSnapshot(request)
        : microsoftConnector.fetchUsageSnapshot(request);
  }
}
