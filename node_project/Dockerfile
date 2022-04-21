FROM node:lts
WORKDIR /puppeteer
RUN apt-get update \
    && apt-get install -y wget gnupg \
    && wget -q -O - https://dl-ssl.google.com/linux/linux_signing_key.pub | apt-key add - \
    && sh -c 'echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" >> /etc/apt/sources.list.d/google.list' \
    && apt-get update \
    && apt-get install -y google-chrome-stable fonts-ipafont-gothic fonts-wqy-zenhei fonts-thai-tlwg fonts-kacst fonts-freefont-ttf libxss1 \
      --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

COPY package.json ./
COPY package-lock.json ./
RUN npm ci

RUN chmod -R o+rwx node_modules/puppeteer/.local-chromium

COPY *.js ./
COPY *.yml ./
COPY mqttConfig.json ./

EXPOSE 3000

CMD ["node", "app.js"]