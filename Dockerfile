# Multi-stage build
FROM node:18-alpine AS client-build
WORKDIR /app/client
COPY client/package*.json ./
RUN npm install
COPY client/ ./
RUN npm run build

FROM node:18-alpine AS server-build
WORKDIR /app/server
COPY server/package*.json ./
RUN npm install
COPY server/ ./

FROM node:18-alpine
WORKDIR /app

# Copy server
COPY --from=server-build /app/server ./server

# Copy client build
COPY --from=client-build /app/client/dist ./client/dist

# Install serve to serve static files
RUN npm install -g serve

EXPOSE 3000 3001

# Start both services
CMD ["sh", "-c", "cd server && node server.js & serve -s client/dist -l 3000"]
