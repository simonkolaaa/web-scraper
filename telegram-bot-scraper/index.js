const { chromium } = require('playwright');
const cheerio = require('cheerio');
const TelegramBot = require('node-telegram-bot-api');
const cron = require('node-cron');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const configPath = path.join(__dirname, 'config.json');
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'seen_jobs.json');
const recentJobsPath = path.join(dataDir, 'recent_jobs.json');
const legacyDbPath = path.join(__dirname, 'seen_jobs.json');

// Credenziali da .env
const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

if (!TELEGRAM_TOKEN || !TELEGRAM_CHAT_ID) {
    console.error("❌ ERRORE: TELEGRAM_BOT_TOKEN o TELEGRAM_CHAT_ID mancanti nel file .env!");
    process.exit(1);
}

// Funzioni di caricamento/salvataggio Configurazione
const loadConfig = () => JSON.parse(fs.readFileSync(configPath, 'utf8'));
const saveConfig = (cfg) => {
    try {
        fs.writeFileSync(configPath, JSON.stringify(cfg, null, 2), 'utf8');
    } catch (e) {
        console.error("⚠️ Impossibile salvare config.json:", e.message);
    }
};

let config = loadConfig();

// Migrazione seen_jobs.json in data/seen_jobs.json se necessario
if (!fs.existsSync(dbPath)) {
    if (fs.existsSync(legacyDbPath)) {
        fs.copyFileSync(legacyDbPath, dbPath);
    } else {
        fs.writeFileSync(dbPath, JSON.stringify([], null, 2));
    }
}
if (!fs.existsSync(recentJobsPath)) {
    fs.writeFileSync(recentJobsPath, JSON.stringify([], null, 2));
}

let seenJobs = new Set(JSON.parse(fs.readFileSync(dbPath, 'utf8')));
let recentJobs = JSON.parse(fs.readFileSync(recentJobsPath, 'utf8'));

const saveState = () => {
    try {
        fs.writeFileSync(dbPath, JSON.stringify(Array.from(seenJobs), null, 2));
        fs.writeFileSync(recentJobsPath, JSON.stringify(recentJobs.slice(0, 100), null, 2));
    } catch (e) {
        console.error("⚠️ Errore salvataggio stato:", e.message);
    }
};

// Inizializza Bot Telegram
const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });

// Variabili di stato e statistiche
let isScraping = false;
let lastRunTime = null;
let totalSentSession = 0;
let lastSiteStats = {};

