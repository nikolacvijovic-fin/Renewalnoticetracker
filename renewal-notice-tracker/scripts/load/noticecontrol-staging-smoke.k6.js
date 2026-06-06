import http from "k6/http";
import { check, sleep } from "k6";

const baseUrl = (__ENV.BASE_URL || "http://localhost:3000").replace(/\/$/, "");
const authCookie = __ENV.AUTH_COOKIE || "";
const operationsSecret = __ENV.STAGING_INTERNAL_OPERATIONS_SECRET || "";
const ocrSecret = __ENV.STAGING_INTERNAL_OCR_SECRET || "";
const cronSecret = __ENV.STAGING_CRON_SECRET || "";

export const options = {
  vus: Number(__ENV.VUS || 1),
  duration: __ENV.DURATION || "1m",
  thresholds: {
    http_req_failed: ["rate<0.05"],
    http_req_duration: ["p(95)<3000"]
  }
};

function headers(extra = {}) {
  return {
    ...(authCookie ? { Cookie: authCookie } : {}),
    ...extra
  };
}

function postJson(path, body, extraHeaders = {}) {
  return http.post(`${baseUrl}${path}`, JSON.stringify(body), {
    headers: headers({
      "content-type": "application/json",
      ...extraHeaders
    })
  });
}

function checkSafeStatus(response, name, allowedStatuses) {
  check(response, {
    [name]: (res) => allowedStatuses.includes(res.status)
  });
}

export default function () {
  checkSafeStatus(http.get(`${baseUrl}/dashboard`, { headers: headers() }), "dashboard loads or redirects safely", [200, 302, 303, 307]);
  checkSafeStatus(http.get(`${baseUrl}/dashboard/contracts`, { headers: headers() }), "contracts list loads or redirects safely", [200, 302, 303, 307]);

  checkSafeStatus(
    http.get(`${baseUrl}/dashboard/contracts/export/csv?preset=basic_contract_register`, {
      headers: headers()
    }),
    "basic sync export succeeds, redirects, or denies safely",
    [200, 302, 303, 307, 401, 403, 413]
  );

  const backgroundRequest = postJson("/api/exports/contracts", {
    preset: "workflow_export",
    format: "csv"
  });
  checkSafeStatus(backgroundRequest, "background export request is safe", [202, 302, 303, 307, 401, 403, 413]);

  if (backgroundRequest.status === 202) {
    const requestId = backgroundRequest.json("id");
    if (requestId) {
      checkSafeStatus(
        http.get(`${baseUrl}/api/exports/contracts/${requestId}`, { headers: headers() }),
        "background export status is safe",
        [200, 401, 403, 404]
      );
      checkSafeStatus(
        http.get(`${baseUrl}/api/exports/contracts/${requestId}/download`, { headers: headers() }),
        "background export download is safe",
        [200, 401, 403, 404, 409, 410]
      );
    }
  }

  if (operationsSecret) {
    checkSafeStatus(
      postJson("/api/internal/export-jobs", { limit: 1 }, {
        "x-internal-operations-secret": operationsSecret
      }),
      "internal export worker route is safe",
      [200, 401, 403, 500]
    );
  }

  if (ocrSecret) {
    checkSafeStatus(
      postJson("/api/internal/ocr-jobs", { limit: 1 }, {
        "x-internal-ocr-secret": ocrSecret
      }),
      "internal OCR worker route is safe",
      [200, 401, 403, 500]
    );
  }

  if (cronSecret) {
    checkSafeStatus(
      postJson("/api/cron/send-reminders", {}, {
        "x-cron-secret": cronSecret
      }),
      "reminder cron route is safe",
      [200, 401, 403, 500]
    );
  }

  checkSafeStatus(
    postJson("/api/webhooks/billing/paddle", {
      event_type: "transaction.updated",
      data: {
        id: "txn_staging_probe",
        custom_data: {
          source: "noticecontrol_load_smoke"
        }
      }
    }, {
      "paddle-signature": "safe-mock-signature"
    }),
    "billing webhook rejects or handles safe mock payload",
    [200, 202, 400, 401, 403]
  );

  sleep(1);
}
