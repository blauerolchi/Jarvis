// Contact sheet of the acrobatic moves driven by real inputs: one row per move, one cell every
// few frames (the figure is drawn where it really is, relative to the row's start).
// Usage: NODE_PATH=$(npm root -g) node tests/acrosheet.js out.png
const { openGame } = require('./harness');
const fs = require('fs');
(async () => {
  const { browser, page, errors } = await openGame();
  const data = await page.evaluate(() => {
    const g = SA.game;
    const rows = [
      ['FRONT FLIP (run + up)', [[14, ['right']], [1, ['right'], ['up']]], 3, 12],
      ['BACKFLIP (back + up)', [[1, ['left'], ['up']]], 3, 12],
      ['HANDSPRING (back + dash)', [[1, ['left'], ['dash']]], 2, 12],
      ['COMBAT ROLL (down + dash)', [[1, ['down'], ['dash']]], 2, 12],
      ['SLIDE -> SLIDE ATTACK', [[14, ['right']], [4, ['right', 'down']], [1, ['right', 'down'], ['light']]], 3, 12],
      ['JUMP -> AIR DASH -> SLASH', [[1, [], ['up']], [8, []], [1, ['right'], ['dash']], [3, []], [1, [], ['light']]], 3, 12],
      ['FLIP -> SPIN SLASH', [[14, ['right']], [1, ['right'], ['up']], [9, []], [1, [], ['heavy']]], 3, 12],
      ['JUMP -> DIVE KICK', [[1, ['right'], ['up']], [10, []], [1, ['down'], ['kick']]], 2, 12],
    ];
    const cols = 12, cw = 170, ch = 250, head = 30;
    const sheet = SA.makeCanvas(cols * cw, rows.length * (ch + head));
    const sc = sheet.getContext('2d');
    sc.fillStyle = '#1a130c'; sc.fillRect(0, 0, sheet.width, sheet.height);
    rows.forEach(([label, script, every, n], r) => {
      T.training('stand'); T.place(-600, 1000); T.run(3);
      const f = g.p1;
      const x0 = f.x;
      const snaps = [];
      let frame = 0;
      const snap = () => {
        if (frame % every === 0 && snaps.length < n) {
          const c = sc, y0 = r * (ch + head) + head + ch - 30, cx = (snaps.length + 0.5) * cw;
          c.save();
          c.beginPath(); c.rect(snaps.length * cw, r * (ch + head) + head, cw, ch); c.clip();
          c.strokeStyle = 'rgba(255,255,255,0.08)'; c.beginPath(); c.moveTo(snaps.length * cw, y0); c.lineTo((snaps.length + 1) * cw, y0); c.stroke();
          c.translate(cx - f.x * 0.5, y0);
          c.scale(0.5, 0.5);
          SA.Render.drawFighter(c, f, [{ color: 'rgba(255,170,90,0.8)', dx: 3, dy: -2 }]);
          c.restore();
          c.fillStyle = '#e0c89a'; c.font = '12px monospace';
          c.fillText(f.state + (f.move ? ':' + f.move.id.split(':').pop() : ''), snaps.length * cw + 4, r * (ch + head) + head + 14);
          snaps.push(1);
        }
        frame++;
      };
      void x0;
      for (const [cnt, hold, press] of script) for (let i = 0; i < cnt; i++) { T.run(1, { hold, press: i === 0 ? press : [] }); if (cnt < 5) snap(); }
      for (let i = 0; i < 60 && snaps.length < n; i++) { T.run(1); snap(); }
      sc.fillStyle = '#f0e0c0'; sc.font = 'bold 18px sans-serif'; sc.fillText(label, 8, r * (ch + head) + 22);
    });
    return sheet.toDataURL('image/png');
  });
  fs.writeFileSync(process.argv[2] || 'acro.png', Buffer.from(data.split(',')[1], 'base64'));
  console.log(errors.join('\n') || 'NO ERRORS');
  await browser.close();
})();
