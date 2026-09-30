'use strict';
/*
 * Central balance constants. Tune the game here instead of hunting magic numbers in the code.
 * Weapon, enemy and boss definitions live in weapons.js / enemies.js / bosses.js and are data-driven too.
 */
(function (SA) {
  SA.BALANCE = {
    arena: {
      roundTime: 75,
      bossRoundTime: 99,
      eliteEvery: 5,               // stage % 5 === 0 -> elite (unless boss)
      bossEvery: 10,               // stage % 10 === 0 -> boss
      greatBossEvery: 30,          // stage % 30 === 0 -> great boss (extra phase power)
      // difficulty setting shifts the effective stage and the payout
      difficultyOffset: { easy: -3, normal: 0, hard: 6 },
      rewardMul: { easy: 0.8, normal: 1, hard: 1.3 },
      energyCarry: 0.5,            // fraction of energy kept between stages
      rotation: ['temple', 'bamboo', 'neon', 'frozen', 'palace', 'ancient', 'cyber', 'ruins'],
    },

    // Every AI parameter lerps from [stage 1 value, stage ~100 value] along t = 1 - exp(-s / curve).
    enemyScaling: {
      curve: 30,
      hp: { base: 0.78, perStage: 0.011, max: 3.2 },        // multiplier on archetype HP
      damage: { base: 0.8, perStage: 0.005, max: 1.9 },
      speed: { perStage: 0.0016, max: 0.16 },
      react: [24, 12],             // legacy (FIGHT mode curve); ARENA uses reactByKind
      reactByKind: { normal: [24, 12], elite: [15, 8.5], boss: [13, 6] },
      quality: [0.2, 0.95],         // how often the AI takes the best intent instead of a loose pick
      mobility: [0.4, 1.1],         // dash / roll / backstep / jump-in / slide usage
      bait: [0.0, 0.75],            // baits and frame traps
      variety: [0.35, 1],           // avoids repeating the same combo / intent
      block: [0.1, 0.8],
      lowRead: [0.2, 0.85],
      parry: [0, 0.3],
      dodge: [0.02, 0.36],
      punish: [0.18, 0.9],
      antiAir: [0.08, 0.7],
      comboChance: [0.2, 0.9],
      comboDepth: [1, 3.99],
      aggression: [0.68, 1.15],
      mistakes: [0.3, 0.02],
      spacing: [85, 12],
      thinkMin: [36, 8],
      thinkMax: [54, 14],
      guard: [0.35, 1.7],
      anticipate: [0.0, 0.13],
      special: [0.12, 0.45],
      ranged: [0.2, 0.6],
      eliteStageBonus: 4,          // elites fight like an enemy this many stages later
      bossStageBonus: 6,
    },

    elites: {
      modifiersBefore25: 1,
      modifiersBefore60: 2,
      modifiersAfter: 3,
      randomEliteFrom: 21,         // after this stage normal fights can roll elite modifiers
      randomEliteChance: 0.15,
    },

    rewards: {
      coinBase: 20, coinExp: 0.7,
      xpBase: 30, xpExp: 0.65,
      eliteMul: 1.6,
      bossMulBase: 2, bossMulPerStage: 0.09,
      greatBossMul: 1.5,
      perfectBonus: 0.15,
      streak: [[20, 0.35], [10, 0.2], [5, 0.1]],   // [wins in a row, bonus]
      fightWin: 60, fightLoss: 15,                  // coins for the classic FIGHT mode
      fightXpWin: 80, fightXpLoss: 25,
    },

    xp: {
      base: 90, exp: 1.45,         // XP to go from level L to L+1 = base * L^exp
      levelCoins: [60, 25],        // coins on level-up = a + b * level
      maxLevel: 99,
    },

    weapons: {
      // rarity changes looks, effects and only *moderately* the numbers
      rarityDamage: { common: 1, uncommon: 1.03, rare: 1.06, epic: 1.09, legendary: 1.12 },
      rarityColor: { common: '#b9b3a8', uncommon: '#6fd08c', rare: '#58a6ff', epic: '#c07bff', legendary: '#ffb340' },
      elementProc: { shock: 0.22, frost: 0.35 },
      frostSlow: { factor: 0.78, seconds: 1.6 },
      shockStun: 10,               // extra hitstun frames
      burn: { dps: 16, seconds: 2 },
    },

    ranged: {
      projectileHitstun: 14,
      blockChip: 0.12,
      maxProjectiles: 48,
    },

    specials: {
      energyCarryFight: 1,
    },
  };

  // t in [0,1] for a (possibly > 100) stage
  SA.BALANCE.stageT = function (s) {
    return 1 - Math.exp(-Math.max(0, s) / SA.BALANCE.enemyScaling.curve);
  };
})(window.SA);
