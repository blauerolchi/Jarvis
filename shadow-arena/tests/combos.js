// The six movement combos of the design (MUMMY RUSH, DESERT CYCLONE, TOMB BREAKER, PHARAOH'S WRATH,
// SCARAB FLOW, SANDS OF DEATH) played with real inputs against the training dummy. Nothing is
// scripted in the game: they must come out of the cancel windows, movement cancels and air game.
// Usage: NODE_PATH=$(npm root -g) node tests/combos.js
const { openGame } = require('./harness');

(async () => {
  const { browser, page, errors } = await openGame();
  const res = await page.evaluate(() => {
    const g = SA.game;
    const d = () => Math.abs(g.p1.x - g.p2.x);
    // step: { press, hold, until(f), max, n }
    const play = (x1, x2, steps) => {
      T.training('stand'); T.place(x1, x2); T.run(5);
      const f = g.p1;
      let best = { hits: 0, name: null };
      for (const st of steps) {
        const max = st.until ? st.max || 60 : st.n || 1;
        for (let i = 0; i < max; i++) {
          if (st.until && st.until(f)) break;
          T.run(1, { hold: st.hold || [], press: i === 0 ? st.press || [] : [] });
          if (f.combo.hits > best.hits || (f.combo.name && f.combo.hits >= best.hits)) best = { hits: f.combo.hits, name: f.combo.name };
        }
      }
      for (let i = 0; i < 40; i++) { T.run(1); if (f.combo.hits > best.hits || (f.combo.name && f.combo.hits >= best.hits)) best = { hits: f.combo.hits, name: f.combo.name }; }
      return best;
    };
    const hit = (f) => f.moveContact === 'hit' && g.hitstop === 0;
    const out = {};
    // Light, Light, Dash, Heavy
    out.mummyRush = play(-230, 0, [
      { press: ['light'] }, { until: hit, max: 20 },
      { press: ['light'] }, { until: (f) => f.move && f.move.id === 'jab2' && hit(f), max: 20 },
      { press: ['dash'], hold: ['right'] }, { n: 3, hold: ['right'] },
      { press: ['heavy'], hold: ['right'] }, { n: 30 },
    ]);
    // Kick, Kick, (jump) forward, Air Kick
    out.desertCyclone = play(-250, 0, [
      { press: ['kick'] }, { until: hit, max: 25 },
      { press: ['kick'] }, { until: (f) => f.move && f.move.id === 'spinKick' && hit(f), max: 30 },
      { press: ['up'], hold: ['right'] }, { until: (f) => f.state === 'air', max: 12, hold: ['right'] },
      { n: 4, hold: ['right'] }, { press: ['kick'], hold: ['right'] }, { n: 40, hold: ['right'] },
    ]);
    // Low, Uppercut, Jump, Air Heavy
    out.tombBreaker = play(-230, 0, [
      { press: ['kick'], hold: ['down'] }, { until: hit, max: 25, hold: ['down'] },
      { press: ['light'] }, { until: (f) => f.move && f.move.id === 'uppercut' && hit(f), max: 30 },
      { press: ['up'] }, { until: (f) => f.state === 'air', max: 12 },
      { n: 6, hold: ['right'] }, { press: ['heavy'], hold: ['right'] }, { n: 40 },
    ]);
    // Dash attack, Light, Heavy (+ special)
    out.pharaohsWrath = play(-480, 0, [
      { press: ['dash'], hold: ['right'] }, { n: 3, hold: ['right'] },
      { press: ['light'], hold: ['right'] }, { until: hit, max: 25 },
      { press: ['light'] }, { until: (f) => f.move && f.move.id === 'jab' && hit(f), max: 25 },
      { press: ['heavy'] }, { n: 40 },
    ]);
    // Roll, Roll attack, Dash, Kick
    out.scarabFlow = play(-470, 0, [
      { press: ['dash'], hold: ['down'] }, { n: 12, hold: ['down'] },
      { press: ['light'] }, { until: hit, max: 25 },
      { press: ['dash'], hold: ['right'] }, { n: 3, hold: ['right'] },
      { press: ['kick'], hold: ['right'] }, { n: 30 },
    ]);
    // Slide attack, Jump, Air slash
    out.sandsOfDeath = play(-900, 0, [
      { until: () => d() < 480, max: 80, hold: ['right'] },
      { n: 3, hold: ['right', 'down'] },
      { until: () => d() < 260, max: 20, hold: ['right', 'down'] },
      { press: ['light'] }, { until: hit, max: 25 },
      { press: ['up'], hold: ['right'] }, { until: (f) => f.state === 'air', max: 12, hold: ['right'] },
      { n: 2, hold: ['right'] }, { press: ['light'], hold: ['right'] }, { n: 40 },
    ]);
    return out;
  });
  const want = { mummyRush: 'MUMMY RUSH', desertCyclone: 'DESERT CYCLONE', tombBreaker: 'TOMB BREAKER', pharaohsWrath: 'PHARAOH’S WRATH', scarabFlow: 'SCARAB FLOW', sandsOfDeath: 'SANDS OF DEATH' };
  let ok = 0;
  for (const k of Object.keys(want)) {
    const pass = res[k].name === want[k];
    if (pass) ok++;
    console.log((pass ? 'PASS ' : 'FAIL ') + want[k] + '  ' + JSON.stringify(res[k]));
  }
  console.log(`\n${ok}/6 passed`);
  console.log(errors.length ? 'ERRORS:\n' + errors.slice(0, 8).join('\n') : 'NO PAGE ERRORS');
  await browser.close();
  process.exit(ok === 6 && !errors.length ? 0 : 1);
})();
