FROM ghcr.io/puppeteer/puppeteer:23.9.0

WORKDIR /app
EXPOSE 3000
CMD ["node", "app.js"]

COPY package*.json ./
RUN npm ci --no-audit

COPY mqttConfig.json ./
COPY *.yml ./
COPY *.js ./
