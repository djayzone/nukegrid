FROM node:24-alpine AS build

WORKDIR /app

COPY package.json tsconfig.json ./
RUN npm install --ignore-scripts --no-audit --no-fund

COPY src ./src
COPY test ./test
COPY scripts ./scripts
COPY web ./web

RUN npm run build

FROM node:24-alpine AS runtime

WORKDIR /app

ENV NODE_ENV=production \
    NUKEGRID_HOST=0.0.0.0 \
    NUKEGRID_PORT=4176

COPY package.json ./
COPY --from=build /app/.build ./.build
COPY --from=build /app/web ./web

USER node

EXPOSE 4176

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:4176/healthz').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

CMD ["node", ".build/src/playable/server.js"]
