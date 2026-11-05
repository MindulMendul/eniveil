FROM oven/bun:1.4.4 AS build
WORKDIR /app
COPY . .
RUN bun install --frozen-lockfile && bun run build
FROM oven/bun:1.4.4
WORKDIR /app
COPY --from=build /app /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000 DATABASE_PATH=/data/festival.sqlite
RUN apt-get update \
    && apt-get install --yes --only-upgrade apt libapt-pkg7.0 \
    && rm -rf /var/lib/apt/lists/* \
    && mkdir /data \
    && chown bun:bun /data
USER bun
EXPOSE 3000
CMD ["bun", "run", "start"]
