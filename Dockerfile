# --- ESTÁGIO 1: Build ---
FROM node:24-alpine AS builder

WORKDIR /usr/src/app

COPY package*.json ./
COPY yarn.lock ./

RUN yarn install --frozen-lockfile

COPY prisma ./prisma
RUN yarn prisma generate

COPY . .
RUN yarn build

# Otimizado: Garante a poda limpa das devDependencies tirando lixo de cache
RUN yarn install --frozen-lockfile --production --ignore-scripts && \
    yarn prisma generate && \
    yarn cache clean

# --- ESTÁGIO 2: Runner ---
FROM node:24-alpine AS runner

WORKDIR /usr/src/app

ENV NODE_ENV=production

COPY --from=builder /usr/src/app/package*.json ./
COPY --from=builder /usr/src/app/node_modules ./node_modules
COPY --from=builder /usr/src/app/dist ./dist
COPY --from=builder /usr/src/app/prisma ./prisma
COPY --from=builder /usr/src/app/prisma.config.js ./ 

CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]