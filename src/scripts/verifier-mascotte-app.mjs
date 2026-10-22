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
  const fixed=page.locator('[data-comparaison="fixe"] img');
  const motion=page.locator('[data-comparaison="animee"] img');
  await page.waitForFunction(()=>document.querySelector('[data-comparaison="animee"] img')?.getAnimations().length===1);
  assert.equal(await fixed.evaluate(img=>img.getAnimations().length),0);
  assert.ok(await motion.evaluate(img=>img.naturalWidth>0));
  const before=await motion.evaluate(img=>getComputedStyle(img).transform);
  await page.waitForTimeout(600);
  assert.notEqual(await motion.evaluate(img=>getComputedStyle(img).transform),before);
  await page.getByRole('checkbox',{name:'Activer les animations'}).uncheck();
  assert.equal(await motion.evaluate(img=>img.getAnimations().length),0);
  await page.getByRole('checkbox',{name:'Activer les animations'}).check();
  await page.getByRole('button',{name:'Repos',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('[data-comparaison="animee"] img')?.dataset.motion==='actif');
  assert.equal(await motion.getAttribute('data-mouvement'),'repos');
  await page.screenshot({path:'apercus/mascotte-app.png',fullPage:true});
  // Vérifier le déplacement du dessin aux tailles de l'app, pas seulement une matrice différente.
  for (const size of ['discrete','normale','forte']) {
    await page.getByLabel('Taille de la mascotte').selectOption(size);
    for (const scene of ['Prêt','Repos','Bien joué']) {
      await page.getByRole('button',{name:scene,exact:true}).click();
      await page.getByRole('button',{name:'Rejouer',exact:true}).click();
      await page.waitForFunction(()=>document.querySelector('[data-comparaison="animee"] img')?.getAnimations().length===1);
      const displacement=await motion.evaluate(async img=>{
        const a=img.getAnimations()[0];a.pause();await a.ready;
        const duration=Number(a.effect.getTiming().duration);
        const height=img.offsetHeight;
        const points=[];
        for(let i=0;i<=16;i++){
          a.currentTime=duration*i/16;
          const m=new DOMMatrix(getComputedStyle(img).transform);
          const p=new DOMPoint(0,-height*.7).matrixTransform(m);
          points.push(Math.hypot(p.x,p.y+height*.7));
        }
        a.currentTime=0;a.play();
        return Math.max(...points);
      });
      assert.ok(displacement>1.6,`${scene}/${size}: ${displacement}px`);
    }
  }
  await page.getByRole('button',{name:'Bien joué',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('[data-comparaison="animee"] img')?.dataset.motion==='termine');
  await page.getByRole('button',{name:'Rejouer',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('[data-comparaison="animee"] img')?.dataset.motion==='actif');
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.waitForFunction(()=>document.querySelector('[data-comparaison="animee"] img')?.dataset.motion==='reduit');
  assert.equal(await motion.evaluate(img=>img.getAnimations().length),0);
  assert.ok(await page.getByRole('status').filter({hasText:'Ton appareil'}).isVisible());
  for(const width of [320,390,1280]) {
    await page.setViewportSize({width,height:900});
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  }
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({engine:engine.name(),url:base+'/mascotte',status:response.status(),checks:['hydration','assets','mouvement visible à 40/72/120 px','comparatif fixe','désactivation','repos','encouragement unique','rejouer','mouvement réduit','320/390/1280 px','aucune erreur JS']}));
} finally {
  await browser.close();
}
