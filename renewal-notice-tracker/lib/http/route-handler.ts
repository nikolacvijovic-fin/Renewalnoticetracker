import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { createAuditLog } from "@/lib/audit";
import {
  ActiveOrganizationRequiredError,
  OrganizationAuthorizationError,
  assertCanUseShippedAction,
  getActiveOrganizationContextOrNull,
  getOrganizationContextOrNull,
  type ActiveOrganizationContext
} from "@/lib/auth";
import { sanitizeInternalError } from "@/lib/errors";
import { getAppConfig } from "@/lib/config";
import {
  logServerError,
  logServerWarn
} from "@/lib/observability/server-logger";
import { emitOperationalEvent } from "@/lib/observability/monitoring";
import {
  hasValidDestructiveInternalRequestAuth,
  hasValidInternalRouteSecret,
  type InternalRouteSecretPurpose
} from "@/lib/internal-route-auth";

export const ROUTE_REQUEST_ID_HEADER = "x-request-id";

type ZodSafeParseResult<T> =
  | { success: true; data: T }
  | { success: false; error: { flatten?: () => unknown; issues?: unknown[] } };

type SafeParseSchema<T> = {
  safeParse: (input: unknown) => ZodSafeParseResult<T>;
};

type RouteBaseContext<TRouteContext> = {
  request: Request;
  requestId: string;
  url: URL;
  routeContext: TRouteContext | undefined;
};

type RouteInstrumentationHooks<TAuth, TInput, TRouteContext> = {
  rateLimit?: (
    context: RouteBaseContext<TRouteContext>
  ) => Promise<void> | void;
  onRequest?: (
    context: RouteBaseContext<TRouteContext>
  ) => Promise<void> | void;
  onSuccess?: (context: {
    request: Request;
    requestId: string;
    url: URL;
    routeContext: TRouteContext | undefined;
    auth: TAuth;
    input: TInput;
    response: Response;
  }) => Promise<void> | void;
  onError?: (context: {
    request: Request;
    requestId: string;
    url: URL;
    routeContext: TRouteContext | undefined;
    auth?: TAuth;
    input?: TInput;
    error: unknown;
    normalizedError: RouteHttpError;
  }) => Promise<void> | void;
};

type RouteAuthResolver<TAuth, TRouteContext> = (
  context: RouteBaseContext<TRouteContext>
) => Promise<TAuth> | TAuth;

type RouteInputResolver<TInput, TAuth, TRouteContext> = (
  context: RouteBaseContext<TRouteContext> & { auth: TAuth }
) => Promise<TInput> | TInput;

export class RouteHttpError extends Error {
  constructor(
    message: string,
    public readonly options: {
      code: string;
      status: number;
      details?: Record<string, unknown>;
      exposeDetails?: boolean;
      cause?: unknown;
    }
  ) {
    super(message);
    this.name = "RouteHttpError";
  }

  get code() {
    return this.options.code;
  }

  get status() {
    return this.options.status;
  }

  get details() {
    return this.options.details;
  }

  get exposeDetails() {
    return this.options.exposeDetails ?? false;
  }
}

export function routeUnauthorizedError(
  message = "Unauthorized",
  code = "ERR_AUTH_REQUIRED_001"
) {
  return new RouteHttpError(message, {
    code,
    status: 401
  });
}

export function routeForbiddenError(
  message = "Forbidden",
  code = "ERR_PERMISSION_DENIED_001"
) {
  return new RouteHttpError(message, {
    code,
    status: 403
  });
}

export function routeValidationError(
  message = "Invalid request.",
  code = "ERR_VALIDATION_FAILED_001",
  details?: Record<string, unknown>
) {
  return new RouteHttpError(message, {
    code,
    status: 400,
    details,
    exposeDetails: Boolean(details)
  });
}

export function routeConflictError(
  message: string,
  code = "ERR_STATE_INVALID_001"
) {
  return new RouteHttpError(message, {
    code,
    status: 409
  });
}

export function routeNotFoundError(
  message = "Not found.",
  code = "ERR_NOT_FOUND_001"
) {
  return new RouteHttpError(message, {
    code,
    status: 404
  });
}

export function routeServerError(
  message = "Unexpected server error.",
  code = "ERR_INTERNAL_SERVER_001"
) {
  return new RouteHttpError(message, {
    code,
    status: 500
  });
}

function withRequestId(response: Response, requestId: string) {
  if (!response.headers.get(ROUTE_REQUEST_ID_HEADER)) {
    response.headers.set(ROUTE_REQUEST_ID_HEADER, requestId);
  }
  return response;
}

function normalizeRedirectTarget(location: string | URL, baseUrl: URL) {
  if (location instanceof URL) return location;

  try {
    return new URL(location);
  } catch {
    return new URL(location, baseUrl);
  }
}

