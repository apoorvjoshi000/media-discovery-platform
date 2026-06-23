FROM node:22-alpine

WORKDIR /app

# Install deps first for better layer caching.
COPY package.json ./
RUN npm install --no-audit --no-fund

COPY tsconfig.json ./
COPY src ./src

ENV NODE_ENV=production
EXPOSE 8001

# tsx runs TypeScript directly — no separate build step needed for this service.
CMD ["npm", "run", "start"]
