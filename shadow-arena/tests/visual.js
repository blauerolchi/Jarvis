// Character quality sprint checks (Moon Guardian, CharacterRendererV2):
//  - idle test: 15 s without input -> the body lives (breathing, weight shift, head, hands, a
//    secondary idle) but never jitters
//  - run test: 10 s -> no foot sliding while a foot is planted, no body jitter, smooth cape
//  - transitions: run -> jump -> air attack -> double jump -> falling attack -> landing -> roll
//    without pose pops (per-step joint / rotation change)
//  - silhouette renders (flat black) of idle and a heavy attack -> tests/out/silhouette-*.png
// Usage: NODE_PATH=$(npm root -g) node tests/visual.js [outDir]
const { openGame } = require('./harness');
const path = require('path');
const out = process.argv[2] || path.join(__dirname, 'out');
require('fs').mkdirSync(out, { recursive: true });

(async () => {
  const { browser, page, errors } = await openGame();
  await page.setViewportSize({ width: 1280, height: 720 });
  const res = await page.evaluate(() => {
    const g = SA.game, R = {};
    T.training('stand', 'desert_temple'); SA.Physics.platforms = []; T.place(-250, 250); T.run(5);
    const f = g.p1;
    R.v2 = !!f.look.v2;
    // ---- idle 15 s ----
    let maxStep = 0, headMin = 1e9, headMax = -1e9, hipMin = 1e9, hipMax = -1e9, wgMin = 1e9, wgMax = -1e9, prev = null;
    for (let i = 0; i < 900; i++) {
      T.run(1);
      const S = f.skel;
      if (prev) for (const k of ['head', 'handF', 'handB', 'neck', 'hip']) maxStep = Math.max(maxStep, Math.hypot(S[k].x - prev[k].x, S[k].y - prev[k].y));
      prev = {}; for (const k of ['head', 'handF', 'handB', 'neck', 'hip']) prev[k] = { x: S[k].x, y: S[k].y };
      headMin = Math.min(headMin, S.head.y); headMax = Math.max(headMax, S.head.y);
      hipMin = Math.min(hipMin, S.hip.x); hipMax = Math.max(hipMax, S.hip.x);
      wgMin = Math.min(wgMin, f.pose.wg); wgMax = Math.max(wgMax, f.pose.wg);
    }
    R.idle = { maxStep: +maxStep.toFixed(2), head: +(headMax - headMin).toFixed(1), hip: +(hipMax - hipMin).toFixed(1), wg: +(wgMax - wgMin).toFixed(2), state: f.state };
    // ---- run 10 s (6 runs across the arena, no turning) ----
    let slide = 0, contactFrames = 0, hipJ = 0, lastHipY = null, capeJ = 0, lastCape = null;
    const cape = (f.accessories || []).find((a) => a.cape);
    const L0 = {};
    for (let rep = 0; rep < 6; rep++) {
      T.place(-850, 1100); T.run(2); L0.footF = L0.footB = undefined; lastHipY = null; lastCape = null;
      for (let i = 0; i < 100; i++) {
        T.run(1, { hold: ['right'] });
        const S = f.skel, lk = f._lock;
        for (const k of ['footF', 'footB']) {
          if (lk && lk[k].on && (f.state === 'run' || f.state === 'sprint')) {
            if (L0[k] !== undefined) { slide = Math.max(slide, Math.abs(S[k].x - L0[k])); contactFrames++; }
            L0[k] = S[k].x;
          } else L0[k] = undefined;
        }
        if (f.state === 'run' || f.state === 'sprint') {
          if (lastHipY !== null) hipJ = Math.max(hipJ, Math.abs(S.hip.y - lastHipY));
          lastHipY = S.hip.y;
        } else lastHipY = null;
        if (cape && cape.ropes) {
          const p = cape.ropes[0].pts[cape.ropes[0].pts.length - 1];
          if (lastCape) capeJ = Math.max(capeJ, Math.hypot(p.x - lastCape.x - f.vx / 60, p.y - lastCape.y));
          lastCape = { x: p.x, y: p.y };
        }
      }
    }
    R.run = { footSlide: +slide.toFixed(1), contactFrames, hipJitter: +hipJ.toFixed(1), capeStep: Math.round(capeJ) };
    // ---- transitions ----
    T.place(-300, 120); T.run(3);
    let maxPm = 0, maxRot = 0, prevRel = null, prevAng = null;
    const J = ['head', 'neck', 'sh', 'elbF', 'handF', 'elbB', 'handB', 'kneeF', 'footF', 'kneeB', 'footB'];
    const rec = () => {
      const S = f.skel, rel = {};
      for (const k of J) rel[k] = Math.hypot(S[k].x - S.hip.x, S[k].y - S.hip.y);
      const ang = Math.atan2(S.neck.y - S.hip.y, S.neck.x - S.hip.x);
      if (prevRel) {
        let sum = 0; for (const k of J) sum += Math.abs(rel[k] - prevRel[k]);
        maxPm = Math.max(maxPm, sum / J.length);
        let da = Math.abs(ang - prevAng); if (da > Math.PI) da = SA.TAU - da;
        if (da > maxRot) { maxRot = da; R.rotAt = f.state + ':' + (f.flip ? f.flip.kind : '') + ':' + (f.move ? f.move.id : '') + ':' + Math.floor(f.st); }
      }
      prevRel = rel; prevAng = ang;
    };
    const step = (n, o) => { for (let i = 0; i < n; i++) { T.run(1, i === 0 ? o : { hold: o && o.hold }); rec(); } };
    step(20, { hold: ['right'] });
    step(1, { press: ['gJump'], hold: ['right'] }); step(14);
    step(1, { press: ['light'] }); step(18);
    step(1, { press: ['gJump'] }); step(8);
    step(1, { press: ['heavy'], hold: ['down'] });
    for (let i = 0; i < 80 && !f.grounded; i++) step(1, { hold: ['down'] });
    step(1, { press: ['gRollB'] }); step(30);
    R.trans = { pose: +maxPm.toFixed(1), rot: +maxRot.toFixed(2), at: R.rotAt };
    return R;
  });
  // silhouettes: flat black on light grey (idle + heavy slash)
  for (const k of ['idle', 'heavy', 'air']) {
    await page.evaluate((k) => {
      const g = SA.game; T.training('stand', 'desert_temple'); SA.Physics.platforms = []; T.place(-150, 600); T.run(5);
      const f = g.p1;
      if (k === 'idle') T.run(40);
      if (k === 'heavy') { f.setLoadout({ weapon: 'katana', ranged: 'crescent_pistols' }); T.place(-150, 600); T.run(3); T.run(1, { press: ['heavy'] }); T.run(f.move ? f.move.startup + 1 : 12); }
      if (k === 'air') { T.run(1, { press: ['gJump'] }); T.run(26); }
      g.manual = true;
      g.__sil = k;
    }, k);
    await page.evaluate(() => {
      const g = SA.game, ctx = g.ctx, f = g.p1, cam = g.camera;
      cam.x = f.x; cam.zoom = 1.8; cam.zoomKick = 0; cam.y = f.y - 150; cam.sx = cam.sy = cam.sr = 0;
      // freeze rendering of the normal scene for the capture
      g._render = g.render; g.render = () => {
        SA.resetTransform(ctx); ctx.fillStyle = '#d8d8d8'; ctx.fillRect(0, 0, SA.W, SA.H);
        cam.apply(ctx); SA.drawHeroV2(ctx, f, '#000');
      };
    });
    await page.waitForTimeout(120);
    await page.screenshot({ path: out + '/silhouette-' + k + '.png' });
    await page.evaluate(() => { const g = SA.game; g.render = g._render; });
  }
  const checks = [
    ['player uses CharacterRendererV2', res.v2],
    ['idle lives: breathing / weight shift / weapon sway visible', res.idle.head > 1.5 && res.idle.hip > 4 && res.idle.wg > 0.15, res.idle],
    ['idle never jitters (max joint step < 2.5 px per frame)', res.idle.maxStep < 2.5 && res.idle.state === 'idle', res.idle],
    ['run: no foot sliding while planted (<= 4 px)', res.run.contactFrames > 150 && res.run.footSlide <= 4, res.run],
    ['run: no body jitter (hip y step < 8 px)', res.run.hipJitter < 8, res.run],
    ['run: cape moves in smooth arcs (tip step < 40 px)', res.run.capeStep < 40, res.run],
    ['transitions run > jump > air attack > double jump > dive > land > roll without pops', res.trans.pose < 28 && res.trans.rot < 0.5, res.trans],
  ];
  let fail = 0;
  for (const [name, ok, info] of checks) { console.log((ok ? 'PASS ' : 'FAIL ') + name + '  ' + JSON.stringify(info === undefined ? '' : info)); if (!ok) fail++; }
  console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'NO PAGE ERRORS');
  console.log(fail ? `${fail} FAILED` : `ALL ${checks.length} CHECKS PASSED`);
  await browser.close();
  process.exit(fail || errors.length ? 1 : 0);
})();