const HTTP_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,application/json,*/*;q=0.8",
    "Accept-Language": "it-IT,it;q=0.9,en-US;q=0.8"
};

// Escape HTML per Telegram
const escapeHtml = (str = "") =>
    String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");

// Ricerca ESATTA delle parole (stile CheckFeed-Bot: "IT" non matcha dentro "pulito" o "vendita")
const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const matchesWordExact = (text, keyword) => {
    if (!text || !keyword) return false;
    // Rimuovi domini (.it, .com) o URL per evitare falsi positivi con la sigla "IT"
    const cleanText = text
        .replace(/https?:\/\/\S+/gi, ' ')
        .replace(/\.[a-z]{2,4}\b/gi, ' ')
        .replace(/[\u2018\u2019]/g, "'");
    const normalizedKw = keyword.trim().replace(/[\u2018\u2019]/g, "'");
    if (!normalizedKw) return false;

    // Per la sigla corta "IT", richiedi che sia scritta in MAIUSCOLO ("IT")
    if (normalizedKw.toUpperCase() === 'IT') {
        return /(?<![a-zA-Z0-9À-ÿ])IT(?![a-zA-Z0-9À-ÿ])/.test(cleanText);
    }

    const pattern = new RegExp(`(?<![a-zA-Z0-9À-ÿ])${escapeRegex(normalizedKw)}(?![a-zA-Z0-9À-ÿ])`, 'i');
    return pattern.test(cleanText);
};

const findMatchingKeyword = (text, keywords = []) => {
    for (const kw of keywords) {
        if (matchesWordExact(text, kw)) return kw;
    }
    return null;
};

// Determina se un annuncio appartiene ad almeno una categoria attiva e restituisce { categoryName, icon, matchedKeyword }
const matchJobCategory = (text, cfg) => {
    const categories = cfg.categories || {};
    for (const [catName, catData] of Object.entries(categories)) {
        const kw = findMatchingKeyword(text, catData.keywords || []);
        if (kw) {
            return {
                categoryName: catName,
                icon: catData.icon || "💼",
                matchedKeyword: kw
            };
        }
    }
    return null;
};

// ==========================================
// CONNETTORI SITI (PROVINCIA DI RIMINI)
// ==========================================

// 1. LinkedIn Jobs (API Pubblica Guest - Rimini e Provincia)
const scrapeLinkedIn = async () => {
    const jobs = [];
    const seenUrls = new Set();
    const queries = [
        "", // Tutte le offerte recenti a Rimini
        "sviluppatore OR programmatore OR IT OR software",
        "autista OR fattorino OR corriere OR magazziniere",
        "impiegato OR back office OR segreteria OR addetto vendita"
    ];

    for (const q of queries) {
        try {
            const url = `https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search?keywords=${encodeURIComponent(q)}&location=${encodeURIComponent("Rimini, Emilia-Romagna, Italia")}&f_TPR=r604800&start=0`;
            const res = await fetch(url, { headers: HTTP_HEADERS, signal: AbortSignal.timeout(12000) });
            if (!res.ok) continue;
            const html = await res.text();
            const $ = cheerio.load(html);

            $('li').each((i, el) => {
                const title = $(el).find('.base-search-card__title').text().replace(/\s+/g, ' ').trim();
                const company = $(el).find('.base-search-card__subtitle').text().replace(/\s+/g, ' ').trim();
                const location = $(el).find('.job-search-card__location').text().replace(/\s+/g, ' ').trim();
                let link = $(el).find('a.base-card__full-link').attr('href') || $(el).find('a').first().attr('href');

                if (title && link) {
                    link = link.split('?')[0].trim();
                    if (!seenUrls.has(link)) {
                        seenUrls.add(link);
                        jobs.push({
                            title,
                            company: company || "Azienda su LinkedIn",
                            location: location || "Rimini",
                            description: `${title} ${company} ${location}`,
                            link,
                            siteName: "LinkedIn Jobs",
                            preFilteredLocation: false // Verifichiamo il comune della prov. di Rimini
                        });
                    }
                }
            });
        } catch (err) {
            console.error("[LinkedIn] Errore query:", err.message);
        }
    }
    return jobs;
};

// 2. Subito.it Lavoro (API Ufficiale Hades per Provincia di Rimini: r=8, ci=9)
const scrapeSubito = async () => {
    const jobs = [];
    try {
        const url = "https://hades.subito.it/v1/search/items?c=26&r=8&ci=9&t=s&lim=60&start=0";
        const res = await fetch(url, { headers: HTTP_HEADERS, signal: AbortSignal.timeout(12000) });
        if (!res.ok) return jobs;
        const data = await res.json();

        for (const ad of (data.ads || [])) {
            const title = (ad.subject || "").trim();
            const body = (ad.body || "").trim();
            const town = ad.geo?.town?.value || ad.geo?.city?.value || "Rimini";
            const link = ad.urls?.default;

            if (title && link) {
                jobs.push({
                    title,
                    company: ad.advertiser?.name || "Inserzionista Subito.it",
                    location: `${town} (RN)`,
                    description: body,
                    link,
                    siteName: "Subito.it Lavoro",
                    preFilteredLocation: false
                });
            }
        }
    } catch (err) {
        console.error("[Subito.it] Errore:", err.message);
    }
    return jobs;
};

// 3. Agenzie per il Lavoro (Randstad Filiali di Rimini e Provincia)
const scrapeAgenzie = async () => {
    const jobs = [];
    const seenUrls = new Set();
    const urls = [
        "https://www.randstad.it/offerte-lavoro/emilia-romagna/rimini/",
        "https://www.randstad.it/offerte-lavoro/emilia-romagna/riccione/",
        "https://www.randstad.it/offerte-lavoro/emilia-romagna/cattolica/"
    ];

    for (const pageUrl of urls) {
        try {
            const res = await fetch(pageUrl, { headers: HTTP_HEADERS, signal: AbortSignal.timeout(12000) });
            if (!res.ok) continue;
            const html = await res.text();
            const $ = cheerio.load(html);

            $('a[href*="/offerte-lavoro/"]').each((i, el) => {
                const href = $(el).attr('href');
                const title = $(el).text().replace(/\s+/g, ' ').trim();
                if (
                    href &&
                    /_[a-f0-9-]{20,}\/?$/i.test(href) &&
                    title &&
                    title.toLowerCase() !== "mostra i dettagli" &&
                    title.length > 4
                ) {
                    const fullLink = href.startsWith('http') ? href : `https://www.randstad.it${href}`;
                    if (!seenUrls.has(fullLink)) {
                        seenUrls.add(fullLink);
                        const cardText = $(el).closest('li, article, div.cards__item, div').text().replace(/\s+/g, ' ').trim();
                        jobs.push({
                            title,
                            company: "Randstad Rimini",
                            location: pageUrl.includes('riccione') ? "Riccione (RN)" : pageUrl.includes('cattolica') ? "Cattolica (RN)" : "Rimini (RN)",
                            description: cardText,
                            link: fullLink,
                            siteName: "Agenzie Lavoro (Randstad)",
                            preFilteredLocation: false
                        });
                    }
                }
            });
        } catch (err) {
            console.error("[Agenzie] Errore:", err.message);
        }
    }
    return jobs;
};

// 4. Lavoro Per Te Emilia-Romagna (Ricerca mirata su Rimini con Playwright)
const scrapeLavoroPerTe = async (browser) => {
    const jobs = [];
    if (!browser) return jobs;
    let page;
    try {
        page = await browser.newPage();
        await page.goto("https://lavoroperte.regione.emilia-romagna.it/offerte-lavoro/vacancy/cerca", {
            waitUntil: 'domcontentloaded',
            timeout: 25000
        });
        await page.waitForTimeout(2000);

        // Prova a digitare "Rimini" nel campo di ricerca se presente
        try {
            const input = await page.$('input[type="text"]');
            if (input) {
                await input.fill('Rimini');
                await page.keyboard.press('Enter');
                await page.waitForTimeout(3000);
            }
        } catch (_) {}

        const content = await page.content();
        const $ = cheerio.load(content);
        const seenUrls = new Set();

        $('a[href*="/offerte-lavoro/"]').each((i, el) => {
            const href = $(el).attr('href');
            const title = $(el).text().replace(/\s+/g, ' ').trim();
            if (href && /\d+$/.test(href) && title && title.length > 4) {
                const fullLink = href.startsWith('http')
                    ? href
                    : `https://lavoroperte.regione.emilia-romagna.it${href.startsWith('/') ? '' : '/'}${href}`;
                if (!seenUrls.has(fullLink)) {
                    seenUrls.add(fullLink);
                    const cardText = $(el).closest('div, li, tr').text().replace(/\s+/g, ' ').trim();
                    const isRiminiUrl = fullLink.toLowerCase().includes('/rimini/');
                    jobs.push({
                        title,
                        company: "Centro per l'Impiego ER",
                        location: isRiminiUrl ? "Rimini (RN)" : "Emilia-Romagna",
                        description: cardText,
                        link: fullLink,
                        siteName: "Lavoro Per Te ER",
                        preFilteredLocation: false
                    });
                }
            }
        });
    } catch (err) {
        console.error("[LavoroPerTe] Errore:", err.message);
    } finally {
        if (page) await page.close().catch(() => {});
    }
    return jobs;
};

// 5. Portali Annunci Rimini (Careerjet / Bakeca / HelpLavoro Rimini)
const scrapePortali = async (browser) => {
    const jobs = [];
    const seenUrls = new Set();

    // 5a. Careerjet Provincia di Rimini (HTTP)
    try {
        const res = await fetch("https://www.careerjet.it/lavoro-provincia-di-rimini-122868.html", {
            headers: HTTP_HEADERS,
            signal: AbortSignal.timeout(12000)
        });
        if (res.ok) {
            const html = await res.text();
            const $ = cheerio.load(html);
            $('article.job, .job').each((i, el) => {
                const titleEl = $(el).find('h2 a, header a').first();
                const title = titleEl.text().replace(/\s+/g, ' ').trim();
                const href = titleEl.attr('href');
                const company = $(el).find('.company').text().replace(/\s+/g, ' ').trim();
                const location = $(el).find('.location').text().replace(/\s+/g, ' ').trim();
                const desc = $(el).find('.desc').text().replace(/\s+/g, ' ').trim();
                if (title && href) {
                    const fullLink = href.startsWith('http') ? href : `https://www.careerjet.it${href}`;
                    if (!seenUrls.has(fullLink)) {
                        seenUrls.add(fullLink);
                        jobs.push({
                            title,
                            company: company || "Annuncio Careerjet",
                            location: location || "Rimini (RN)",
                            description: desc,
                            link: fullLink,
                            siteName: "Careerjet Rimini",
                            preFilteredLocation: false
                        });
                    }
                }
            });
        }
    } catch (err) {
        console.error("[Careerjet] Errore:", err.message);
    }

    // 5b. Bakeca Lavoro Rimini tramite Playwright (se browser attivo)
    if (browser) {
        let page;
        try {
            page = await browser.newPage({
                userAgent: HTTP_HEADERS["User-Agent"]
            });
            await page.goto("https://rimini.bakeca.it/annunci/offerte-di-lavoro/", {
                waitUntil: 'domcontentloaded',
                timeout: 20000
            });
            await page.waitForTimeout(2000);
            const html = await page.content();
            const $ = cheerio.load(html);
            $('a[href*="/dettaglio/"]').each((i, el) => {
                const href = $(el).attr('href');
                const rawText = $(el).text().replace(/\s+/g, ' ').trim();
                const title = rawText
                    .replace(/^\d*Nuova selezione/i, '')
                    .replace(/Tempo (determinato|indeterminato).*/i, '')
                    .trim()
                    .slice(0, 110);
                if (href && title && title.length > 6) {
                    const fullLink = href.startsWith('http') ? href : `https://rimini.bakeca.it${href}`;
                    if (!seenUrls.has(fullLink)) {
                        seenUrls.add(fullLink);
                        jobs.push({
                            title,
                            company: "Bakeca Rimini",
                            location: "Rimini (RN)",
                            description: rawText,
                            link: fullLink,
                            siteName: "Bakeca Lavoro Rimini",
                            preFilteredLocation: false
                        });
                    }
                }
            });
        } catch (err) {
            console.error("[Bakeca] Errore:", err.message);
        } finally {
            if (page) await page.close().catch(() => {});
        }
    }

    return jobs;
};

