FROM node:24-bookworm-slim

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY prisma ./prisma
RUN npm run prisma:generate

COPY index.html manifest.webmanifest service-worker.js ./
COPY assets ./assets
COPY hr ./hr
COPY scripts ./scripts
COPY src ./src

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

CMD ["sh", "-c", "npm run prisma:deploy && npm run seed && exec npm start"]
