FROM oven/bun:1.4.4 AS build
RUN apt-get update \
  && apt-get install -y --only-upgrade apt libapt-pkg7.0 zlib1g \
  && dpkg --compare-versions "$(dpkg-query -W -f='${Version}' zlib1g)" ge '1:1.3.dfsg+really1.3.1-1+deb13u1' \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ARG PUBLIC_GTM_CONTAINER_ID=
ARG APP_RELEASE=local
ARG PUBLIC_SITE_URL=https://mindul-murder-mystery.duckdns.org
ARG PUBLIC_FARO_COLLECTOR_URL=/telemetry/collect
ENV PUBLIC_SITE_URL=$PUBLIC_SITE_URL \
    PUBLIC_GTM_CONTAINER_ID=$PUBLIC_GTM_CONTAINER_ID \
    APP_RELEASE=$APP_RELEASE \
    PUBLIC_RELEASE=$APP_RELEASE \
    PUBLIC_FARO_COLLECTOR_URL=$PUBLIC_FARO_COLLECTOR_URL
COPY . .
RUN bun install --frozen-lockfile && bun run build

FROM oven/bun:1.4.4
RUN apt-get update \
  && apt-get install -y --no-install-recommends --only-upgrade apt libapt-pkg7.0 zlib1g \
  && dpkg --compare-versions "$(dpkg-query -W -f='${Version}' zlib1g)" ge '1:1.3.dfsg+really1.3.1-1+deb13u1' \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=build /app /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000 DATABASE_PATH=/data/festival.sqlite
RUN mkdir /data && chown bun:bun /data
USER bun
EXPOSE 3000
CMD ["bun", "run", "start"]