// ==========================================
// MOTORE DI SCRAPING E FILTRAGGIO
// ==========================================

const runScraper = async (chatIdForReply = null) => {
    config = loadConfig();

    if (!config.active && !chatIdForReply) {
        console.log("⏸️ Bot in pausa (/stop attivo). Salto scansione programmata.");
        return;
    }

    if (isScraping) {
        if (chatIdForReply) {
            bot.sendMessage(chatIdForReply, "⚠️ Scansione già in corso. Attendi qualche secondo...");
        }
        return;
    }

    isScraping = true;
    const startTime = Date.now();
    console.log(`[${new Date().toLocaleString('it-IT')}] 🔍 Avvio scansione multi-sito (Provincia di Rimini)...`);
    if (chatIdForReply) {
        bot.sendMessage(chatIdForReply, "🔍 <b>Avvio scansione su tutti i 5 portali per la Provincia di Rimini...</b>", { parse_mode: 'HTML' });
    }

    let browser = null;
    let newJobsFound = 0;

    try {
        try {
            browser = await chromium.launch({
                headless: true,
                args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
            });
        } catch (browserErr) {
            console.warn("⚠️ Chromium non disponibile, proseguo con i connettori HTTP/API veloci:", browserErr.message);
        }

        const [liJobs, subJobs, agJobs, lptJobs, portJobs] = await Promise.all([
            scrapeLinkedIn(),
            scrapeSubito(),
            scrapeAgenzie(),
            scrapeLavoroPerTe(browser),
            scrapePortali(browser)
        ]);

        lastSiteStats = {
            "LinkedIn Jobs": { scanned: liJobs.length, matched: 0 },
            "Subito.it Lavoro": { scanned: subJobs.length, matched: 0 },
            "Agenzie Lavoro (Randstad)": { scanned: agJobs.length, matched: 0 },
            "Lavoro Per Te ER": { scanned: lptJobs.length, matched: 0 },
            "Portali Annunci (Careerjet/Bakeca)": { scanned: portJobs.length, matched: 0 }
        };

        const allJobs = [...liJobs, ...subJobs, ...agJobs, ...lptJobs, ...portJobs];
        console.log(`📊 Totale annunci grezzi raccolti: ${allJobs.length}`);

        const blacklist = config.blacklist || [];
        const locations = config.locations || [];

        for (const job of allJobs) {
            const fullText = `${job.title} ${job.description || ''} ${job.location || ''}`;

            // 1. Verifica Blacklist (esatta) PRIMA di tutto (così esclude subito Santarcangelo, Bellaria, Poggio Torriana, frazioni ecc.)
            const blacklistedWord = findMatchingKeyword(fullText, blacklist);
            if (blacklistedWord) continue;

            // 2. Verifica Comune (Morciano, San Clemente, Sant'Andrea in Casale, Cattolica, San Giovanni, Riccione, Misano, Rimini)
            const matchedLocation = findMatchingKeyword(`${job.title} ${job.description || ''} ${job.location || ''}`, locations);
            if (!matchedLocation) continue;

            // 3. Verifica Categoria & Keyword (esatta)
            const categoryMatch = matchJobCategory(fullText, config);
            if (!categoryMatch) continue;

            // Aggiorna contatore match per statistica sito
            const statKey = Object.keys(lastSiteStats).find(k => k.startsWith(job.siteName.split(' ')[0])) || job.siteName;
            if (lastSiteStats[statKey]) {
                lastSiteStats[statKey].matched++;
            }

            // 4. Se non è mai stato inviato prima, invia su Telegram!
            if (!seenJobs.has(job.link)) {
                const message =
                    `${categoryMatch.icon} <b>Nuova Offerta: ${escapeHtml(categoryMatch.categoryName)}</b>\n\n` +
                    `💼 <b>Ruolo:</b> ${escapeHtml(job.title)}\n` +
                    `🏢 <b>Azienda:</b> ${escapeHtml(job.company || 'N/D')}\n` +
                    `📍 <b>Luogo:</b> ${escapeHtml(job.location || 'Provincia di Rimini')}\n` +
                    `🌐 <b>Fonte:</b> ${escapeHtml(job.siteName)}\n` +
                    `🔑 <b>Keyword:</b> <i>${escapeHtml(categoryMatch.matchedKeyword)}</i>\n\n` +
                    `🔗 <a href="${job.link}">Vai all'offerta completa</a>`;

                try {
                    await bot.sendMessage(TELEGRAM_CHAT_ID, message, {
                        parse_mode: 'HTML',
                        disable_web_page_preview: true
                    });
                    seenJobs.add(job.link);
                    recentJobs.unshift({
                        title: job.title,
                        company: job.company || 'N/D',
                        location: job.location || 'Rimini (RN)',
                        siteName: job.siteName,
                        category: `${categoryMatch.icon} ${categoryMatch.categoryName}`,
                        keyword: categoryMatch.matchedKeyword,
                        link: job.link,
                        foundAt: new Date().toLocaleString('it-IT')
                    });
                    newJobsFound++;
                    totalSentSession++;
                    // Piccola pausa anti rate-limit Telegram
                    await new Promise(r => setTimeout(r, 400));
                } catch (sendErr) {
                    console.error(`Errore invio Telegram per "${job.title}":`, sendErr.message);
                }
            }
        }
    } catch (err) {
        console.error("❌ Errore durante lo scraping:", err);
    } finally {
        if (browser) {
            await browser.close().catch(() => {});
        }
        isScraping = false;
        lastRunTime = new Date().toLocaleString('it-IT');
        saveState();
    }

    const elapsedSec = ((Date.now() - startTime) / 1000).toFixed(1);
    const summaryMsg = newJobsFound > 0
        ? `✅ <b>Scansione completata in ${elapsedSec}s!</b>\nInviate <b>${newJobsFound}</b> nuove offerte per la provincia di Rimini.`
        : `ℹ️ <b>Scansione completata in ${elapsedSec}s.</b>\nNessuna nuova offerta rispetto alle ${seenJobs.size} già archiviate.`;

    console.log(`[${lastRunTime}] Nuove offerte inviate: ${newJobsFound}`);
    if (chatIdForReply) {
        bot.sendMessage(chatIdForReply, summaryMsg, { parse_mode: 'HTML' });
    }
};

