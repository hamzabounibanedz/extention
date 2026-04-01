FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json ./
COPY backend/package.json ./backend/package.json
COPY packages/carriers/package.json ./packages/carriers/package.json
COPY shared/package.json ./shared/package.json
COPY apps/admin-dashboard/package.json ./apps/admin-dashboard/package.json

RUN npm ci

COPY tsconfig.base.json ./
COPY shared ./shared
COPY packages ./packages
COPY backend ./backend

RUN npm run build -w @delivery-tool/shared \
  && npm run build -w @delivery-tool/carriers \
  && npm run build -w @delivery-tool/backend

EXPOSE 3000
CMD ["node", "backend/dist/main.js"]

