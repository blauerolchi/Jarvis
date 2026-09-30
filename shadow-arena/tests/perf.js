// Measures average render + tick cost per arena and graphics preset (HIGH / MEDIUM / LOW),
// plus a projectile-heavy stress case. Usage: NODE_PATH=$(npm root -g) node tests/perf.js
const { openGame } = require('./harness');
(async () => {
  const { browser, page, errors } = await openGame();
  await page.setViewportSize({ width: 1280, height: 720 });
  const r = await page.evaluate(() => {
    const g = SA.game, out = {};
    const measure = (frames, each) => {
      let tr = 0, tt = 0;
      for (let i = 0; i < frames; i++) {
        let t0 = performance.now();
        T.run(1, { press: i % 10 === 0 ? ['light'] : [] });
        if (each) each(i);
        tt += performance.now() - t0;
        t0 = performance.now();
        g.render();
        g.ctx.getImageData(0, 0, 1, 1); // flush
        tr += performance.now() - t0;
      }
      return { renderMs: +(tr / frames).toFixed(1), tickMs: +(tt / frames).toFixed(2) };
    };
    for (const preset of ['high', 'medium', 'low']) {
      SA.Save.data.settings.graphics = preset;
      g.applySettings(true);
      const row = { canvas: g.canvas.width + 'x' + g.canvas.height };
      for (const arena of SA.ARENA_ORDER) {
        g.scene = 'fight';
        g.setupWorld({ mode: 'fight', arena });
        g.transition = null; g.fade = 0;
        T.run(130); T.place(-120, 120);
        row[arena] = measure(40).renderMs;
      }
      out[preset] = row;
    }
    // stress: a boss fight with many projectiles and particles
    SA.Save.data.settings.graphics = 'medium';
    g.applySettings(true);
    const def = SA.Bosses.generate(20, 20, 'normal', SA.M.seeded(3), 'hunter');
    g.scene = 'fight';
    g.arenaRun = { stage: 20, wins: 0, streak: 0, coins: 0, xp: 0, bosses: 0, screen: null, energy: 0, enemy: def };
    g.setupWorld({ mode: 'arena', arena: def.arena, enemy: def });
    g.transition = null; g.fade = 0;
    T.run(140);
    out.stress = measure(90, (i) => {
      if (i % 3 === 0) g.projectiles.fire(g.p2, SA.RANGED[i % 2 ? 'shotgun' : 'shuriken'], g);
      g.p1.hp = Math.max(g.p1.hp, 200);
    });
    out.stress.projectiles = g.projectiles.get().length;
    out.stress.particles = g.particles.count !== undefined ? g.particles.count : null;
    g.arenaRun = null;
    SA.Save.data.settings.graphics = 'auto';
    g.applySettings(true);
    return out;
  });
  console.log(JSON.stringify(r, null, 1));
  console.log(errors.join('\n') || 'NO ERRORS');
  await browser.close();
})();
