// Simulates full best-of-3 matches AI vs AI (player slot driven by an AI too).
// Usage: NODE_PATH=$(npm root -g) node tests/aimatch.js
const { openGame } = require('./harness');
(async () => {
  const { browser, page, errors } = await openGame();
  const res = await page.evaluate(() => {
    const g = SA.game;
    const runMatch = (arena, d1, d2) => {
      g.scene = 'fight';
      SA.Save.data.difficulty = d2;
      g.setupWorld({ mode: 'fight', arena, difficulty: d2 });
      g.transition = null; g.fade = 0;
      // replace the keyboard controller with an AI-driven one
      g.p1.ctrl = new SA.Controller();
      const ai1 = new SA.EnemyAI(g.p1, g.p2, g, { difficulty: d1, profile: SA.CHARACTERS.ronin.ai });
      const states = {}, aiStates = {};
      let ticks = 0, stuck = 0, lastHp = '', hits = 0, blocks = 0, parries = 0, specials = 0, maxCombo = 0;
      const oh = g.onHit.bind(g), ob = g.onBlock.bind(g), op = g.onParry.bind(g), os = g.onSpecialStart.bind(g);
      g.onHit = function (a, b, dmg, m, hit, fl) { hits++; maxCombo = Math.max(maxCombo, a.combo.hits); return oh(a, b, dmg, m, hit, fl); };
      g.onBlock = function () { blocks++; return ob.apply(g, arguments); };
      g.onParry = function () { parries++; return op.apply(g, arguments); };
      g.onSpecialStart = function (f) { specials++; return os(f); };
      while (g.match.phase !== 'matchEnd' && ticks < 60 * 60 * 5) {
        ai1.update(g.timeScale);
        g.input.heldActions = new Set();
        // mimic Game.tick without the keyboard sync
        g.updateWorld();
        ticks++;
        states[g.p1.state] = (states[g.p1.state] || 0) + 1;
        aiStates[g.ai2.state] = (aiStates[g.ai2.state] || 0) + 1;
        for (const f of [g.p1, g.p2]) if (!isFinite(f.x) || !isFinite(f.y) || !isFinite(f.hp)) return { error: 'NaN', f: f.name };
        const hp = g.p1.hp + '/' + g.p2.hp;
        if (hp === lastHp && g.match.phase === 'fight') stuck++; else stuck = 0;
        lastHp = hp;
        if (stuck > 60 * 25) return { error: 'no damage for 25s', states: g.p1.state + '/' + g.p2.state, ai: g.ai2.debugText() };
      }
      g.onHit = oh; g.onBlock = ob; g.onParry = op; g.onSpecialStart = os;
      return { arena, d1, d2, wins: g.match.wins.join('-'), rounds: g.match.round, seconds: Math.round(ticks / 60), hits, blocks, parries, specials, maxCombo,
        topAi: Object.entries(aiStates).sort((a, b) => b[1] - a[1]).slice(0, 5).map((e) => e[0] + ':' + Math.round(e[1] / ticks * 100) + '%').join(' ') };
    };
    const out = [];
    out.push(runMatch('temple', 'normal', 'normal'));
    out.push(runMatch('bamboo', 'hard', 'easy'));
    out.push(runMatch('neon', 'easy', 'hard'));
    out.push(runMatch('ruins', 'hard', 'hard'));
    out.push(runMatch('temple', 'normal', 'hard'));
    return out;
  });
  for (const r of res) console.log(JSON.stringify(r));
  console.log(errors.join('\n') || 'NO ERRORS');
  await browser.close();
})();
