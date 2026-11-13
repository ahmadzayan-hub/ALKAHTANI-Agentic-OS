FROM node:20-alpine
WORKDIR /app
COPY package.json ./
RUN npm install --no-audit --no-fund
COPY . .
# Proxy target for /api/v1 (see next.config.mjs). Rewrites are fixed at build time.
ARG API_URL
ENV API_URL=$API_URL
RUN npm run build
EXPOSE 3000
CMD ["npm", "run", "start"]