// ==========================================
// MESSAGGIO COMANDI (STILE CHECKFEED-BOT) + PIN
// ==========================================

const buildCommandsMessage = () => {
    const cfg = loadConfig();
    const totalKeywords = Object.values(cfg.categories || {}).reduce(
        (acc, cat) => acc + (cat.keywords ? cat.keywords.length : 0),
        0
    );
    const sitesList = (cfg.sites || [])
        .filter(s => s.enabled)
        .map(s => `• ${escapeHtml(s.name)}`)
        .join('\n');

    return (
        `📌 <b>JobScraper Bot Rimini — Guida Comandi</b>\n` +
        `<i>Stato notifiche: ${cfg.active ? "🟢 ATTIVO" : "🔴 IN PAUSA"}</i>\n\n` +
        `<b>📋 Comandi disponibili (fissa questo messaggio):</b>\n` +
        `• /fetch (o /scrape) — avvia subito una scansione manuale\n` +
        `• /latest [n] — mostra le ultime <i>n</i> offerte trovate (default 5)\n` +
        `• /status (o /report) — statistiche per sito e stato bot\n` +
        `• /keywords — mostra tutte le keyword attive e la blacklist\n` +
        `• /setkeywords <i>parola1, parola2</i> — aggiunge nuove keyword\n` +
        `• /removekeywords <i>parola1, parola2</i> — rimuove keyword\n` +
        `• /blacklist <i>parola1, parola2</i> — aggiunge parole da escludere\n` +
        `• /removeblacklist <i>parola1, parola2</i> — rimuove dalla blacklist\n` +
        `• /stop — mette in pausa le notifiche automatiche\n` +
        `• /start — riattiva le notifiche e mostra il riepilogo\n` +
        `• /commands — invia e fissa in alto questo elenco comandi\n\n` +
        `<b>⏰ Scheduler &amp; Filtri:</b>\n` +
        `• Controllo automatico ogni ${cfg.polling_minutes || 30} minuti\n` +
        `• Area: Provincia di Rimini (${(cfg.locations || []).length} comuni)\n` +
        `• Keyword attive: ${totalKeywords} (in 4 categorie) | Blacklist: ${(cfg.blacklist || []).length}\n\n` +
        `<b>🌐 Portali monitorati:</b>\n${sitesList}\n\n` +
        `🖥️ <i>${escapeHtml(cfg.machine_name || 'Docker-Rimini-JobBot')}</i>`
    );
};

