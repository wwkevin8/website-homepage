FROM node:24-bookworm-slim

WORKDIR /app

ENV NODE_ENV=development
ENV PORT=3000

COPY package.json package-lock.json ./
COPY apps/admin-vue/package.json apps/admin-vue/package-lock.json ./apps/admin-vue/

RUN npm ci \
  && npm --prefix apps/admin-vue ci

COPY . .

RUN npm run build:admin-vue

EXPOSE 3000

CMD ["npm", "run", "preview"]
