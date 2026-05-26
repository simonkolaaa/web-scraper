const { chromium } = require('playwright');
const cheerio = require('cheerio');
const TelegramBot = require('node-telegram-bot-api');
const cron = require('node-cron');
const fs = require('fs');
const path = require('path');

const configPath = path.join(__dirname, 'config.json');
const dbPath = path.join(__dirname, 'seen_jobs.json');

// Carica configurazione
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
const bot = new TelegramBot(config.telegram_bot_token, { polling: false });

// Inizializza database ID visti
if (!fs.existsSync(dbPath)) {
    fs.writeFileSync(dbPath, JSON.stringify([]));
}
let seenJobs = new Set(JSON.parse(fs.readFileSync(dbPath, 'utf8')));

// Funzione di utilità per filtrare parole chiave
const containsKeyword = (text, keywords) => {
    if (!text || keywords.length === 0) return false;
    const lowerText = text.toLowerCase();
    return keywords.some(kw => lowerText.includes(kw.toLowerCase()));
};

// Funzione principale di scraping
const scrapeSite = async (site, browser) => {
    try {
        const page = await browser.newPage();
        await page.goto(site.url, { waitUntil: 'networkidle', timeout: 30000 });
        
        // Aspettiamo che il contenitore delle offerte venga caricato, o timeout morbido
        try {
            await page.waitForSelector(site.selectors.job_container, { timeout: 10000 });
        } catch (e) {
            console.log(`[Avviso] Selettore ${site.selectors.job_container} non trovato o attesa scaduta per ${site.name}`);
        }
        
        // Aggiungiamo un ritardo extra per sicurezza per i rendering SPA
        await page.waitForTimeout(3000);

        const content = await page.content();
        await page.close();

        const $ = cheerio.load(content);
        const jobs = [];

        $(site.selectors.job_container).each((i, el) => {
            const title = $(el).find(site.selectors.title).text().replace(/\s+/g, ' ').trim();
            const description = $(el).find(site.selectors.description).text().replace(/\s+/g, ' ').trim();
            
            let link = $(el).find(site.selectors.link).attr('href');
            if (link && !link.startsWith('http')) {
                const urlObj = new URL(site.url);
                link = `${urlObj.origin}${link.startsWith('/') ? '' : '/'}${link}`;
            }

            if (title && link) {
                jobs.push({ title, link, description });
            }
        });
        return jobs;
    } catch (error) {
        console.error(`Errore durante lo scraping di ${site.name}:`, error.message);
        return [];
    }
};

// Esecuzione dello scraping su tutti i siti e controllo regole
const runScraper = async () => {
    console.log(`[${new Date().toLocaleString()}] Avvio scraping...`);
    let newJobsFound = 0;
    
    let browser;
    try {
        browser = await chromium.launch({ headless: true });
        
        for (const site of config.sites) {
            console.log(`Controllo sito: ${site.name}`);
            const jobs = await scrapeSite(site, browser);
            console.log(`Trovate ${jobs.length} offerte in totale (prima dei filtri).`);

            for (const job of jobs) {
                const content = `${job.title} ${job.description}`.toLowerCase();
                
                // Applica i filtri
                const hasInclude = config.keywords.include.length === 0 || containsKeyword(content, config.keywords.include);
                const hasExclude = containsKeyword(content, config.keywords.exclude);
                const hasLocation = !config.keywords.locations || config.keywords.locations.length === 0 || containsKeyword(content, config.keywords.locations);

                // Se rispetta i criteri e non è già stato notificato
                if (hasInclude && !hasExclude && hasLocation && !seenJobs.has(job.link)) {
                    const message = `🚨 <b>Nuova Offerta di Lavoro!</b>\n\n` +
                                    `🏢 <b>Sito:</b> ${site.name}\n` +
                                    `💼 <b>Titolo:</b> ${job.title}\n` +
                                    `🔗 <b>Link:</b> <a href="${job.link}">Vai all'offerta</a>`;
                    
                    try {
                        if (config.telegram_bot_token !== "INSERISCI_QUI_IL_TOKEN_DEL_BOT" && config.telegram_chat_id !== "INSERISCI_QUI_IL_TUO_CHAT_ID") {
                            await bot.sendMessage(config.telegram_chat_id, message, { parse_mode: 'HTML' });
                            console.log(`Notifica inviata per: ${job.title}`);
                        } else {
                            console.log(`[TEST MODE] Invierei notifica per: ${job.title}`);
                        }
                        seenJobs.add(job.link);
                        newJobsFound++;
                    } catch (e) {
                        console.error(`Errore invio Telegram per "${job.title}":`, e.message);
                    }
                }
            }
        }
    } catch (err) {
        console.error("Errore generico durante l'esecuzione del browser:", err);
    } finally {
        if (browser) {
            await browser.close();
        }
    }

    // Salva i nuovi link per non rimandarli
    fs.writeFileSync(dbPath, JSON.stringify(Array.from(seenJobs), null, 2));
    console.log(`[${new Date().toLocaleString()}] Scraping completato. ${newJobsFound} nuove offerte trovate e salvate.`);
};

// Avvio programmato
console.log(`Scraper inizializzato.`);
console.log(`Schedulazione (Cron): ${config.cron_schedule}`);
cron.schedule(config.cron_schedule, runScraper);

// Esegui subito al lancio
runScraper();
