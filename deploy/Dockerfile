FROM oven/bun:1.4.4 AS build
RUN apt-get update \
  && apt-get install -y --only-upgrade apt libapt-pkg7.0 \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ARG PUBLIC_GA_MEASUREMENT_ID=
ARG APP_RELEASE=local
ARG PUBLIC_SITE_URL=https://mindul-murder-mystery.duckdns.org
ARG PUBLIC_FARO_COLLECTOR_URL=/telemetry/collect
ENV PUBLIC_SITE_URL=$PUBLIC_SITE_URL \
    PUBLIC_GA_MEASUREMENT_ID=$PUBLIC_GA_MEASUREMENT_ID \
    APP_RELEASE=$APP_RELEASE \
    PUBLIC_RELEASE=$APP_RELEASE \
    PUBLIC_FARO_COLLECTOR_URL=$PUBLIC_FARO_COLLECTOR_URL
COPY . .
RUN bun install --frozen-lockfile && bun run build

FROM oven/bun:1.4.4
RUN apt-get update \
  && apt-get install -y --no-install-recommends --only-upgrade apt libapt-pkg7.0 \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=build /app /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000 DATABASE_PATH=/data/festival.sqlite
RUN mkdir /data && chown bun:bun /data
USER bun
EXPOSE 3000
CMD ["bun", "run", "start"]