function normalizeRouteError(
  error: unknown,
  requestId: string,
  mapError?: (error: unknown) => RouteHttpError | null
) {
  const mapped = mapError?.(error);
  if (mapped) return mapped;
  if (error instanceof RouteHttpError) return error;

  return new RouteHttpError("Unexpected server error.", {
    code: "ERR_INTERNAL_SERVER_001",
    status: 500,
    details: {
      request_id: requestId,
      debug_message: sanitizeInternalError(error)
    }
  });
}

function buildErrorResponse(error: RouteHttpError, requestId: string) {
  const body: Record<string, unknown> = {
    error: error.message,
    code: error.code,
    requestId
  };

  if (error.exposeDetails && error.details) {
    body.details = error.details;
  }

  return withRequestId(NextResponse.json(body, { status: error.status }), requestId);
}

function getRouteActor(auth: unknown) {
  const maybeAuth = auth as {
    organizationId?: string | null;
    user?: { id?: string | null } | null;
  } | undefined;

  return {
    organizationId: maybeAuth?.organizationId ?? null,
    actorUserId: maybeAuth?.user?.id ?? null
  };
}

function logRouteFailure(input: {
  url: URL;
  requestId: string;
  auth?: unknown;
  error: unknown;
  normalizedError: RouteHttpError;
}) {
  const actor = getRouteActor(input.auth);
  const metadata = {
    status: input.normalizedError.status,
    code: input.normalizedError.code,
    pathname: input.url.pathname
  };

  if (input.normalizedError.code.startsWith("ERR_INTERNAL_")) {
    logServerWarn({
      event: "internal_route_auth_failed",
      route: input.url.pathname,
      requestId: input.requestId,
      metadata
    });
    void emitOperationalEvent({
      eventName: "internal_route_auth_failed",
      severity: "P2",
      sensitivity: "internal",
      alert: true,
      route: input.url.pathname,
      requestId: input.requestId,
      metadata
    });
    return;
  }

  if (input.normalizedError.status >= 500) {
    logServerError({
      event: "route_unexpected_error",
      route: input.url.pathname,
      organizationId: actor.organizationId,
      actorUserId: actor.actorUserId,
      requestId: input.requestId,
      metadata,
      error: input.error
    });
  }
}

export function parseJsonBody<T = unknown>(
  request: Request,
  options?: {
    message?: string;
    code?: string;
  }
) {
  return request.json().catch(() => {
    throw routeValidationError(
      options?.message ?? "Invalid request.",
      options?.code ?? "ERR_REQUEST_BODY_INVALID_001"
    );
  }) as Promise<T>;
}

export async function parseJsonBodyWithSchema<T>(
  request: Request,
  schema: SafeParseSchema<T>,
  options?: {
    message?: string;
    code?: string;
  }
) {
  const body = await parseJsonBody(request, options);
  const parsed = schema.safeParse(body);

  if (!parsed.success) {
    throw routeValidationError(
      options?.message ?? "Invalid request.",
      options?.code ?? "ERR_VALIDATION_FAILED_001",
      {
        issues: parsed.error.flatten?.() ?? parsed.error.issues ?? []
      }
    );
  }

  return parsed.data;
}

export function requireOrganizationRouteAuth<TRouteContext>(): RouteAuthResolver<
  ActiveOrganizationContext,
  TRouteContext
> {
  return async () => {
    const context = await getOrganizationContextOrNull();
    if (!context) {
      throw routeUnauthorizedError();
    }

    return context;
  };
}

export function requireShippedActionRouteAuth<TRouteContext>(
  action: Parameters<typeof assertCanUseShippedAction>[1],
  options?: {
    deniedAuditAction?: string;
    deniedEntityType?: string;
    deniedDetails?: (input: {
      context: ActiveOrganizationContext;
      reason: "unauthorized" | "forbidden" | "cross_org";
      requestId: string;
      action: Parameters<typeof assertCanUseShippedAction>[1];
    }) => Record<string, unknown>;
  }
): RouteAuthResolver<ActiveOrganizationContext, TRouteContext> {
  return async ({ requestId }) => {
    const auth = await getActiveOrganizationContextOrNull();

    try {
      return await assertCanUseShippedAction(auth, action, {
        onDenied: async ({ context, reason, action: deniedAction }) => {
          if (!context?.user || !options?.deniedAuditAction || !options.deniedEntityType) {
            return;
          }

          await createAuditLog({
            organizationId: context.organizationId,
            actorUserId: context.user.id,
            action: options.deniedAuditAction,
            entityType: options.deniedEntityType,
            details: {
              denied_action: deniedAction,
              denied_reason: reason,
              request_id: requestId,
              ...(options.deniedDetails?.({
                context,
                reason,
                requestId,
                action: deniedAction
              }) ?? {})
            }
          });
        }
      });
    } catch (error) {
      if (error instanceof ActiveOrganizationRequiredError) {
        throw routeUnauthorizedError();
      }
      if (error instanceof OrganizationAuthorizationError) {
        throw routeForbiddenError();
      }
      throw error;
    }
  };
}