const sendAndPinCommandsMessage = async (chatId) => {
    try {
        const msgText = buildCommandsMessage();
        const sentMsg = await bot.sendMessage(chatId, msgText, {
            parse_mode: 'HTML',
            disable_web_page_preview: true
        });
        // Prova a fissare il messaggio in alto nella chat
        try {
            await bot.pinChatMessage(chatId, sentMsg.message_id, { disable_notification: true });
            console.log(`📌 Messaggio comandi fissato con successo nella chat ${chatId}`);
        } catch (pinErr) {
            console.log(`ℹ️ Nota pinChatMessage: ${pinErr.message}`);
        }
    } catch (err) {
        console.error("❌ Errore invio messaggio comandi:", err.message);
    }
};

// ==========================================
// GESTIONE COMANDI TELEGRAM
// ==========================================

bot.onText(/^\/start/, async (msg) => {
    config = loadConfig();
    config.active = true;
    saveConfig(config);
    await bot.sendMessage(
        msg.chat.id,
        "👋 <b>Bentornato!</b> Le notifiche automatiche per le offerte di lavoro in <b>Provincia di Rimini</b> sono attive.",
        { parse_mode: 'HTML' }
    );
    await sendAndPinCommandsMessage(msg.chat.id);
});

bot.onText(/^\/stop/, (msg) => {
    config = loadConfig();
    config.active = false;
    saveConfig(config);
    bot.sendMessage(
        msg.chat.id,
        "⏸️ <b>Notifiche automatiche sospese.</b>\nUsa /start quando vuoi riattivarle (puoi comunque usare /fetch manualmente).",
        { parse_mode: 'HTML' }
    );
});

