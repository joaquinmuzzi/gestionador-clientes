# syntax=docker/dockerfile:1

FROM node:22-alpine AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

# Dependencies. The Prisma schema goes in first because postinstall runs
# `prisma generate`.
FROM base AS deps
COPY package.json package-lock.json prisma.config.ts ./
COPY prisma ./prisma
RUN npm ci

# Full source with dev dependencies: runs migrations and the user CLI.
FROM deps AS tools
COPY . .

FROM tools AS build
ENV BUILD_STANDALONE=1
RUN npm run build

# Production image: only Next.js standalone output, as a non-root user.
FROM base AS runner
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
# Mount point of the attachments volume; a new volume copies this ownership.
RUN mkdir -p /data/attachments && chown node:node /data/attachments
USER node
EXPOSE 3000
CMD ["node", "server.js"]
