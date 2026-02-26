FROM node:20-alpine

WORKDIR /app

# Copy package files and install - no native compilation needed with sql.js
COPY backend/package.json ./
RUN npm install --production

# Copy source files
COPY backend/ ./
COPY frontend/ ./frontend/

# Persistent data directory
RUN mkdir -p /data

ENV NODE_ENV=production
ENV PORT=3000
ENV DB_PATH=/data/bookshelf.db

EXPOSE 3000

CMD ["node", "server.js"]
