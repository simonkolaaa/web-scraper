const { chromium } = require('playwright');
const cheerio = require('cheerio');
const TelegramBot = require('node-telegram-bot-api');
const cron = require('node-cron');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const configPath = path.join(__dirname, 'config.json');
const dbPath = path.join(__dirname, 'seen_jobs.json');

// Credenziali da .env (MAI nel config.json!)
const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

// Carica configurazione
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });

// Inizializza database ID visti
if (!fs.existsSync(dbPath)) {
    fs.writeFileSync(dbPath, JSON.stringify([]));
}
let seenJobs = new Set(JSON.parse(fs.readFileSync(dbPath, 'utf8')));

// Variabile di stato
let isScraping = false;
let totalScrapedToday = 0;

// Funzione di utilità per filtrare parole chiave
const containsKeyword = (text, keywords) => {
    if (!text || keywords.length === 0) return false;
    const lowerText = text.toLowerCase();
    return keywords.some(kw => lowerText.includes(kw.toLowerCase()));
};

// Funzione principale di scraping per un singolo sito
const scrapeSite = async (site, browser) => {
    try {
        const page = await browser.newPage();
        await page.goto(site.url, { waitUntil: 'networkidle', timeout: 30000 });
        
        try {
            await page.waitForSelector(site.selectors.job_container, { timeout: 10000 });
        } catch (e) {
            console.log(`[Avviso] Selettore ${site.selectors.job_container} non trovato o attesa scaduta per ${site.name}`);
        }
        
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
                jobs.push({ title, link, description, siteName: site.name });
            }
        });
        return jobs;
    } catch (error) {
        console.error(`Errore durante lo scraping di ${site.name}:`, error.message);
        return [];
    }
};

// Esecuzione dello scraping su tutti i siti e controllo regole
const runScraper = async (chatIdForReply = null) => {
    if (isScraping) {
        if (chatIdForReply) bot.sendMessage(chatIdForReply, "⚠️ Scraping già in corso. Attendi...");
        return;
    }
    
    isScraping = true;
    console.log(`[${new Date().toLocaleString()}] Avvio scraping...`);
    if (chatIdForReply) bot.sendMessage(chatIdForReply, "🔍 Avvio scraping su tutti i siti...");

    let newJobsFound = 0;
    let browser;
    
    try {
        browser = await chromium.launch({ headless: true });
        
        // Esecuzione CONCORRENTE: scansiona tutti i siti contemporaneamente
        console.log(`Controllo simultaneo di ${config.sites.length} siti...`);
        const allJobsArrays = await Promise.all(config.sites.map(site => scrapeSite(site, browser)));
        
        // Uniamo gli array di risultati
        const allJobs = allJobsArrays.flat();
        console.log(`Trovate ${allJobs.length} offerte totali da analizzare.`);

        for (const job of allJobs) {
            const content = `${job.title} ${job.description}`.toLowerCase();
            
            // Applica i filtri
            const hasInclude = config.keywords.include.length === 0 || containsKeyword(content, config.keywords.include);
            const hasExclude = containsKeyword(content, config.keywords.exclude);
            const hasLocation = !config.keywords.locations || config.keywords.locations.length === 0 || containsKeyword(content, config.keywords.locations);

            // Se rispetta i criteri e non è già stato notificato
            if (hasInclude && !hasExclude && hasLocation && !seenJobs.has(job.link)) {
                const message = `🚨 <b>Nuova Offerta di Lavoro!</b>\n\n` +
                                `🏢 <b>Sito:</b> ${job.siteName}\n` +
                                `💼 <b>Titolo:</b> ${job.title}\n` +
                                `🔗 <b>Link:</b> <a href="${job.link}">Vai all'offerta</a>`;
                
                try {
                    await bot.sendMessage(TELEGRAM_CHAT_ID, message, { parse_mode: 'HTML' });
                    seenJobs.add(job.link);
                    newJobsFound++;
                    totalScrapedToday++;
                } catch (e) {
                    console.error(`Errore invio Telegram per "${job.title}":`, e.message);
                }
            }
        }
    } catch (err) {
        console.error("Errore generico durante l'esecuzione del browser:", err);
    } finally {
        if (browser) {
            await browser.close();
        }
        isScraping = false;
    }

    // Salva i nuovi link per non rimandarli
    fs.writeFileSync(dbPath, JSON.stringify(Array.from(seenJobs), null, 2));
    const msg = newJobsFound > 0
        ? `✅ Scansione completata: ${newJobsFound} nuove offerte inviate!`
        : `ℹ️ Scansione completata: nessuna nuova offerta trovata questa volta.`;
    console.log(`[${new Date().toLocaleString()}] ${msg}`);
    
    if (chatIdForReply) {
        bot.sendMessage(chatIdForReply, msg);
    }
};

// ==========================================
// TELEGRAM BOT COMMANDS
// ==========================================

bot.onText(/\/start/, (msg) => {
    bot.sendMessage(msg.chat.id, "👋 Ciao! Sono il tuo Bot per lo scraping di offerte di lavoro.\n\nUsa /scrape per avviare una scansione manuale.\nUsa /status per vedere le statistiche di oggi.");
});

bot.onText(/\/scrape/, (msg) => {
    // Rispondi e avvia lo scraping forzato
    runScraper(msg.chat.id);
});

bot.onText(/\/status/, (msg) => {
    const stats = `📊 <b>Status Bot</b>\n\n` +
                  `Siti configurati: ${config.sites.length}\n` +
                  `Offerte uniche inviate in totale: ${seenJobs.size}\n` +
                  `Nuove offerte trovate nell'ultima sessione: ${totalScrapedToday}\n` +
                  `Scraping in corso: ${isScraping ? "Sì ⏳" : "No ❌"}`;
    bot.sendMessage(msg.chat.id, stats, { parse_mode: 'HTML' });
});

bot.on('polling_error', (error) => {
    console.log("[Telegram API Error]", error.message);
});

// Avvio programmato (Cron)
console.log(`Scraper inizializzato con polling interattivo.`);
console.log(`Schedulazione (Cron): ${config.cron_schedule}`);
cron.schedule(config.cron_schedule, () => runScraper());

// Esegui subito al primo avvio
runScraper();
