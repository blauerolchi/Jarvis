'use strict';
/*
 * SaveSystem: versioned local save via localStorage. Never touches the network.
 *
 * saveData = { version, player, inventory, progression, statistics, settings }
 * Older versions are migrated step by step in MIGRATIONS so progress is never lost.
 */
(function (SA) {
  const KEY = 'shadowArena.save.v1';   // storage key stays stable; the schema version lives inside
  const VERSION = 3;

  function defaults() {
    return {
      version: VERSION,
      player: { level: 1, xp: 0, coins: 150, lifetimeCoins: 0 },
      inventory: {
        owned: ['fists', 'rush', 'cos_crimson'],
        equipped: { primary: 'fists', ranged: null, special: 'rush', cosmetic: 'cos_crimson' },
      },
      progression: {
        difficulty: 'normal',
        unlockedArenas: ['desert_temple'],
        lastArena: 'desert_temple',
        arenaWins: {},
        bestStage: 0,
        arenaRuns: 0,
        totalArenaWins: 0,
        bossKills: 0,
        bossesDefeated: {},
      },
      statistics: {
        fights: 0, wins: 0, losses: 0,
        roundsWon: 0, roundsLost: 0,
        kos: 0, perfects: 0, parries: 0,
        maxCombo: 0, maxDamage: 0, specialsLanded: 0,
        totalDamage: 0,
      },
      settings: {
        master: 0.8, sfx: 1, music: 0.45,
        shake: true, damageNumbers: true,
        graphics: 'auto', vibration: true, touchControls: 'auto', touchSize: 1,
      },
    };
  }

  // v1 -> v2: flat v1 save moves into the structured sections
  const MIGRATIONS = {
    1(d) {
      const n = defaults();
      if (d.stats) Object.assign(n.statistics, d.stats);
      if (d.settings) {
        for (const k of ['master', 'sfx', 'music', 'shake', 'damageNumbers']) if (k in d.settings) n.settings[k] = d.settings[k];
      }
      const P = n.progression;
      if (d.difficulty) P.difficulty = d.difficulty;
      if (Array.isArray(d.unlockedArenas)) P.unlockedArenas = d.unlockedArenas.slice();
      if (d.lastArena) P.lastArena = d.lastArena;
      if (d.arenaWins) P.arenaWins = d.arenaWins;
      for (const sp of d.unlockedSpecials || []) if (n.inventory.owned.indexOf(sp) < 0) n.inventory.owned.push(sp);
      if (d.special && n.inventory.owned.indexOf(d.special) >= 0) n.inventory.equipped.special = d.special;
      // reward old players a little for their victories
      n.player.coins += (n.statistics.wins || 0) * 60;
      return n;
    },
    // v2 -> v3: the arenas became Egyptian; old arena ids map onto the new ones, nothing else changes
    2(d) {
      const R = SA.ARENA_RENAME || {};
      const P = d.progression || {};
      const ren = (id) => R[id] || id;
      if (Array.isArray(P.unlockedArenas)) P.unlockedArenas = [...new Set(P.unlockedArenas.map(ren))];
      if (P.lastArena) P.lastArena = ren(P.lastArena);
      if (P.arenaWins) {
        const w = {};
        for (const k of Object.keys(P.arenaWins)) w[ren(k)] = (w[ren(k)] || 0) + P.arenaWins[k];
        P.arenaWins = w;
      }
      d.progression = P;
      return d;
    },
  };

  function merge(base, over) {
    if (!over || typeof over !== 'object') return base;
    for (const k of Object.keys(base)) {
      if (!(k in over)) continue;
      const b = base[k], o = over[k];
      if (b && typeof b === 'object' && !Array.isArray(b)) base[k] = merge(b, o);
      else if (Array.isArray(b)) base[k] = Array.isArray(o) ? o : b;
      else if (typeof o === typeof b || b === null) base[k] = o;
    }
    for (const k of Object.keys(over)) if (!(k in base)) base[k] = over[k];
    return base;
  }

  function migrate(raw) {
    let d = raw;
    let v = d.version || 1;
    while (v < VERSION) {
      d = MIGRATIONS[v](d);
      v++;
      d.version = v;
    }
    return merge(defaults(), d);
  }

  SA.Save = {
    VERSION,
    data: defaults(),
    load() {
      try {
        const raw = window.localStorage.getItem(KEY);
        this.data = raw ? migrate(JSON.parse(raw)) : defaults();
      } catch (e) {
        this.data = defaults();
      }
      this.data.version = VERSION;
      return this.data;
    },
    save() {
      try {
        window.localStorage.setItem(KEY, JSON.stringify(this.data));
      } catch (e) { /* storage full or disabled: progress just isn't persisted */ }
    },
    resetProgress() {
      const keep = this.data.settings;
      this.data = defaults();
      this.data.settings = keep;
      this.save();
    },
    stat(name, value, mode) {
      const s = this.data.statistics;
      if (mode === 'max') s[name] = Math.max(s[name] || 0, value);
      else s[name] = (s[name] || 0) + (value === undefined ? 1 : value);
    },
    unlockArena(id) {
      const list = this.data.progression.unlockedArenas;
      if (list.indexOf(id) >= 0) return false;
      list.push(id);
      return true;
    },
    owns(id) { return this.data.inventory.owned.indexOf(id) >= 0; },
    grant(id) {
      if (this.owns(id)) return false;
      this.data.inventory.owned.push(id);
      return true;
    },
    get settings() { return this.data.settings; },
    get equipped() { return this.data.inventory.equipped; },
  };
})(window.SA);
