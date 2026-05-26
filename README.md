# Simon Kola Web Scraper

Questo è un tool avanzato per il web scraping, il crawling e l'estrazione di dati dal web, progettato e mantenuto da Simon Kola. 
Permette di estrarre dati da qualsiasi sito web e trasformarli in API strutturate, automatizzando processi complessi.

## Deploy

Questo progetto è configurato per essere eseguito su un ambiente **Docker**, ideale per l'hosting su **Amazon VM (AWS EC2)**.
Le funzionalità di scraping sfruttano headless browsers e Playwright, rendendo Vercel inadatto (a causa dei limiti delle Serverless Functions), mentre un VPS con Docker offre prestazioni e flessibilità perfette.

### Requisiti
- Docker & Docker Compose
- Amazon VM / Server VPS Linux (o Windows)

### Avvio rapido
Per avviare l'intero stack (Frontend, Backend, Database):
```bash
docker-compose up -d
```

## Struttura del Progetto
- `src/`: Interfaccia utente (Frontend) in React/Vite.
- `server/`: API Backend in Node.js/Express.
- `maxun-core/`: Core logico per il crawling e lo scraping.