export function requireInternalRouteAuth<TRouteContext>(
  purpose: InternalRouteSecretPurpose
): RouteAuthResolver<{ purpose: InternalRouteSecretPurpose }, TRouteContext> {
  return ({ request }) => {
    if (!hasValidInternalRouteSecret(request, purpose)) {
      throw routeUnauthorizedError("Unauthorized", "ERR_INTERNAL_AUTH_REQUIRED_001");
    }

    return { purpose };
  };
}

export function requireDestructiveInternalRouteAuth<TRouteContext>(): RouteAuthResolver<
  { purpose: "destructive" },
  TRouteContext
> {
  return async ({ request }) => {
    const body = await request.clone().text();

    if (!hasValidDestructiveInternalRequestAuth(request, body)) {
      throw routeUnauthorizedError("Unauthorized", "ERR_INTERNAL_DESTRUCTIVE_AUTH_001");
    }

    return { purpose: "destructive" };
  };
}

export function requireCronSecretRouteAuth<TRouteContext>(
  secret = getAppConfig().internal.cronSharedSecret,
  headerName = "x-cron-secret"
): RouteAuthResolver<{ purpose: "cron" }, TRouteContext> {
  return ({ request }) => {
    if (request.headers.get(headerName) !== secret) {
      throw routeUnauthorizedError("Unauthorized", "ERR_CRON_AUTH_REQUIRED_001");
    }

    return { purpose: "cron" };
  };
}

export function createRouteHandler<
  TAuth = any,
  TInput = any,
  TRouteContext = void
>(
  options: {
    auth?: RouteAuthResolver<TAuth, TRouteContext>;
    parse?: RouteInputResolver<TInput, TAuth, TRouteContext>;
    mapError?: (error: unknown) => RouteHttpError | null;
    instrumentation?: RouteInstrumentationHooks<TAuth, TInput, TRouteContext>;
  },
  handler: (context: {
    request: Request;
    requestId: string;
    url: URL;
    routeContext: TRouteContext | undefined;
    auth: TAuth;
    input: TInput;
    json: (body: unknown, init?: ResponseInit) => Response;
    redirect: (location: string | URL, status?: number) => Response;
    noContent: (init?: ResponseInit) => Response;
    audit: typeof createAuditLog;
  }) => Promise<Response> | Response
) {
  return async (request: Request, routeContext?: TRouteContext) => {
    const requestId =
      request.headers.get(ROUTE_REQUEST_ID_HEADER)?.trim() || randomUUID();
    const url = new URL(request.url);
    const baseContext = {
      request,
      requestId,
      url,
      routeContext
    };

    let auth = undefined as TAuth;
    let input = undefined as TInput;

    try {
      await options.instrumentation?.rateLimit?.(baseContext);
      await options.instrumentation?.onRequest?.(baseContext);
      auth = options.auth
        ? await options.auth(baseContext)
        : (undefined as TAuth);
      input = options.parse
        ? await options.parse({
            ...baseContext,
            auth
          })
        : (undefined as TInput);

      const response = await handler({
        ...baseContext,
        auth,
        input,
        json: (body, init) =>
          withRequestId(NextResponse.json(body, init), requestId),
        redirect: (location, status = 303) =>
          withRequestId(
            NextResponse.redirect(
              normalizeRedirectTarget(location, url),
              { status }
            ),
            requestId
          ),
        noContent: (init) =>
          withRequestId(
            new NextResponse(null, { status: 204, ...init }),
            requestId
          ),
        audit: (input, auditOptions) =>
          createAuditLog(
            {
              ...input,
              details: {
                ...(input.details ?? {}),
                request_id: requestId
              }
            },
            auditOptions as never
          )
      });

      const responseWithRequestId = withRequestId(response, requestId);
      await options.instrumentation?.onSuccess?.({
        ...baseContext,
        auth,
        input,
        response: responseWithRequestId
      });
      return responseWithRequestId;
    } catch (error) {
      const normalizedError = normalizeRouteError(error, requestId, options.mapError);
      logRouteFailure({
        url,
        requestId,
        auth,
        error,
        normalizedError
      });
      await options.instrumentation?.onError?.({
        ...baseContext,
        auth,
        input,
        error,
        normalizedError
      });
      return buildErrorResponse(normalizedError, requestId);
    }
  };
}
