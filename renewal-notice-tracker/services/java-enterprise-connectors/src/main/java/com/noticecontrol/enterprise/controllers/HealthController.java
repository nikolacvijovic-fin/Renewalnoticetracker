package com.noticecontrol.enterprise.controllers;

import com.noticecontrol.enterprise.models.HealthResponse;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class HealthController {
  @GetMapping("/health")
  public HealthResponse health() {
    return new HealthResponse("java-enterprise-connectors", "0.1.0", "ok");
  }
}
