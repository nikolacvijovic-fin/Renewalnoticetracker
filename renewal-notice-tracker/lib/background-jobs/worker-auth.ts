import {
  hasValidSignedInternalWorkerRequestAuth,
  INTERNAL_WORKER_ID_HEADER
} from "@/lib/internal-route-auth";
import { routeUnauthorizedError } from "@/lib/http";

export async function requireSignedWorkerRouteAuth(request: Request) {
  const body = await request.clone().text();
  if (!hasValidSignedInternalWorkerRequestAuth(request, body)) {
    throw routeUnauthorizedError("Unauthorized", "ERR_INTERNAL_WORKER_AUTH_REQUIRED_001");
  }

  const workerId = request.headers.get(INTERNAL_WORKER_ID_HEADER)?.trim();
  if (!workerId) {
    throw routeUnauthorizedError("Unauthorized", "ERR_INTERNAL_WORKER_ID_REQUIRED_001");
  }

  return { workerId };
}
