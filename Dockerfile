# Stage build: ติดตั้ง dependencies ทั้งหมดแล้ว compile TypeScript เป็น dist
FROM node:20-alpine AS build

WORKDIR /app

COPY package*.json ./
COPY prisma ./prisma
COPY prisma.config.ts ./
RUN npm ci && npm run prisma:generate

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# Stage runtime: มีแค่ production dependencies, Prisma client และ dist
FROM node:20-alpine

WORKDIR /app

# su-exec ใช้สลับจาก root เป็น user node ใน entrypoint หลังเตรียมสิทธิ์ uploads
RUN apk add --no-cache su-exec

COPY package*.json ./
COPY prisma ./prisma
COPY prisma.config.ts ./
RUN npm ci --omit=dev && npm run prisma:generate

COPY --from=build /app/dist ./dist
COPY docker ./docker

ENV NODE_ENV=production
EXPOSE 8080

# entrypoint รัน migration แล้ว start server เป็น user node (ไม่ใช่ root)
ENTRYPOINT ["sh", "/app/docker/entrypoint.sh"]
# รัน node ตรง ๆ เพื่อให้ได้รับ SIGTERM จาก Docker ตอน redeploy
CMD ["node", "dist/server.js"]
