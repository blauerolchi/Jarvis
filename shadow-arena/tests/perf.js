// Measures average render + tick cost per arena. Usage: node tests/perf.js
const { openGame } = require('./harness');
(async () => {
  const { browser, page, errors } = await openGame();
  await page.setViewportSize({ width: 1280, height: 720 });
  if (process.argv[2]) await page.evaluate((q) => { window.QUALITY = +q; }, process.argv[2]);
  const r = await page.evaluate(() => {
    const g = SA.game, out = {};
    if (window.QUALITY) g.setRenderScale(window.QUALITY);
    for (const arena of ['temple', 'bamboo', 'neon', 'ruins']) {
      g.scene = 'fight';
      g.setupWorld({ mode: 'fight', arena });
      T.run(130); T.place(-120, 120);
      let tr = 0, tt = 0;
      const parts = {};
      for (let i = 0; i < 60; i++) {
        let t0 = performance.now();
        T.run(1, { press: i % 10 === 0 ? ['light'] : [] });
        tt += performance.now() - t0;
        t0 = performance.now();
        g.render();
        g.ctx.getImageData(0, 0, 1, 1); // flush
        tr += performance.now() - t0;
      }
      // break down render passes
      const ctx = g.ctx, cam = g.camera, a = g.arena;
      const time = (fn) => { const t0 = performance.now(); for (let i = 0; i < 20; i++) fn(); ctx.getImageData(0, 0, 1, 1); return +((performance.now() - t0) / 20).toFixed(2); };
      parts.back = time(() => a.drawBack(ctx, cam));
      parts.layers = time(() => { for (const L of a.layers) a.drawLayer(ctx, L, cam); });
      parts.lights = time(() => a.drawLiveLights(ctx, cam));
      parts.ground = time(() => { cam.apply(ctx); a.drawGround(ctx, cam); });
      parts.fighters = time(() => { cam.apply(ctx); SA.Render.drawFighter(ctx, g.p1, a.rims); SA.Render.drawFighter(ctx, g.p2, a.rims); });
      parts.front = time(() => { ctx.setTransform(1, 0, 0, 1, 0, 0); a.drawFront(ctx, cam); });
      parts.hud = time(() => { ctx.setTransform(1, 0, 0, 1, 0, 0); g.ui.drawHUD(ctx); });
      out[arena] = { renderMs: +(tr / 60).toFixed(2), tickMs: +(tt / 60).toFixed(3), parts };
    }
    return out;
  });
  console.log(JSON.stringify(r, null, 1));
  console.log(errors.join('\n') || 'NO ERRORS');
  await browser.close();
})();
