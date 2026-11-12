// Vérification après publication, sur le site public réellement servi.
import {chromium,firefox,webkit} from 'playwright';
import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import{fileURLToPath}from'node:url';
import{createHash}from'node:crypto';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const base='https://irp-lecture.netlify.app';
const result={url:base,date:new Date().toISOString(),assets:[],engines:[]};
for(const file of ['tool.js','tool.css','core/index.js','core/render.js','fonts/manrope-400.woff2','fonts/newsreader-normal.woff2']){
 const response=await fetch(base+'/'+file);const data=Buffer.from(await response.arrayBuffer());const local=await readFile(path.join(root,'dist-site',file));
 const same=createHash('sha256').update(data).digest('hex')===createHash('sha256').update(local).digest('hex');
 if(!response.ok||!same)throw new Error('Version publiée incorrecte : '+file);
 result.assets.push({file,status:response.status,exactMatch:same});
}
const axe=await readFile(path.join(root,'tests/node_modules/axe-core/axe.min.js'),'utf8');
for(const[name,type]of[['chromium',chromium],['firefox',firefox],['webkit',webkit]]){
 const browser=await type.launch({headless:true});
 try{
  const context=await browser.newContext({locale:'fr-FR',acceptDownloads:true});const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  for(const width of [390,1440]){
   await page.setViewportSize({width,height:900});const response=await page.goto(base+'/');if(![200,304].includes(response.status()))throw new Error('Accueil non disponible : '+JSON.stringify({name,width,status:response.status(),url:response.url(),body:(await page.locator('body').innerText()).slice(0,300)}));
   await page.evaluate(()=>document.fonts.ready.then(()=>true));
   if(!await page.locator('#text-panel').isVisible())throw new Error('Le collage doit être proposé par défaut en production');
   if(name==='chromium')await page.screenshot({path:path.join(root,'docs/screenshots',width===1440?'public-desktop.png':'public-mobile.png'),fullPage:true});
   await page.locator('#demo').click();await page.waitForSelector('#out:not([hidden])');
   if(width===390)await page.locator('#reading-options > summary').click();
   await page.locator('#simplify').check();await page.locator('#t-compare').click();
   if(await page.locator('.compare-row.changed').count()===0)throw new Error('Comparaison défaillante');
   await page.locator('#t-read').click();
   const promise=page.waitForEvent('download');await page.locator('#dl-html').click();const download=await promise;
   const stream=await download.createReadStream();let html='';for await(const chunk of stream)html+=chunk.toString();
   if(!html.includes('120 €')||html.includes('<script'))throw new Error('Export HTML défaillant');
   const layout=await page.evaluate(()=>({viewport:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth,fonts:document.fonts.check('16px Manrope')}));
   if(layout.scroll>width+1||!layout.fonts)throw new Error(JSON.stringify(layout));
   if(name==='chromium'){await page.evaluate(axe);const violations=await page.evaluate(async()=>(await axe.run(document)).violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)})));if(violations.length)throw new Error('axe public : '+JSON.stringify(violations));}
   result.engines.push({name,width,reading:true,comparison:true,htmlExport:true,...layout});
  }
  for(const route of ['/tool','/privacy','/local']){const response=await page.goto(base+route);if(![200,304].includes(response.status()))throw new Error('Route inaccessible : '+route);}
  if(errors.length)throw new Error(name+': '+errors.join('\n'));
 }finally{await browser.close();}
}
await writeFile(path.join(root,'docs/production-results.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
