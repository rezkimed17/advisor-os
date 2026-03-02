# -- Stage 1: Install dependencies -----------------------------------------
FROM oven/bun:1 AS deps
WORKDIR /app
COPY package.json bun.lockb* ./
RUN bun install --frozen-lockfile --production

# -- Stage 2: Runtime ------------------------------------------------------
FROM oven/bun:1
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

EXPOSE 3000

CMD ["bun", "run", "src/index.ts"]
