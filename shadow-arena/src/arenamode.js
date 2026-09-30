'use strict';
/*
 * ArenaMode — endless stage ladder. One round per stage, a new generated enemy after every win.
 * Elites every 5 stages, bosses every 10, great bosses every 30. Coins and XP are banked
 * immediately after each victory, so a lost run never takes earned currency away.
 */
(function (SA) {
  const B = SA.BALANCE;

  const ArenaMode = {
    // opts.stage / opts.forceBoss are only used by the dev cheat (F8)
    start(game, opts) {
      opts = opts || {};
      const P = SA.Save.data.progression;
      P.arenaRuns++;
      SA.Save.save();
      game.arenaRun = {
        seed: 1 + Math.floor(Math.random() * 1e6),
        stage: opts.stage || 1, wins: 0, streak: 0, coins: 0, xp: 0, bosses: 0,
        screen: null, energy: 0, reward: null, levelUps: [], forceBoss: !!opts.forceBoss,
        startLevel: SA.Save.data.player.level,
        prevBest: P.bestStage,
      };
      this.begin(game);
    },

    begin(game) {
      const run = game.arenaRun;
      const diff = SA.Save.data.progression.difficulty;
      run.enemy = SA.EnemyGen.generate(run.stage, diff, run.seed, run.forceBoss);
      run.forceBoss = false;
      run.screen = null;
      run.menu = null;
      game.transitionTo(() => {
        game.scene = 'fight';
        game.setupWorld({ mode: 'arena', arena: run.enemy.arena, enemy: run.enemy });
      });
    },

    kindOf(stage) { return SA.EnemyGen.stageKind(stage); },

    nextLabel(stage) {
      const n = stage + 1;
      const toBoss = B.arena.bossEvery - (stage % B.arena.bossEvery);
      if (this.kindOf(n) === 'boss') return 'NEXT: BOSS';
      if (this.kindOf(n) === 'elite') return 'NEXT: ELITE';
      return toBoss <= 3 ? `BOSS IN ${toBoss} STAGES` : `ELITE IN ${B.arena.eliteEvery - (stage % B.arena.eliteEvery)} STAGES`;
    },

    // called by the game when the stage's single round is decided
    onWin(game, perfect) {
      const run = game.arenaRun;
      const e = run.enemy;
      const P = SA.Save.data.progression;
      run.wins++;
      run.streak++;
      const diff = P.difficulty;
      const r = SA.Rewards.forStage(run.stage, e.kind, { difficulty: diff, streak: run.streak, perfect, great: e.great });
      run.coins += r.coins;
      run.xp += r.xp;
      SA.Progression.addCoins(r.coins);
      const ups = SA.Progression.addXp(r.xp);
      run.levelUps = ups;
      P.totalArenaWins++;
      P.bestStage = Math.max(P.bestStage, run.stage);
      if (e.kind === 'boss') {
        run.bosses++;
        P.bossKills++;
        P.bossesDefeated[e.bossId] = (P.bossesDefeated[e.bossId] || 0) + 1;
      }
      // reaching an arena in the ladder also unlocks it for FIGHT mode
      if (SA.ARENAS[e.arena] && SA.ARENA_ORDER.indexOf(e.arena) >= 0) SA.Save.unlockArena(e.arena);
      SA.Save.stat('wins');
      SA.Save.stat('fights');
      SA.Save.save();
      run.reward = r;
      run.energy = game.p1.energy * B.arena.energyCarry;
      run.screen = 'reward';
      run.screenT = 0;
      game.ui.resetHud();   // no KO / PERFECT text on top of the reward screen
      run.menu = new SA.UI.Menu([
        { label: 'NEXT FIGHT', action: () => this.next(game) },
        { label: 'END RUN', action: () => this.end(game, true) },
      ], { x: SA.W / 2, y: 820, spacing: 78, size: 40, width: 560, align: 'center' });
      SA.audio.play('coin');
      if (ups.length) setTimeout(() => SA.audio.play('levelup'), 450);
    },

    onLoss(game) {
      const run = game.arenaRun;
      run.streak = 0;
      SA.Save.stat('losses');
      SA.Save.stat('fights');
      this.end(game, false);
    },

    end(game, retired) {
      const run = game.arenaRun;
      const P = SA.Save.data.progression;
      run.screen = 'over';
      run.screenT = 0;
      game.ui.resetHud();
      run.retired = retired;
      // best stage = highest stage reached in any run
      P.bestStage = Math.max(P.bestStage, run.stage);
      run.record = run.stage > run.prevBest;
      run.best = P.bestStage;
      SA.Save.save();
      run.menu = new SA.UI.Menu([
        { label: 'RETRY', action: () => this.start(game) },
        { label: 'SHOP', action: () => game.toMenu('shop') },
        { label: 'MAIN MENU', action: () => game.toMenu() },
      ], { x: SA.W / 2, y: 800, spacing: 74, size: 38, width: 520, align: 'center' });
    },

    next(game) {
      const run = game.arenaRun;
      run.stage++;
      this.begin(game);
    },

    // development cheats (F7 / F8)
    skipStage(game) {
      if (game.mode !== 'arena' || !game.arenaRun || game.arenaRun.screen) return;
      game.p2.hp = 0;
    },
    spawnBoss(game) {
      const run = game.arenaRun;
      if (!run) return;
      run.stage = Math.ceil((run.stage + 1) / B.arena.bossEvery) * B.arena.bossEvery;
      run.forceBoss = true;
      this.begin(game);
    },
  };

  SA.ArenaMode = ArenaMode;
})(window.SA);
