// Screenshots of key moments/screens. Usage: node tests/screens.js outDir
const { openGame } = require('./harness');
(async () => {
  const out = process.argv[2] || '.';
  const { browser, page, errors } = await openGame();
  await page.setViewportSize({ width: 1280, height: 720 });
  const shot = (n) => page.screenshot({ path: `${out}/${n}.png` });
  const ev = (fn, arg) => page.evaluate(fn, arg);

  // special move mid-rush
  await ev(() => {
    const g = SA.game; g.scene = 'fight'; g.setupWorld({ mode: 'fight', arena: 'nile_night' });
    T.run(130); T.place(-250, 150); g.p1.energy = 100;
    T.run(1, { press: ['special'] }); T.run(34); g.render();
  });
  await shot('s1-special');
  // KO moment
  await ev(() => {
    const g = SA.game; g.scene = 'fight'; g.setupWorld({ mode: 'fight', arena: 'scarab_catacombs' });
    T.run(130); T.place(-100, 90); g.p2.hp = 60;
    T.run(1, { press: ['light'] }); T.run(4); T.run(1, { press: ['light'] }); T.run(8); T.run(1, { press: ['heavy'] }); T.run(40); g.render();
  });
  await shot('s2-ko');
  // results with unlock
  await ev(() => {
    const g = SA.game;
    g.match.wins = [1, 0];
    g.p2.hp = 0; T.run(520); g.render();
  });
  await shot('s3-results');
  // training pause menu
  await ev(() => {
    const g = SA.game; g.scene = 'fight'; g.setupWorld({ mode: 'training', arena: 'lost_pyramid' });
    g.debug.hitboxes = true; T.run(20); T.run(1, { press: ['pause'] }); T.run(5); g.render();
  });
  await shot('s4-training-pause');
  await ev(() => {
    const g = SA.game; g.debug.hitboxes = false; g.paused = false; g.scene = 'menu'; g.setupWorld({ mode: 'demo', arena: 'desert_temple' });
    g.ui.go('settings'); T.run(30); g.render();
  });
  await shot('s5-settings');
  await ev(() => { const g = SA.game; g.ui.go('controls'); T.run(10); g.render(); });
  await shot('s6-controls');
  await ev(() => { const g = SA.game; g.ui.go('stats'); T.run(10); g.render(); });
  await shot('s7-stats');
  console.log(errors.join('\n') || 'NO ERRORS');
  await browser.close();
})();
