FROM ghcr.io/puppeteer/puppeteer:25.0.4

ENV PUPPETEER_CACHE_DIR=/home/pptruser/.cache/puppeteer

WORKDIR /app
EXPOSE 3000
CMD ["node", "index.js"]

COPY package*.json ./
RUN npm ci --no-audit

COPY mqttConfig.json ./
COPY *.yml ./
COPY src/ ./