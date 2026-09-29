// Win-rate matrix between difficulties (same character profile both sides). Usage: node tests/aibalance.js [n]
const { openGame } = require('./harness');
(async () => {
  const n = +(process.argv[2] || 6);
  const { browser, page, errors } = await openGame();
  const res = await page.evaluate((n) => {
    const g = SA.game;
    const play = (d1, d2, arena) => {
      g.scene = 'fight';
      g.setupWorld({ mode: 'fight', arena, difficulty: d2 });
      g.p1.ctrl = new SA.Controller();
      const ai1 = new SA.EnemyAI(g.p1, g.p2, g, { difficulty: d1, profile: SA.CHARACTERS[SA.ARENAS[arena].opponent].ai });
      let t = 0;
      while (g.match.phase !== 'matchEnd' && t < 60 * 60 * 5) { ai1.update(g.timeScale); g.updateWorld(); t++; }
      return g.match.wins[0] > g.match.wins[1] ? 1 : 0;
    };
    const out = {};
    for (const [d1, d2] of [['hard', 'easy'], ['hard', 'normal'], ['normal', 'easy']]) {
      let w = 0;
      for (let i = 0; i < n; i++) w += play(d1, d2, SA.ARENA_ORDER[i % 4]);
      out[`${d1} vs ${d2}`] = `${w}/${n}`;
    }
    return out;
  }, n);
  console.log(JSON.stringify(res));
  console.log(errors.join('\n') || 'NO ERRORS');
  await browser.close();
})();
