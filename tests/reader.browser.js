// Scénario à exécuter avec browser_run_code_unsafe (fonction Playwright recevant page).
// Serveur : ./start.sh --port 8767 --no-open
// Pour axe : python3 -m http.server 8870 --bind 127.0.0.1 --directory tests/node_modules/axe-core
(async (page, config = {}) => {
  const checks = [], errors = [];
  const ok = (condition, label) => { if (!condition) throw new Error(label); checks.push(label); };
  page.on('pageerror', (e) => errors.push(e.message));
  const base = config.base || 'http://127.0.0.1:8767';
  await page.setViewportSize({width:1280,height:900});
  await page.goto(base + '/tool');
  await page.evaluate(() => localStorage.clear()); await page.reload();
  ok(await page.getByRole('heading', {level:1}).isVisible(), 'Accueil accessible sans compte');
  const axeSource = await (await page.request.get((config.axe || 'http://127.0.0.1:8870') + '/axe.min.js')).text();
  const audit = async (label) => {
    await page.evaluate(axeSource);
    const result = await page.evaluate(async()=>{const r=await axe.run(document,{resultTypes:['violations']});return r.violations.map(v=>({id:v.id,impact:v.impact,nodes:v.nodes.map(n=>n.target)}));});
    ok(!result.length, label + ' : axe sans violation (' + JSON.stringify(result) + ')');
  };
  await audit('Accueil');
  if (config.screenshots) await page.screenshot({path:config.screenshots+'/accueil.png',fullPage:true});
  await page.getByRole('button',{name:'Essayer avec un exemple'}).click();
  await page.waitForSelector('#out:not([hidden])');
  ok((await page.locator('#fidelity-text').innerText()).includes('inchangé'),'Texte inchangé par défaut');
  ok(await page.locator('#toc a').count()===4,'Sommaire utilisable');
  await page.locator('#toc a').first().click();
  ok(await page.evaluate(()=>document.activeElement.id==='section-0'),'Sommaire : déplacement du focus');
  await page.locator('#simplify').check();
  ok(Number(await page.locator('#change-count').innerText())>0,'Simplification explicite, changements comptés');
  ok((await page.locator('#p-read').innerText()).includes('ne devez pas envoyer'),'Négation conservée');
  await page.locator('#t-compare').click();
  ok(await page.locator('.compare-row.changed').count()>0,'Comparaison : passages modifiés visibles');
  await page.locator('#t-compare').press('End');
  ok(await page.locator('#t-md').getAttribute('aria-selected')==='true','Onglets : clavier Fin');
  ok((await page.locator('#md').innerText()).includes('solliciter'),'Markdown conserve la source non simplifiée');
  await page.locator('#t-read').click();
  await page.locator('#theme').selectOption('sombre');
  await page.locator('#bigger').click();
  await page.reload();
  ok(await page.locator('#theme').inputValue()==='sombre' && (await page.locator('#size-label').innerText()).includes('110'),'Préférences restaurées');
  await page.getByRole('button',{name:'Essayer avec un exemple'}).click();
  await page.locator('#reset-prefs').click();
  if (await page.locator('#dismiss-message').isVisible()) await page.locator('#dismiss-message').click();
  if (config.screenshots) await page.screenshot({path:config.screenshots+'/lecture-desktop.png',fullPage:true});
  await page.locator('#focus-mode').click();
  ok(await page.locator('#exit-focus').isVisible() && !await page.locator('.masthead').isVisible(),'Mode concentration');
  await page.keyboard.press('Escape');
  ok(await page.locator('.masthead').isVisible(),'Échap restaure la lecture');
  const mdDownloadPromise = page.waitForEvent('download');
  await page.locator('#dl-md').click(); const mdDownload=await mdDownloadPromise;
  ok(mdDownload.suggestedFilename().endsWith('.md'),'Export Markdown téléchargeable');
  const htmlDownloadPromise = page.waitForEvent('download');
  await page.locator('#dl-html').click(); const htmlDownload=await htmlDownloadPromise;
  const stream=await htmlDownload.createReadStream(); let portable='';
  for await (const chunk of stream) portable+=chunk.toString();
  ok(portable.includes('Content-Security-Policy') && !portable.includes('<script'),'Lecture HTML autonome sans script');
  const offline=await page.context().newPage();
  await offline.route('**/*',route=>route.abort());
  await offline.setContent(portable);
  ok((await offline.locator('body').innerText()).includes('120 €'),'Lecture exportée lisible sans réseau');
  await offline.close();
  await page.setViewportSize({width:390,height:844});
  if (await page.locator('#dismiss-message').isVisible()) await page.locator('#dismiss-message').click();
  ok(!await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),'Mobile : aucun débordement horizontal');
  await audit('Lecteur mobile');
  if (config.screenshots) await page.screenshot({path:config.screenshots+'/lecture-mobile.png',fullPage:true});
  await page.setViewportSize({width:1280,height:900});
  await audit('Lecteur bureau');

  // Une requête ancienne ne doit jamais écraser une nouvelle lecture collée.
  await page.route('**/__fetch?**', async route=>{ await new Promise(r=>setTimeout(r,500)); await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({html:'<main><h1>Ancienne page</h1><p>Une ancienne page qui ne doit jamais remplacer le nouveau texte collé.</p></main>',url:'https://example.org/old'})}).catch(()=>{}); });
  await page.locator('#composer summary').click();
  await page.locator('#url').fill('https://example.org/old');
  await page.locator('#form').evaluate(f=>f.requestSubmit());
  await page.locator('#input-text').click();
  await page.locator('#paste').fill('Ma nouvelle lecture\n\nVous ne devez pas payer 50 € avant le 12 novembre.');
  await page.locator('#paste-go').click();
  await page.waitForTimeout(700);
  ok((await page.title()).startsWith('Ma nouvelle lecture'),'Concurrence : une ancienne URL ne remplace pas le collage');
  ok(!await page.locator('#share').isVisible() && !page.url().includes('#u='),'Collage : aucun ancien lien partagé');
  await page.unroute('**/__fetch?**');

  // Fichier hostile : aucun script ou appel externe issu du HTML.
  const requested=[]; const onRequest=r=>{if(r.url().includes('attacker.invalid'))requested.push(r.url());};page.on('request',onRequest);
  await page.locator('#composer summary').click();
  await page.locator('#file').setInputFiles({name:'document.html',mimeType:'text/html',buffer:Buffer.from('<html lang="fr"><title>Fichier de test</title><body onload="window.IRP_ATTACK=1"><main><h1>Document importé</h1><h2>Conditions</h2><p>Vous ne devez pas payer 50 € avant le 12 novembre.</p><script>window.IRP_ATTACK=1</script><img src="https://attacker.invalid/image" onerror="window.IRP_ATTACK=1"></main></body></html>')});
  await page.waitForFunction(()=>document.title.startsWith('Document importé'));
  await page.waitForTimeout(100);
  ok(!await page.evaluate(()=>window.IRP_ATTACK) && requested.length===0,'Import HTML : aucun script ni chargement distant');
  ok((await page.locator('#p-read').innerText()).includes('50 €'),'Import HTML : texte conservé');
  page.off('request',onRequest);

  const realPages=[];
  for (const url of ['https://docs.python.org/fr/3/tutorial/introduction.html','https://www.service-public.gouv.fr/particuliers/vosdroits/F21092','https://fr.wikipedia.org/wiki/Lecture','https://developer.mozilla.org/fr/docs/Web/JavaScript/Guide/Introduction']) {
    await page.goto(base+'/tool#u='+encodeURIComponent(url));
    await page.waitForFunction((url)=>document.querySelector('#cancel').hidden && !document.querySelector('#out').hidden && document.querySelector('#source-link').href===url, url,{timeout:35000});
    const info=await page.evaluate(()=>({title:document.querySelector('.irp-title').textContent,chars:document.querySelector('#p-read .irp-page').textContent.length,sections:document.querySelectorAll('#toc a').length,control:document.querySelector('#fidelity-text').textContent,notes:document.querySelector('#extraction-note').textContent}));
    ok(info.chars>1000 && info.sections>0,'Page réelle lisible : '+url); realPages.push({url,...info});
  }
  ok(errors.length===0,'Aucune exception JavaScript ('+errors.join(',')+')');
  return {checks:checks.length,passed:checks,realPages};
})
