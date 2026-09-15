FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY backend ./backend
COPY server/riotProxy.js ./server/riotProxy.js
CMD ["node", "backend/index.js"]
