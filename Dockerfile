FROM node:22-bookworm-slim

WORKDIR /app

ENV NODE_ENV=production \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
    TZ=Asia/Jakarta

COPY package.json package-lock.json* ./
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates python3 make g++ \
    && npm ci \
    && npx playwright install --with-deps chromium \
    && rm -rf /var/lib/apt/lists/*

COPY tsconfig.json eslint.config.js ./
COPY config ./config
COPY src ./src
RUN npm install --include=dev \
    && npm run build \
    && npm prune --omit=dev

RUN mkdir -p /app/data /app/browser-profile \
    && chown -R node:node /app

USER node
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

CMD ["node", "dist/src/index.js"]
