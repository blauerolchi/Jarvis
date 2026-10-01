'use strict';
/* Character roster: the player (mummy) and the training dummy. Looks are material data, see renderer.js. */
(function (SA) {
  // loose bandage end: a verlet chain anchored to a joint (it trails behind every movement)
  const bandage = (anchor, n, at, front, w0) => ({
    anchor, bandage: true, front: !!front, windMul: 1.1,
    rope: [{ n, seg: 11, w0: w0 || 7, w1: 2.5, at: at || [0, 0] }],
  });

  SA.CHARACTERS = {
    // The player: the Moon Guardian, a mystic warden of Khonsu's crescent, wrapped in white linen,
    // hooded, short cape, gold and moon-silver. (Character id stays 'mummy' for saves and cosmetics.)
    mummy: {
      id: 'mummy', name: 'MOON GUARDIAN', title: 'Warden of the Crescent',
      look: {
        kind: 'mummy', mat: { skin: '#3a3644', wrap: '#ebe4d4', metal: '#d9b25a', cloth: '#efe9dc' },
        wraps: 0.97, tatters: 0.08, limb: 1.12, wrapCover: 0.9, moonTrail: true,
        eye: '#cfeeff', eyeCore: '#ffffff', accent: '#d9b25a', trail: '#cfe0ff', spark: '#e8f4ff',
        body: '#17151d', back: '#24212c', scale: 1, bulk: 1.04, victory: 1,
        accessories: [
          // short cape from the shoulders: a cloth panel on a verlet chain (cream outside, dark lining)
          { anchor: 'neck', cape: true, color: '#ece5d6', lining: '#2a2633', trim: '#d9b25a', windMul: 0.9,
            rope: [{ n: 6, seg: 15, w0: 46, w1: 34, at: [-12, 6] }] },
          bandage('hip', 6, [-14, -4], false, 6),
          bandage('elbB', 4, [0, 0], false, 5),
          bandage('handF', 4, [-8, 0], true, 5),
          { type: 'moonHood', color: '#efe9dc', shade: '#c9c0ae', trim: '#d9b25a', mark: '#e8f2ff' },
          { type: 'crescentEmblem', color: '#d9b25a', glow: '#cfeeff' },
          { type: 'belt', color: '#d9b25a', flap: '#2a2633' },
          { type: 'bracers', color: '#c9d2de' },
          { type: 'pauldron', color: '#c9d2de', gem: '#bfe8ff' },
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