bot.onText(/^\/commands/, async (msg) => {
    await sendAndPinCommandsMessage(msg.chat.id);
});

bot.onText(/^\/(fetch|scrape)/, (msg) => {
    runScraper(msg.chat.id);
});

bot.onText(/^\/(status|report)/, (msg) => {
    config = loadConfig();
    const statsLines = Object.entries(lastSiteStats).map(
        ([site, st]) => `• <b>${escapeHtml(site)}:</b> ${st.scanned} letti (${st.matched} in target)`
    );

    const statusMsg =
        `📊 <b>Status JobScraper Bot Rimini</b>\n\n` +
        `• <b>Stato:</b> ${config.active ? "🟢 Attivo" : "🔴 In pausa"}\n` +
        `• <b>Scansione in corso:</b> ${isScraping ? "Sì ⏳" : "No ✅"}\n` +
        `• <b>Ultimo controllo:</b> ${lastRunTime || "In corso / Non ancora eseguito"}\n` +
        `• <b>Offerte uniche in archivio:</b> ${seenJobs.size}\n` +
        `• <b>Inviate in questa sessione:</b> ${totalSentSession}\n\n` +
        `<b>🌐 Ultimo report dai portali:</b>\n` +
        (statsLines.length > 0 ? statsLines.join('\n') : "<i>Nessuna scansione ancora completata</i>") +
        `\n\n🖥️ <i>${escapeHtml(config.machine_name || 'Docker-Rimini-JobBot')}</i>`;

    bot.sendMessage(msg.chat.id, statusMsg, { parse_mode: 'HTML' });
});

