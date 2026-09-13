# syntax=docker/dockerfile:1.7

FROM node:20-bookworm-slim AS node-deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node-deps AS app-builder
COPY . .
ENV CI=true \
    NOTICECONTROL_CONFIG_VALIDATION_MODE=ci_build \
    NEXT_PUBLIC_APP_URL=https://build.noticecontrol.invalid \
    NEXT_PUBLIC_SUPABASE_URL=https://build-supabase.noticecontrol.invalid \
    NEXT_PUBLIC_SUPABASE_ANON_KEY=build-placeholder-anon-key \
    SUPABASE_SERVICE_ROLE_KEY=build-placeholder-service-key \
    SUPABASE_STORAGE_BUCKET=build-contract-files \
    SUPABASE_EXPORTS_BUCKET=build-export-artifacts \
    OPENAI_API_KEY=build-placeholder-openai-key \
    OCR_PROVIDER=mock \
    RESEND_API_KEY=build-placeholder-resend-key \
    RESEND_FROM_EMAIL=build@noticecontrol.invalid \
    CRON_SHARED_SECRET=build-placeholder-cron-secret \
    INTERNAL_HEALTH_SECRET=build-placeholder-health-secret \
    INTERNAL_OCR_JOBS_SECRET=build-placeholder-ocr-secret \
    INTERNAL_OPERATIONS_SECRET=build-placeholder-operations-secret \
    INTERNAL_DESTRUCTIVE_OPS_SECRET=build-placeholder-destructive-secret \
    INTERNAL_DESTRUCTIVE_OPS_SIGNING_SECRET=build-placeholder-destructive-signing-secret
RUN npm run build && npm run worker:pdf:build

FROM node-deps AS production-node-deps
RUN npm prune --omit=dev

FROM node:20-bookworm-slim AS app-runtime
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0
WORKDIR /app
RUN groupadd --system --gid 1001 noticecontrol && useradd --system --uid 1001 --gid noticecontrol noticecontrol
COPY --from=production-node-deps --chown=noticecontrol:noticecontrol /app/node_modules ./node_modules
COPY --from=app-builder --chown=noticecontrol:noticecontrol /app/.next ./.next
COPY --from=app-builder --chown=noticecontrol:noticecontrol /app/dist ./dist
COPY --from=app-builder --chown=noticecontrol:noticecontrol /app/public ./public
COPY --from=app-builder --chown=noticecontrol:noticecontrol /app/scripts ./scripts
COPY --from=app-builder --chown=noticecontrol:noticecontrol /app/package.json /app/package-lock.json /app/next.config.mjs ./
USER noticecontrol
EXPOSE 3000
CMD ["npm", "start"]

FROM golang:1.22-bookworm AS go-worker-builder
WORKDIR /src
COPY services/go-worker/go.mod ./
COPY services/go-worker ./
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/noticecontrol-worker ./cmd/worker

FROM debian:bookworm-slim AS go-worker-runtime
RUN groupadd --system --gid 1001 noticecontrol && useradd --system --uid 1001 --gid noticecontrol noticecontrol
COPY --from=go-worker-builder /out/noticecontrol-worker /usr/local/bin/noticecontrol-worker
USER noticecontrol
ENTRYPOINT ["/usr/local/bin/noticecontrol-worker"]
