// Vérification reproductible du produit et de l'extension réelle, dans Chromium.
import { chromium } from 'playwright';
import { readFile, writeFile, mkdir, mkdtemp } from 'node:fs/promises';
import { spawn, execFileSync } from 'node:child_process';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInThisContext } from 'node:vm';
import { checkResponsive } from './responsive.browser.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const children = [];
const port = () => new Promise((resolve,reject) => { const s=createServer();s.on('error',reject);s.listen(0,'127.0.0.1',()=>{const n=s.address().port;s.close(()=>resolve(n));}); });
const start = async (args, check) => {
  const child=spawn('python3',args,{cwd:root,stdio:['ignore','ignore','pipe']});children.push(child);
  let log='';child.stderr.on('data',d=>{log+=d;});
  for (let n=0;n<80;n++) { if(child.exitCode!==null)throw new Error(log);try{const r=await fetch(check);if(r.ok)return;}catch{}await new Promise(r=>setTimeout(r,100)); }
  throw new Error('Serveur de test indisponible : '+log);
};
let browser, extension;
try {
  const appPort=await port(), axePort=await port(), staticPort=await port();
  const base=`http://127.0.0.1:${appPort}`, axe=`http://127.0.0.1:${axePort}`, staticBase=`http://127.0.0.1:${staticPort}`;
  await start(['irp-server/server.py','--host','127.0.0.1','--port',String(appPort),'--no-proxy'],base+'/tool');
  await start(['-m','http.server',String(axePort),'--bind','127.0.0.1','--directory','tests/node_modules/axe-core'],axe+'/axe.min.js');
  execFileSync('python3',['scripts/build_reader.py'],{cwd:root});
  execFileSync('python3',['scripts/build_site.py'],{cwd:root});
  await start(['-m','http.server',String(staticPort),'--bind','127.0.0.1','--directory','dist-site'],staticBase+'/');
  const screenshots=path.join(root,'docs','screenshots');await mkdir(screenshots,{recursive:true});
  browser=await chromium.launch({headless:true});
  const context=await browser.newContext({acceptDownloads:true});const page=await context.newPage();
  const source=await readFile(path.join(root,'tests','reader.browser.js'),'utf8');
  const run=runInThisContext(source,{filename:'reader.browser.js'});
  const result=await run(page,{base,axe,screenshots});

  // Sans backend, la lecture par collage doit rester fonctionnelle et la récupération échouer clairement.
  await page.goto(staticBase+'/tool.html');
  if(!await page.locator('#text-panel').isVisible())throw new Error('Version statique : collage par défaut absent');
  await page.locator('#input-url').click();
  if(!await page.locator('#url-unavailable').isVisible() || await page.locator('#form').isVisible())throw new Error('Version statique : ouverture URL indisponible non expliquée');
  await page.locator('#input-text').click();
  await page.locator('#paste').fill('Lecture sans serveur\n\nUn texte collé reste disponible sans service de récupération d’URL.');
  await page.locator('#paste-go').click();await page.waitForSelector('#out:not([hidden])');
  if(!(await page.title()).startsWith('Lecture sans serveur'))throw new Error('Version statique : collage défaillant');
  result.static={urlFailureExplained:true,pasteWorks:true};

  if(process.argv.includes('--responsive')) {
    const responsive=await checkResponsive({base:staticBase,axe,screenshots});
    await writeFile(path.join(root,'docs','responsive-results.json'),JSON.stringify(responsive,null,2)+'\n');
    result.responsive={engines:responsive.engines.map(e=>e.name),formats:responsive.formats.length,screens:responsive.engines.reduce((n,e)=>n+e.screens,0)};
  }

  // Extension MV3 réellement chargée dans un profil de test séparé.
  const extPath=path.join(root,'dist','irp-reader');
  extension=await chromium.launchPersistentContext(await mkdtemp(path.join(tmpdir(),'irp-extension-')),{channel:'chromium',headless:true,args:['--enable-unsafe-extension-debugging','--disable-extensions-except='+extPath,'--load-extension='+extPath]});
  const worker=extension.serviceWorkers()[0]||await extension.waitForEvent('serviceworker',{timeout:15000});
  const target=await extension.newPage();await target.goto(base+'/tool');
  await target.setContent('<html lang="fr"><head><title>Lecture de test</title></head><body><main><h1>Une lecture dans l’extension</h1><h2>Votre demande</h2><p>Vous pouvez solliciter une aide de 120 €. Vous ne devez pas envoyer les documents originaux. La date reste le 12 novembre 2026.</p><p>Ce document vérifie que le lecteur conserve un texte disponible dans la page, permet de simplifier son vocabulaire et peut ensuite revenir à sa version extraite sans reformulation.</p></main></body></html>');
  const cdp=await extension.newCDPSession(target);
  const browserCdp=await extension.browser().newBrowserCDPSession();
  const {targetInfos}=await browserCdp.send('Target.getTargets',{filter:[{type:'tab',exclude:false}]});
  const targetInfo=targetInfos.find(t=>t.url===target.url());
  // Action réelle : activeTab est accordé par Chrome, sans ajouter de permission d'hôte au paquet.
  // https://chromedevtools.github.io/devtools-protocol/tot/Extensions/#method-triggerAction
  await browserCdp.send('Extensions.triggerAction',{id:new URL(worker.url()).host,targetId:targetInfo.targetId});
  await target.bringToFront();
  const tabId=await worker.evaluate(async()=>{const tabs=await chrome.tabs.query({active:true});return tabs[0].id;});
  await worker.evaluate(async(id)=>openReader(id,'standard'),tabId);
  await target.waitForSelector('#irp-reader-host',{state:'attached'});
  const tree=await cdp.send('Accessibility.getFullAXTree');
  const names=tree.nodes.filter(n=>!n.ignored&&n.name?.value).map(n=>n.name.value);
  if(!names.includes('Mode lecture adapté'))throw new Error('Extension : dialogue absent');
  if(!names.includes('Télécharger une copie de lecture hors ligne'))throw new Error('Extension : export absent');
  const press = async (name) => {
    const ax=await cdp.send('Accessibility.getFullAXTree');const button=ax.nodes.find(n=>!n.ignored&&n.role?.value==='button'&&n.name?.value===name);
    if(!button?.backendDOMNodeId)throw new Error('Commande introuvable : '+name);
    const {object}=await cdp.send('DOM.resolveNode',{backendNodeId:button.backendDOMNodeId});
    await cdp.send('Runtime.callFunctionOn',{objectId:object.objectId,functionDeclaration:'function(){this.click();}',userGesture:true});
  };
  const waitText = async (text) => {
    for(let n=0;n<40;n++){const ax=await cdp.send('Accessibility.getFullAXTree');if(ax.nodes.some(n=>!n.ignored&&n.name?.value.includes(text)))return;await target.waitForTimeout(50);}
    throw new Error('Texte absent de l’extension : '+text);
  };
  await press('Simplifier le texte');await waitText('demander une aide');
  await press('Afficher le texte extrait sans reformulation');await waitText('solliciter une aide');
  const extensionDownload=target.waitForEvent('download');await press('Télécharger une copie de lecture hors ligne');
  const download=await extensionDownload;const exportStream=await download.createReadStream();let saved='';for await(const chunk of exportStream)saved+=chunk.toString();
  if(!saved.includes('solliciter une aide')||saved.includes('<script'))throw new Error('Extension : copie HTML incorrecte');
  const bodyInert=await target.locator('body > main').evaluate(e=>e.inert);
  if(!bodyInert)throw new Error('Extension : arrière-plan actif');
  await target.keyboard.press('Escape');await target.waitForSelector('#irp-reader-host',{state:'detached'});
  if(await target.locator('body > main').evaluate(e=>e.inert))throw new Error('Extension : arrière-plan non restauré');
  result.extension={version:'1.3.0',loaded:true,readerOpened:true,simplificationWorks:true,originalRestored:true,htmlDownloaded:true,backgroundInert:true,escapeRestores:true};
  result.date=new Date().toISOString();result.browser=browser.version();
  await writeFile(path.join(root,'docs','validation-results.json'),JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify(result,null,2));
} finally {
  await extension?.close();await browser?.close();
  for(const child of children)child.kill('SIGTERM');
}