bot.onText(/^\/latest(?:\s+(\d+))?/, (msg, match) => {
    const n = Math.min(Math.max(parseInt(match[1] || '5', 10), 1), 15);
    if (recentJobs.length === 0) {
        bot.sendMessage(msg.chat.id, "⚠️ Nessuna offerta salvata di recente. Usa /fetch per avviare una scansione.");
        return;
    }

    const slice = recentJobs.slice(0, n);
    const lines = [`📰 <b>Ultime ${slice.length} offerte trovate a Rimini e provincia:</b>\n`];

    for (const j of slice) {
        lines.push(
            `<b>${escapeHtml(j.title)}</b>\n` +
            `${escapeHtml(j.category || '💼 Lavoro')} — 📍 ${escapeHtml(j.location)}\n` +
            `🏢 ${escapeHtml(j.company)} | 🌐 ${escapeHtml(j.siteName)}\n` +
            `🔗 <a href="${j.link}">Vai all'offerta</a>`
        );
    }

    bot.sendMessage(msg.chat.id, lines.join('\n\n'), {
        parse_mode: 'HTML',
        disable_web_page_preview: true
    });
});

bot.onText(/^\/keywords/, (msg) => {
    config = loadConfig();
    const lines = [`📝 <b>Parole Chiave Attive (Ricerca Esatta):</b>\n`];

    for (const [catName, catData] of Object.entries(config.categories || {})) {
        const kws = catData.keywords || [];
        if (kws.length > 0) {
            lines.push(
                `${catData.icon || '💼'} <b>${escapeHtml(catName)} (${kws.length}):</b>\n` +
                `<i>${escapeHtml(kws.join(', '))}</i>\n`
            );
        }
    }

    const bl = config.blacklist || [];
    lines.push(
        `🚫 <b>Blacklist / Esclusioni (${bl.length}):</b>\n` +
        `<i>${escapeHtml(bl.join(', '))}</i>\n\n` +
        `📍 <b>Comuni attivi (${(config.locations || []).length}):</b>\n` +
        `<i>${escapeHtml((config.locations || []).join(', '))}</i>\n\n` +
        `💡 <i>Usa /setkeywords parola1, parola2 per aggiungere o /removekeywords per rimuovere.</i>`
    );

    bot.sendMessage(msg.chat.id, lines.join('\n'), { parse_mode: 'HTML' });
});

bot.onText(/^\/setkeywords(?:\s+(.+))?/, (msg, match) => {
    const raw = (match[1] || '').trim();
    if (!raw) {
        bot.sendMessage(msg.chat.id, "❗ Usa: <code>/setkeywords parola1, parola2, PAROLA COMPOSTA</code>", { parse_mode: 'HTML' });
        return;
    }

    const newKws = raw.split(',').map(k => k.trim()).filter(Boolean);
    if (newKws.length === 0) {
        bot.sendMessage(msg.chat.id, "❗ Specifica almeno una keyword valida.");
        return;
    }

    config = loadConfig();
    if (!config.categories["Personalizzate"]) {
        config.categories["Personalizzate"] = { icon: "⭐", keywords: [] };
    }

    // Raccogli tutte le keyword esistenti (case-insensitive)
    const allExistingLower = new Set();
    for (const cat of Object.values(config.categories)) {
        for (const k of (cat.keywords || [])) {
            allExistingLower.add(k.toLowerCase());
        }
    }

    const added = [];
    const skipped = [];
    for (const kw of newKws) {
        if (!allExistingLower.has(kw.toLowerCase())) {
            allExistingLower.add(kw.toLowerCase());
            config.categories["Personalizzate"].keywords.push(kw);
            added.push(kw);
        } else {
            skipped.push(kw);
        }
    }

    saveConfig(config);

    let reply = added.length > 0
        ? `✅ <b>Keyword aggiunte:</b> ${escapeHtml(added.join(', '))}`
        : `ℹ️ Tutte le keyword specificate erano già presenti.`;
    if (skipped.length > 0) {
        reply += `\n⚠️ <b>Già presenti:</b> ${escapeHtml(skipped.join(', '))}`;
    }
    bot.sendMessage(msg.chat.id, reply, { parse_mode: 'HTML' });
});

