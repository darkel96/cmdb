# CMDB als ein Container: baut Frontend (statisch) und Dienst und liefert beides auf Port 8790 aus.
# Bauen aus dem Hauptverzeichnis des Repositories:  docker build -f server/Dockerfile -t cmdb .
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json .nvmrc ./
RUN npm ci --no-audit --no-fund
COPY . .
# Normaler Build, nicht build:pages: Der Dienst liefert jeden Pfad ohne Endung als App aus (Browser-Router)
RUN npm run build && npm run build:server

FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# Zur Laufzeit braucht der Dienst nur ldapts, mssql und nodemailer (alles andere ist gebündelt)
RUN npm ci --omit=dev --no-audit --no-fund

FROM node:24-alpine
WORKDIR /app
ARG CMDB_VERSION=entwicklung
ENV NODE_ENV=production CMDB_PORT=8790 CMDB_STATIC=/app/dist CMDB_VERSION=$CMDB_VERSION
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/server/dist ./server/dist
COPY --from=build /app/dist ./dist
COPY server/healthcheck.mjs ./server/healthcheck.mjs
# Daten des Dienstes (Einstellungen aus der Verwaltung) auf eigenem Volume, beschreibbar nur für node
RUN mkdir -p /app/data && chown node:node /app/data && chmod 700 /app/data
EXPOSE 8790
USER node
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s CMD ["node", "server/healthcheck.mjs"]
CMD ["node", "server/dist/index.mjs"]
