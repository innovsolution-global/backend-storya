# --- Build -------------------------------------------------------
FROM node:22-alpine AS build
WORKDIR /app
# Outils nécessaires si bcrypt doit être compilé (pas de binaire précompilé pour la plateforme).
RUN apk add --no-cache python3 make g++
COPY package*.json ./
RUN npm ci
COPY tsconfig*.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev

# --- Runtime -----------------------------------------------------
FROM node:22-alpine
ENV NODE_ENV=production
# Montage vidéo : ffmpeg du système (le binaire de ffmpeg-static vise glibc, pas musl).
RUN apk add --no-cache ffmpeg
ENV FFMPEG_PATH=/usr/bin/ffmpeg
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
# Migrations SQL (npm run db:migrate)
COPY drizzle ./drizzle
COPY assets ./assets
COPY package.json ./
RUN mkdir -p uploads/tmp && chown -R node:node /app
USER node
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD wget -qO- http://127.0.0.1:${PORT:-4000}/health || exit 1
CMD ["node", "dist/server.js"]
