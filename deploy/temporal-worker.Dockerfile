FROM node:24-bookworm-slim
ENV NODE_ENV=production PORT=8081
WORKDIR /app
COPY temporal-worker/package.json ./package.json
COPY temporal-worker/package-lock.json ./package-lock.json
RUN apt-get update \
    && apt-get install --yes --only-upgrade apt libapt-pkg6.0 \
    && rm -rf /var/lib/apt/lists/* \
    && npm ci --omit=dev \
    && rm -rf /usr/local/lib/node_modules/npm
COPY temporal-worker/src ./src
USER node
EXPOSE 8081
CMD ["node", "src/index.js"]
