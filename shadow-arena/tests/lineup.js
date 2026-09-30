// Renders the mummy and every enemy archetype / boss side by side (visual check).
// Usage: NODE_PATH=$(npm root -g) node tests/lineup.js out.png
const { openGame } = require('./harness');
const fs = require('fs');
(async () => {
  const { browser, page, errors } = await openGame();
  const data = await page.evaluate(() => {
    const g = SA.game;
    T.training('stand');
    const list = [['mummy', SA.createFighter('mummy', new SA.Controller(), { weapon: 'katana' })]];
    for (const id of Object.keys(SA.ARCHETYPES)) list.push([id, SA.EnemyGen.makeOpponent(id, 'hard', 5).fighter]);
    for (const id of (SA.Bosses.ORDER || [])) {
      const def = SA.Bosses.generate(10, 10, 'normal', SA.M.seeded(3), id);
      list.push([id, SA.EnemyGen.createFighter(def, new SA.Controller())]);
    }
    const cols = 6, cw = 330, ch = 440;
    const rows = Math.ceil(list.length / cols);
    const sheet = SA.makeCanvas(cols * cw, rows * ch);
    const sc = sheet.getContext('2d');
    const grd = sc.createLinearGradient(0, 0, 0, sheet.height);
    grd.addColorStop(0, '#3a2a1c'); grd.addColorStop(1, '#120c08');
    sc.fillStyle = grd; sc.fillRect(0, 0, sheet.width, sheet.height);
    list.forEach(([id, f], i) => {
      f.reset(0, 1);
      g.p1 = f; g.p2 = f;
      for (let k = 0; k < 40; k++) { f.animTime += 0.016; f.postUpdate(1, g); }
      const c = i % cols, r = Math.floor(i / cols);
      sc.save();
      sc.translate(c * cw + cw / 2, r * ch + ch - 40);
      SA.Render.drawShadow(sc, f, 0.5);
      SA.Render.drawFighter(sc, f, [{ color: 'rgba(255,170,90,0.85)', dx: 3, dy: -2 }, { color: 'rgba(90,200,230,0.5)', dx: -3, dy: -1 }]);
      sc.restore();
      sc.fillStyle = '#f0e0c0'; sc.font = 'bold 18px sans-serif'; sc.fillText(id, c * cw + 12, r * ch + 26);
    });
    return sheet.toDataURL('image/png');
  });
  fs.writeFileSync(process.argv[2] || 'lineup.png', Buffer.from(data.split(',')[1], 'base64'));
  console.log(errors.join('\n') || 'NO ERRORS');
  await browser.close();
})();
