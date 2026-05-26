const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
  console.log("Lancio browser...");
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  console.log("Navigazione...");
  await page.goto('https://lavoroperte.regione.emilia-romagna.it/offerte-lavoro/vacancy/cerca', { waitUntil: 'networkidle' });
  
  // Attendiamo che il caricamento iniziale finisca, diamogli un paio di secondi extra per i render dinamici
  await page.waitForTimeout(5000);
  
  const html = await page.content();
  fs.writeFileSync('page_dump.html', html);
  console.log("HTML salvato in page_dump.html");
  
  // Proviamo a trovare i selettori più probabili
  const elements = await page.evaluate(() => {
    // Troviamo un testo che sappiamo esserci e risaliamo l'albero DOM
    const el = Array.from(document.querySelectorAll('*')).find(e => e.innerText && e.innerText.includes('TRASLOCHI') && e.children.length === 0);
    if (!el) return [];
    
    // Risaliamo di qualche livello per vedere il contenitore
    let container = el;
    for(let i=0; i<4; i++) {
        if(container.parentElement) container = container.parentElement;
    }
    
    return [{
        tagName: container.tagName,
        className: container.className,
        html: container.innerHTML.substring(0, 500)
    }];
  });
  
  console.log("Possibili contenitori offerte:");
  console.log(elements);
  
  await browser.close();
})();
