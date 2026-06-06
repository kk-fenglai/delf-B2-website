# Multi-stage build for the Delfluent backend.
# Base: Debian slim — Prisma's default Linux engine works out of the box, and
# tesseract.js / pdf-parse have no native deps that would need Alpine tweaks.

FROM node:20-slim AS deps
WORKDIR /app
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci --include=dev
RUN npx prisma generate

FROM node:20-slim AS runtime
WORKDIR /app
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates dumb-init \
 && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
ENV PORT=4000

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/prisma ./prisma
COPY package.json package-lock.json ./
COPY src ./src
COPY scripts ./scripts
COPY eng.traineddata ./

# Writable dirs for oral recordings + admin audio uploads (process runs as USER node).
RUN mkdir -p content/recordings content/fei-samples \
 && chown -R node:node content

EXPOSE 4000
USER node
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "src/index.js"]
