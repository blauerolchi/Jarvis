// Screenshot every arena mid-fight (real render path). Usage: node tests/arenas.js outDir
const { openGame } = require('./harness');
(async () => {
  const out = process.argv[2] || '.';
  const { browser, page, errors } = await openGame();
  await page.setViewportSize({ width: 1280, height: 720 });
  for (const arena of ['temple', 'bamboo', 'neon', 'ruins']) {
    await page.evaluate((arena) => {
      const g = SA.game;
      g.scene = 'fight';
      g.setupWorld({ mode: 'fight', arena });
      g.transition = null; g.fade = 0;
      T.run(130);                       // intro
      T.place(-150, 90);
      T.run(8, { hold: ['right'] });
      T.run(1, { press: ['kick'] });
      T.run(9);
      g.render();
    }, arena);
    await page.screenshot({ path: `${out}/arena-${arena}.png` });
  }
  console.log(errors.join('\n') || 'NO ERRORS');
  await browser.close();
})();
