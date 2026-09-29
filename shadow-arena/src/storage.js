'use strict';
/* Local progress & settings via localStorage. Never touches the network. */
(function (SA) {
  const KEY = 'shadowArena.save.v1';

  function defaults() {
    return {
      version: 1,
      stats: {
        fights: 0, wins: 0, losses: 0,
        roundsWon: 0, roundsLost: 0,
        kos: 0, perfects: 0, parries: 0,
        maxCombo: 0, maxDamage: 0, specialsLanded: 0,
        totalDamage: 0,
      },
      difficulty: 'normal',
      unlockedArenas: ['temple'],
      unlockedSpecials: ['rush'],
      special: 'rush',
      lastArena: 'temple',
      arenaWins: {},
      settings: {
        master: 0.8, sfx: 1, music: 0.45,
        shake: true, damageNumbers: true, quality: 'auto',
      },
    };
  }

  function merge(base, over) {
    if (!over || typeof over !== 'object') return base;
    for (const k of Object.keys(base)) {
      if (!(k in over)) continue;
      const b = base[k], o = over[k];
      if (b && typeof b === 'object' && !Array.isArray(b)) base[k] = merge(b, o);
      else if (typeof o === typeof b) base[k] = o;
    }
    for (const k of Object.keys(over)) if (!(k in base)) base[k] = over[k];
    return base;
  }

  SA.Save = {
    data: defaults(),
    load() {
      try {
        const raw = window.localStorage.getItem(KEY);
        this.data = raw ? merge(defaults(), JSON.parse(raw)) : defaults();
      } catch (e) {
        this.data = defaults();
      }
      return this.data;
    },
    save() {
      try {
        window.localStorage.setItem(KEY, JSON.stringify(this.data));
      } catch (e) { /* storage full or disabled: progress just isn't persisted */ }
    },
    resetStats() {
      const keep = this.data.settings;
      this.data = defaults();
      this.data.settings = keep;
      this.save();
    },
    stat(name, value, mode) {
      const s = this.data.stats;
      if (mode === 'max') s[name] = Math.max(s[name] || 0, value);
      else s[name] = (s[name] || 0) + (value === undefined ? 1 : value);
    },
    unlock(listName, id) {
      const list = this.data[listName];
      if (list.indexOf(id) >= 0) return false;
      list.push(id);
      return true;
    },
  };
})(window.SA);
