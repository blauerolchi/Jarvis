'use strict';
/* Character roster: the player (mummy) and the training dummy. Looks are material data, see renderer.js. */
(function (SA) {
  // loose bandage end: a verlet chain anchored to a joint (it trails behind every movement)
  const bandage = (anchor, n, at, front, w0) => ({
    anchor, bandage: true, front: !!front, windMul: 1.1,
    rope: [{ n, seg: 11, w0: w0 || 7, w1: 2.5, at: at || [0, 0] }],
  });

  SA.CHARACTERS = {
    // The player: a forgotten warrior, woken in the tomb, fighting through the realm of the dead.
    mummy: {
      id: 'mummy', name: 'THE MUMMY', title: 'Forgotten Warrior',
      look: {
        kind: 'mummy', mat: { skin: '#15100c', wrap: '#c9b58a', metal: '#d4a84a', cloth: '#4a1612' },
        wraps: 0.94, tatters: 0.17,
        eye: '#4ff0dc', eyeCore: '#e9fffb', accent: '#e0b24a', trail: '#d8c08a', spark: '#ffe2a0',
        body: '#16110c', back: '#241c14', scale: 1, bulk: 1, victory: 1,
        accessories: [
          bandage('head', 9, [-16, -4], false, 8),
          bandage('hip', 6, [-14, -4]),
          bandage('kneeB', 4, [0, 0]),
          bandage('elbB', 4, [0, 0], false, 6),
          bandage('handF', 4, [-8, 0], true, 6),
          bandage('kneeF', 3, [0, 0], true, 6),
          { type: 'belt', flap: '#3a1512' },
          { type: 'amulet', gem: '#2fd8c8' },
          { type: 'bracers' },
          { type: 'pauldron', gem: '#2fd8c8' },
        ],
      },
      stats: { maxHp: 1000, damageMul: 1, speedMul: 1 },
    },
    dummy: {
      id: 'dummy', name: 'TRAINING DUMMY', title: 'Straw & Linen',
      look: {
        kind: 'human', mat: { skin: '#5a4630', wrap: '#a88a5a', metal: '#6a5a3a', cloth: '#7a6040' }, wraps: 0.35, tatters: 0.4,
        body: '#1a140e', back: '#2a2016', accent: '#c9a25a', spark: '#ffe0a0',
        eye: '#8a7a5a', eyeCore: '#d0c0a0', scale: 1, bulk: 1, victory: 1,
        accessories: [{ type: 'kilt', color: '#6a5234' }],
      },
      stats: { maxHp: 1000, damageMul: 1, speedMul: 1 },
      ai: { aggression: 0.6, range: 240, blockMul: 1, dodgeMul: 1, jumpiness: 0.15,
        weights: { jab: 2, kick: 2, heavy: 1, lowKick: 1, dashPunch: 1, slideKick: 1, jumpIn: 1, combo: 2 } },
    },
  };

  // Recolors the player's silhouette details with an owned cosmetic.
  SA.applyCosmetic = function (look, cosId) {
    const c = SA.COSMETICS && SA.COSMETICS[cosId];
    if (!c) return look;
    const mat = Object.assign({}, look.mat, c.wrap ? { wrap: c.wrap } : null, c.metal ? { metal: c.metal } : null, c.skin ? { skin: c.skin } : null);
    const out = Object.assign({}, look, { accent: c.accent, trail: c.trail, eye: c.eye, mat });
    out._pal = null;
    return out;
  };

  // opts: isPlayer, special, weapon, ranged, cosmetic, look, name, title, stats {maxHp, damageMul, speedMul, armor, superArmor}
  SA.createFighter = function (charId, controller, opts) {
    opts = opts || {};
    const def = SA.CHARACTERS[charId];
    let look = opts.look || def.look;
    if (opts.cosmetic) look = SA.applyCosmetic(look, opts.cosmetic);
    const st = Object.assign({}, def.stats, opts.stats || {});
    const f = new SA.Fighter({
      name: opts.name || def.name,
      look,
      controller,
      isPlayer: !!opts.isPlayer,
      maxHp: st.maxHp,
      damageMul: st.damageMul,
      speedMul: st.speedMul,
      armor: st.armor,
      superArmor: st.superArmor,
      special: opts.special || def.special || 'rush',
      weapon: opts.weapon || def.weapon || 'fists',
      ranged: opts.ranged || def.ranged || null,
    });
    f.charId = charId;
    f.title = opts.title || def.title;
    f.energy = 0;
    return f;
  };
})(window.SA);
