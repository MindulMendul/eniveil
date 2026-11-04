FROM node:24-bookworm-slim
ENV NODE_ENV=production PORT=8081
WORKDIR /app
COPY temporal-worker/package.json temporal-worker/package-lock.json ./
RUN npm ci --omit=dev
COPY temporal-worker/src ./src
USER node
EXPOSE 8081
CMD ["node", "src/index.js"]
