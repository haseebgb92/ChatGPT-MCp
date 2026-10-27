# Glama sample: intentionally NOT the full desktop MCP Bridge
FROM node:22-bookworm-slim AS deps
WORKDIR /opt/mcp
COPY glama/bridge/package.json ./
RUN npm install --omit=dev --ignore-scripts --no-audit --no-fund

FROM node:22-bookworm-slim
LABEL org.opencontainers.image.title="MCP Bridge public documentation demo" \
      org.opencontainers.image.description="Read-only bundled public files. No desktop, shell, browser, or credentials."
WORKDIR /opt/mcp
COPY --from=deps /opt/mcp/node_modules ./node_modules
COPY bundled/local-mcp/server.js bundled/local-mcp/config.js bundled/local-mcp/security.js bundled/local-mcp/package.json ./bundled/local-mcp/
COPY glama/bridge/ ./glama/bridge/
ENV NODE_ENV=production ENABLE_WRITE=false ENABLE_SHELL=false FULL_SHELL=false LOCAL_MCP_HTTP_PORT=0
USER node
ENTRYPOINT ["node","glama/bridge/entrypoint.mjs"]
