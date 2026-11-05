FROM node:24-bookworm-slim
ENV NODE_ENV=production PORT=8081
WORKDIR /app
COPY temporal-worker/package.json ./package.json
COPY temporal-worker/package-lock.json ./package-lock.json
RUN apt-get update \
    && apt-get install --no-install-recommends --only-upgrade -y apt \
    && rm -rf /var/lib/apt/lists/* \
    && npm ci --omit=dev \
    && rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx
COPY temporal-worker/src ./src
USER node
EXPOSE 8081
CMD ["node", "src/index.js"]
