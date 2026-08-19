# --- ESTÁGIO 1: Build ---
FROM node:24-alpine AS builder

WORKDIR /usr/src/app

# Habilita o pnpm via corepack com versão fixada para reprodutibilidade
RUN corepack enable && corepack prepare pnpm@11.1.3 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

RUN pnpm install --frozen-lockfile

COPY prisma ./prisma
RUN pnpm prisma generate

COPY . .
RUN pnpm build

# Otimizado: reinstala apenas as dependências de produção e limpa o cache da store
RUN pnpm install --prod --frozen-lockfile && \
    pnpm prisma generate && \
    pnpm store prune

# --- ESTÁGIO 2: Runner ---
FROM node:24-alpine AS runner

WORKDIR /usr/src/app

ENV NODE_ENV=production

COPY --from=builder /usr/src/app/package.json ./
COPY --from=builder /usr/src/app/node_modules ./node_modules
COPY --from=builder /usr/src/app/dist ./dist
COPY --from=builder /usr/src/app/prisma ./prisma
COPY --from=builder /usr/src/app/prisma.config.js ./

CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]
