FROM oven/bun:1.4.4 AS build
WORKDIR /app
ARG APP_RELEASE=local
ENV PUBLIC_RELEASE=$APP_RELEASE
ARG PUBLIC_GA_MEASUREMENT_ID=
ENV PUBLIC_GA_MEASUREMENT_ID=$PUBLIC_GA_MEASUREMENT_ID
COPY . .
RUN bun install --frozen-lockfile && bun run build
FROM oven/bun:1.4.4
WORKDIR /app
COPY --from=build /app /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000 DATABASE_PATH=/data/festival.sqlite
RUN apt-get update \
    && apt-get install --no-install-recommends --only-upgrade -y apt \
    && rm -rf /var/lib/apt/lists/* \
    && mkdir /data \
    && chown bun:bun /data
USER bun
EXPOSE 3000
CMD ["bun", "run", "start"]
