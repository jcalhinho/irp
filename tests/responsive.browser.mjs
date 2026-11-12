import { chromium, firefox, webkit } from 'playwright';

const formats = [
  [320,568],[360,740],[390,844],[430,932],[600,900],[768,1024],[820,1180],[896,700],
  [900,900],[1024,768],[1280,900],[1440,900],[1920,1080],[2560,1440],[844,390],[1024,600],
];

/** Matrice sur les vrais moteurs ; ne prétend pas couvrir tous les appareils physiques. */
export async function checkResponsive({ base, axe, screenshots }) {
  const report = { formats, engines: [], date: new Date().toISOString() };
  const sample = '<html lang="fr"><head><title>Document de test</title></head><body><main><h1>Une lecture qui reste confortable, même sur un petit écran</h1><h2>Un document avec des données</h2><p>Le texte conserve les informations utiles et les consignes. Vous ne devez pas payer 50 € avant le 12 novembre 2026. Vous pouvez solliciter une aide.</p><dl><dt>Libellé volontairement très long pour vérifier les colonnes étroites</dt><dd>Une valeur qui doit rester entièrement disponible sur tous les écrans.</dd></dl><table><caption>Données à consulter</caption><tr><th>Référence</th><th>Montant</th><th>Lien</th></tr><tr><td>REFERENCE'+'X'.repeat(120)+'</td><td>50 €</td><td><a href="https://example.org/">https://example.org/'+'chemin'.repeat(50)+'</a></td></tr></table><pre>'+'code_sans_espace_'.repeat(35)+'</pre><h2>La suite du texte</h2><p>La lecture continue après le tableau et le code. Les éléments larges doivent rester dans leur propre zone de défilement.</p></main></body></html>';
  for (const [name, engine] of [['chromium',chromium],['firefox',firefox],['webkit',webkit]]) {
    const browser=await engine.launch({headless:true});
    try {
      const context=await browser.newContext({locale:'fr-FR',acceptDownloads:true});
      const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
      const entry={name,version:browser.version(),screens:0,stressScreens:0,audits:[]};
      const layout = async (stage,width) => {
        const result=await page.evaluate(()=>{
          const max=document.documentElement.clientWidth;
          const controls=[...document.querySelectorAll('button,input,textarea,select,summary')].filter(el=>el.getClientRects().length);
          const clipped=controls.filter(el=>{const r=el.getBoundingClientRect();return r.left < -1 || r.right > max+1;}).map(el=>el.id||el.textContent.trim().slice(0,30));
          return {viewport:max,scroll:document.documentElement.scrollWidth,clipped};
        });
        if(result.scroll>result.viewport+1 || result.clipped.length)throw new Error(`${name} ${width}px ${stage}: ${JSON.stringify(result)}`);
        entry.screens++;
      };
      for (const [width,height] of formats) {
        await page.setViewportSize({width,height});
        await page.goto(base+'/tool.html');
        await page.evaluate(()=>localStorage.clear());await page.reload();
        await page.evaluate(()=>document.fonts.ready.then(()=>true));
        await layout('accueil',width);
        await page.locator('#demo').click();await page.waitForSelector('#out:not([hidden])');
        if(await page.locator('#dismiss-message').isVisible())await page.locator('#dismiss-message').click();
        if(width<=896) {
          if(await page.locator('#reading-options').getAttribute('open')!==null)throw new Error(name+' : réglages mobiles ouverts par défaut');
          await page.locator('#reading-options > summary').click();
        }
        await layout('réglages',width);
        await page.locator('#simplify').check();
        for(const view of ['t-read','t-compare','t-md']) {await page.locator('#'+view).click();await layout(view,width);}
        await page.locator('#t-read').click();
        await page.locator('#composer > summary').click();
        await page.locator('#file').setInputFiles({name:'lecture-responsive.html',mimeType:'text/html',buffer:Buffer.from(sample)});
        await page.waitForFunction(()=>document.title.startsWith('Une lecture qui reste'));
        if(width<=896)await page.locator('#reading-options > summary').click();
        await page.locator('#profile').selectOption('basse_vision');
        for(let n=0;n<8;n++)await page.locator('#bigger').click();
        await page.locator('.diagnostics > summary').click();
        await layout('grand contraste, texte 180 %, tableau, code et contrôles',width);
        entry.stressScreens++;
        await page.locator('#reset-prefs').click();
        await page.locator('#focus-mode').click();await layout('concentration',width);await page.keyboard.press('Escape');
        if(name==='chromium' && [320,768,1440].includes(width)) {
          const source=await (await page.request.get(axe+'/axe.min.js')).text();await page.evaluate(source);
          for(const view of ['t-read','t-compare','t-md']) {
            await page.locator('#'+view).click();
            const violations=await page.evaluate(async()=>{const r=await axe.run(document,{resultTypes:['violations']});return r.violations.map(v=>({id:v.id,impact:v.impact,targets:v.nodes.map(n=>n.target)}));});
            entry.audits.push({width,view,violations});
            if(violations.length)throw new Error(`axe ${width}px ${view}: ${JSON.stringify(violations)}`);
          }
        }
        if(screenshots && [390,768,1440].includes(width)) {
          await page.locator('#t-read').click();
          await page.screenshot({path:`${screenshots}/responsive-${name}-${width}.png`,fullPage:true});
        }
      }
      if(errors.length)throw new Error(name+' : '+errors.join('\n'));
      report.engines.push(entry);
    } finally {await browser.close();}
  }
  return report;
}
