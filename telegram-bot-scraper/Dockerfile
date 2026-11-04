FROM node:20-bookworm-slim

WORKDIR /usr/src/app

# Copia package.json e installa dipendenze + Chromium per Playwright
COPY package*.json ./
RUN npm install --omit=dev && npx playwright install --with-deps chromium && rm -rf /var/lib/apt/lists/*

# Copia il codice del bot
COPY . .

# Crea cartella persistente per i dati
RUN mkdir -p data

CMD ["node", "index.js"]

