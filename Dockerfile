# ---- Build stage: install everything, build the SPA, run the test suite ----
FROM node:24-slim AS build
WORKDIR /app
# Exact versions are pinned in package.json; the lockfile is used when present.
COPY package.json package-lock.json* ./
RUN if [ -f package-lock.json ]; then npm ci; else npm install --no-audit --no-fund; fi
COPY . .
RUN npm run typecheck && npm test && npm run build

# ---- Runtime stage: production deps + server source + built SPA ----
FROM node:24-slim
ENV NODE_ENV=production \
    PORT=7860 \
    DATABASE_PATH=/data/folio.db
WORKDIR /app
COPY package.json package-lock.json* ./
RUN if [ -f package-lock.json ]; then npm ci --omit=dev; else npm install --omit=dev --no-audit --no-fund; fi \
    && npm cache clean --force
COPY server ./server
COPY --from=build /app/dist ./dist
# The node image's "node" user is UID 1000, which Hugging Face Spaces and most PaaS expect.
RUN mkdir -p /data && chown node:node /data
USER node
EXPOSE 7860
HEALTHCHECK --interval=30s --timeout=3s CMD node -e "fetch('http://localhost:'+process.env.PORT+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "--disable-warning=ExperimentalWarning", "server/index.ts"]