bot.onText(/^\/removekeywords(?:\s+(.+))?/, (msg, match) => {
    const raw = (match[1] || '').trim();
    if (!raw) {
        bot.sendMessage(msg.chat.id, "❗ Usa: <code>/removekeywords parola1, parola2</code>", { parse_mode: 'HTML' });
        return;
    }

    const toRemoveLower = new Set(raw.split(',').map(k => k.trim().toLowerCase()).filter(Boolean));
    config = loadConfig();

    const removed = [];
    for (const cat of Object.values(config.categories || {})) {
        const before = cat.keywords || [];
        cat.keywords = before.filter(k => {
            if (toRemoveLower.has(k.toLowerCase())) {
                removed.push(k);
                return false;
            }
            return true;
        });
    }

    saveConfig(config);

    if (removed.length > 0) {
        bot.sendMessage(msg.chat.id, `✅ <b>Keyword rimosse:</b> ${escapeHtml(removed.join(', '))}`, { parse_mode: 'HTML' });
    } else {
        bot.sendMessage(msg.chat.id, `❌ Nessuna delle keyword indicate è stata trovata. Usa /keywords per vedere l'elenco.`, { parse_mode: 'HTML' });
    }
});

bot.onText(/^\/blacklist(?:\s+(.+))?/, (msg, match) => {
    const raw = (match[1] || '').trim();
    if (!raw) {
        bot.sendMessage(msg.chat.id, "❗ Usa: <code>/blacklist parola1, parola2</code> per escludere offerte con quelle parole.", { parse_mode: 'HTML' });
        return;
    }

    const newWords = raw.split(',').map(k => k.trim()).filter(Boolean);
    config = loadConfig();
    const existingLower = new Set((config.blacklist || []).map(w => w.toLowerCase()));
    const added = [];

    for (const w of newWords) {
        if (!existingLower.has(w.toLowerCase())) {
            existingLower.add(w.toLowerCase());
            config.blacklist.push(w);
            added.push(w);
        }
    }

    saveConfig(config);
    bot.sendMessage(
        msg.chat.id,
        added.length > 0
            ? `🚫 <b>Aggiunte alla Blacklist:</b> ${escapeHtml(added.join(', '))}`
            : `ℹ️ Parole già presenti nella Blacklist.`,
        { parse_mode: 'HTML' }
    );
});

bot.onText(/^\/removeblacklist(?:\s+(.+))?/, (msg, match) => {
    const raw = (match[1] || '').trim();
    if (!raw) {
        bot.sendMessage(msg.chat.id, "❗ Usa: <code>/removeblacklist parola1, parola2</code>", { parse_mode: 'HTML' });
        return;
    }

    const toRemove = new Set(raw.split(',').map(k => k.trim().toLowerCase()).filter(Boolean));
    config = loadConfig();
    const removed = [];
    config.blacklist = (config.blacklist || []).filter(w => {
        if (toRemove.has(w.toLowerCase())) {
            removed.push(w);
            return false;
        }
        return true;
    });

    saveConfig(config);
    bot.sendMessage(
        msg.chat.id,
        removed.length > 0
            ? `✅ <b>Rimosse dalla Blacklist:</b> ${escapeHtml(removed.join(', '))}`
            : `❌ Parole non trovate nella Blacklist.`,
        { parse_mode: 'HTML' }
    );
});

bot.on('polling_error', (error) => {
    console.log("[Telegram Polling Warning]", error.message);
});

// ==========================================
// AVVIO BOT + INVIO COMANDI + SCHEDULER
// ==========================================

(async () => {
    console.log("🚀 JobScraper Bot Rimini inizializzato.");
    console.log(`⏰ Schedulazione Cron: ${config.cron_schedule}`);

    // Registra il menu comandi nativo di Telegram
    try {
        await bot.setMyCommands([
            { command: 'fetch', description: 'Avvia subito una scansione manuale' },
            { command: 'latest', description: 'Mostra le ultime offerte trovate' },
            { command: 'status', description: 'Statistiche portali e stato del bot' },
            { command: 'keywords', description: 'Mostra keyword attive e blacklist' },
            { command: 'setkeywords', description: 'Aggiungi keyword (separate da virgola)' },
            { command: 'removekeywords', description: 'Rimuovi keyword' },
            { command: 'blacklist', description: 'Aggiungi parole da escludere' },
            { command: 'commands', description: 'Invia e fissa la scheda comandi' },
            { command: 'stop', description: 'Sospendi notifiche automatiche' },
            { command: 'start', description: 'Riattiva notifiche e mostra info' }
        ]);
    } catch (e) {
        console.warn("Impossibile impostare menu comandi nativo:", e.message);
    }

    // Invia e fissa su Telegram il riepilogo completo dei comandi all'avvio
    await sendAndPinCommandsMessage(TELEGRAM_CHAT_ID);

    // Schedulazione periodica
    cron.schedule(config.cron_schedule, () => runScraper());

    // Esegui subito il primo controllo all'avvio
    await runScraper();
})();
