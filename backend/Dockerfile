# syntax=docker/dockerfile:1.7
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci --omit=dev || npm install --omit=dev

FROM node:20-alpine AS runtime
RUN addgroup -S app && adduser -S app -G app
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json server.js launcher.js webhook.js admin.js metrics.js \
     rpc-allow.js logger.js drain.js writeups.js openapi.yaml chains.json ./
USER app
EXPOSE 8787
ENV HOST=0.0.0.0 PORT=8787 NODE_ENV=production
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD wget -qO- http://127.0.0.1:8787/api/health || exit 1
CMD ["node", "server.js"]
