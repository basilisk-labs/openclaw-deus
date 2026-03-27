FROM node:20-slim AS builder
WORKDIR /app
COPY package*.json tsconfig.json ./
RUN npm ci
COPY src/ ./src/
RUN npx tsc

FROM node:20-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/dist ./dist
COPY beliefs/core.jsonl ./beliefs/core.jsonl
COPY src/database/migrations ./dist/database/migrations
COPY AGENTS.md SOUL.md IDENTITY.md USER.md DEUS.md ./
EXPOSE 3000
CMD ["node", "dist/main.js"]
