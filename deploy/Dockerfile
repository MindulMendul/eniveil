FROM oven/bun:1.4.4 AS build
WORKDIR /app
COPY . .
ARG APP_RELEASE=local
ARG PUBLIC_FARO_COLLECTOR_URL=
ENV APP_RELEASE=$APP_RELEASE PUBLIC_RELEASE=$APP_RELEASE PUBLIC_FARO_COLLECTOR_URL=$PUBLIC_FARO_COLLECTOR_URL
RUN bun install --frozen-lockfile && bun run build
FROM oven/bun:1.4.4
WORKDIR /app
COPY --from=build /app /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000 DATABASE_PATH=/data/festival.sqlite
RUN mkdir /data && chown bun:bun /data
USER bun
EXPOSE 3000
CMD ["bun", "run", "start"]
