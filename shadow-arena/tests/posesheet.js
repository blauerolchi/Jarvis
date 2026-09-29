// Renders a contact sheet of every move at several frames. Usage: node tests/posesheet.js out.png
const { openGame } = require('./harness');
const fs = require('fs');
(async () => {
  const { browser, page, errors } = await openGame();
  const data = await page.evaluate(() => {
    const g = SA.game;
    const moves = ['jab', 'jab2', 'heavy', 'finisher', 'kick', 'spinKick', 'lowKick', 'crouchJab', 'uppercut', 'dashPunch', 'slideKick', 'airPunch', 'flyingKick'];
    const extra = ['idle', 'walk', 'crouch', 'block', 'hitHigh', 'hitBody', 'launched', 'down', 'getup', 'victory', 'defeat', 'stagger', 'evade'];
    const cols = 6, cw = 300, ch = 330;
    const sheet = SA.makeCanvas(cols * cw, (moves.length + 3) * ch);
    const sc = sheet.getContext('2d');
    sc.fillStyle = '#d9c9b8'; sc.fillRect(0, 0, sheet.width, sheet.height);
    T.training('stand');
    const f = g.p1;
    const drawCell = (r, c, label) => {
      const tmp = SA.makeCanvas(cw, ch); const t = tmp.getContext('2d');
      t.translate(cw / 2 - f.x, ch - 20);
      t.strokeStyle = '#8a7a6a'; t.beginPath(); t.moveTo(f.x - 200, 0); t.lineTo(f.x + 200, 0); t.stroke();
      SA.Render.drawFighter(t, f, [{ color: 'rgba(255,140,60,0.9)', dx: 3, dy: -2 }]);
      const h = f.activeHit();
      if (h) { t.strokeStyle = 'red'; t.lineWidth = 2; t.strokeRect(h.rect.x, h.rect.y, h.rect.w, h.rect.h); }
      sc.drawImage(tmp, c * cw, r * ch);
      sc.fillStyle = '#222'; sc.font = '16px monospace'; sc.fillText(label, c * cw + 6, r * ch + 18);
    };
    moves.forEach((id, r) => {
      const m = SA.MOVES[id];
      const frames = [0, Math.max(1, m.startup - 3), m.startup, m.startup + m.active - 1, m.startup + m.active + Math.floor(m.recovery / 2), m.total - 1];
      frames.forEach((fr, c) => {
        f.reset(0, 1); f.y = m.air ? -200 : 0; f.grounded = !m.air; if (m.air) f.state = 'air';
        g.p2.reset(900, -1);
        for (let i = 0; i < 12; i++) f.postUpdate(1, g);
        f.startMove(id);
        f.animKeys = m.keys;
        for (let i = 0; i < fr; i++) { f.mt += 1; SA.Anim.update(f, 1); }
        f.mt = fr; SA.Anim.update(f, 0.0001); SA.Anim.toWorld(f); f.updateHurtboxes();
        SA.Render.updateAccessories(f, 1 / 60, g.arena);
        drawCell(r, c, `${id} f${fr}`);
      });
    });
    extra.forEach((st, i) => {
      const r = moves.length + Math.floor(i / cols), c = i % cols;
      f.reset(0, 1); f.cancelMove();
      let state = st;
      if (st.startsWith('hit')) { state = 'hitstun'; f.hitPose = st; f.stun = 12; }
      f.state = state; f.st = st === 'getup' ? 12 : 30; f.walkDir = 1;
      if (st === 'launched') { f.grounded = false; f.y = -150; f.airTime = 0.2; }
      for (let k = 0; k < 40; k++) { if (st === 'getup') f.st = 12; SA.Anim.update(f, 1); }
      SA.Anim.toWorld(f); f.updateHurtboxes();
      for (let k = 0; k < 30; k++) SA.Render.updateAccessories(f, 1 / 60, g.arena);
      drawCell(r, c, st);
    });
    const half = (y0, y1) => {
      const c = SA.makeCanvas(sheet.width * 0.6, (y1 - y0) * 0.6);
      c.getContext('2d').drawImage(sheet, 0, y0, sheet.width, y1 - y0, 0, 0, c.width, c.height);
      return c.toDataURL('image/png');
    };
    const mid = 8 * ch;
    return [half(0, mid), half(mid, sheet.height)];
  });
  const base = process.argv[2] || 'poses';
  data.forEach((d, i) => fs.writeFileSync(`${base}_${i}.png`, Buffer.from(d.split(',')[1], 'base64')));
  console.log(errors.join('\n') || 'NO ERRORS');
  await browser.close();
})();
