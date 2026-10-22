import { chromium, webkit } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
const base = process.argv[2] || 'http://localhost:3000';
const engine = process.env.MOTION_BROWSER === 'webkit' ? webkit : chromium;
const browser = await engine.launch({headless:true});
try {
  await mkdir('apercus', { recursive: true });
  const page = await browser.newPage({viewport:{width:390,height:900}});
  const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  if (process.argv[3]) {
    const access=JSON.parse(await readFile(process.argv[3],'utf8'));
    await page.goto(access.url,{waitUntil:'domcontentloaded'});
  }
  const response=await page.goto(base+'/mascotte',{waitUntil:'networkidle'});
  assert.equal(response.status(),200);
  await page.getByRole('heading',{name:'Ton coach prend vie.'}).waitFor();
  const fixed=page.locator('[data-comparaison="fixe"] .mascotte');
  const motion=page.locator('[data-comparaison="animee"] .mascotte');
  const replay=()=>page.getByRole('button',{name:'Rejouer',exact:true}).click();
  const state=s=>page.waitForFunction(s=>document.querySelector('[data-comparaison="animee"] .mascotte')?.dataset.motion===s,s);
  const pose=()=>motion.evaluate(svg=>({
    coude:svg.querySelector('[data-partie="coude"]').getAttribute('transform'),
    pouce:svg.querySelector('[data-partie="pouce"]').getAttribute('transform'),
    corps:svg.querySelector('[data-partie="rig"] > use').getAttribute('transform'),
    global:getComputedStyle(svg).transform,
  }));
  assert.equal(await motion.getAttribute('data-geste'),'pouce');
  assert.equal(await fixed.evaluate(img=>img.getAnimations().length),0);
  assert.ok(await fixed.evaluate(img=>img.naturalWidth>0));
  for (const [size,width] of [['discrete',40],['normale',72],['forte',120]]) {
    await page.getByLabel('Taille de la mascotte').selectOption(size);
    await replay();await state('actif');
    const debut=await pose();
    await page.waitForTimeout(1150);
    const fin=await pose();
    assert.notEqual(debut.coude,fin.coude,`bras immobile à ${width}px`);
    assert.notEqual(debut.pouce,fin.pouce,`pouce immobile à ${width}px`);
    assert.equal(fin.corps,null);assert.equal(fin.global,'none');
    assert.equal(Math.round((await motion.boundingBox()).width),width);
    await page.screenshot({path:`apercus/pouce-${engine.name()}-${width}.png`,fullPage:true});
    await state('termine');
    assert.equal(await motion.locator('[data-partie="rig"]').evaluate(e=>getComputedStyle(e).display),'none');
    assert.notEqual(await motion.locator('[data-partie="fixe"]').evaluate(e=>getComputedStyle(e).display),'none');
  }
  // Sortie de champ : le geste reprend là où il était, sans boucle cachée.
  await replay();await state('actif');
  await motion.evaluate(e=>e.style.transform='translateY(2000px)');
  await state('pause');const suspendu=await pose();
  await page.waitForTimeout(250);assert.equal((await pose()).coude,suspendu.coude);
  await motion.evaluate(e=>e.style.transform='');await state('actif');
  await page.waitForTimeout(350);assert.notEqual((await pose()).coude,suspendu.coude);
  // Onglet masqué : même pause, test du signal navigateur sans session utilisateur.
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));});
  await state('pause');const masque=await pose();
  await page.waitForTimeout(250);assert.equal((await pose()).coude,masque.coude);
  await page.evaluate(()=>{delete document.hidden;document.dispatchEvent(new Event('visibilitychange'));});
  await state('actif');
  await page.getByRole('checkbox',{name:'Activer les animations'}).uncheck();
  assert.equal(await motion.evaluate(e=>e.tagName),'IMG');
  assert.equal(await motion.evaluate(e=>e.getAnimations().length),0);
  await page.getByRole('checkbox',{name:'Activer les animations'}).check();await state('actif');
  await page.emulateMedia({reducedMotion:'reduce'});await state('reduit');
  assert.equal(await motion.locator('[data-partie="rig"]').evaluate(e=>getComputedStyle(e).display),'none');
  assert.ok(await page.getByRole('status').filter({hasText:'Ton appareil'}).isVisible());
  assert.ok(await page.getByRole('button',{name:'Rejouer',exact:true}).isDisabled());
  await page.emulateMedia({reducedMotion:'no-preference'});
  // Les respirations des autres états restent fonctionnelles.
  for(const scene of ['Prêt','Repos']) {
    await page.getByRole('button',{name:scene,exact:true}).click();await state('actif');
    const avant=await motion.evaluate(e=>getComputedStyle(e).transform);
    await page.waitForTimeout(350);
    assert.notEqual(await motion.evaluate(e=>getComputedStyle(e).transform),avant);
  }
  for(const width of [320,390,1280]) {
    await page.setViewportSize({width,height:900});
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  }
  // L'image manquante garde sa place et ne fait pas planter la surface.
  const failure=await browser.newPage();
  await failure.context().addCookies(await page.context().cookies());
  failure.on('pageerror',e=>errors.push(e.message));
  await failure.route('**/coach-encouragement-hero.webp',route=>route.abort());
  await failure.goto(base+'/mascotte');
  const fallback=failure.locator('[data-comparaison="animee"] .mascotte-repli');
  await fallback.waitFor();
  assert.equal(Math.round((await fallback.boundingBox()).width),120);
  await failure.close();
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({engine:engine.name(),url:base+'/mascotte',status:response.status(),checks:['bras et pouce articulés à 40/72/120 px','corps immobile','pose finale originale','pause hors écran et onglet masqué','désactivation','respirations','rejouer','mouvement réduit','320/390/1280 px','repli image manquante','aucune erreur JS']}));
} finally {
  await browser.close();
}
