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
        kind: 'mummy', v2: true, mat: { skin: '#3a3644', wrap: '#eeebe4', metal: '#c7cfdb', cloth: '#eeebe4' }, eyeFwd: 0.62,
        wraps: 0.97, tatters: 0.08, limb: 1.1, upper: 1.18, chest: 1.12, wrapCover: 0.9, moonTrail: true,
        eye: '#cfeeff', eyeCore: '#ffffff', accent: '#d9b25a', trail: '#cfe0ff', spark: '#e8f4ff',
        body: '#17151d', back: '#24212c', scale: 1, bulk: 1.04, victory: 1,
        accessories: [
          // short cape from the shoulders: a cloth panel on a verlet chain (cream outside, dark lining)
          // CharacterRendererV2 draws body, hood, mask, mantle, tabard, armour; the accessories are
          // only the simulated cloth: a big asymmetric cape (heavily damped -> clean arcs, no
          // flutter) and four light bandage ends (forearm, waist, shoulder, leg)
          { anchor: 'neck', cape: true, asym: true, color: '#eeebe4', lining: '#2a2633', trim: '#d8b45e', windMul: 0.8, airLift: 1100,
            damp: 0.885, iters: 6, rope: [{ n: 8, seg: 18, w0: 84, w1: 100, at: [-20, 12] }] },
          bandage('hip', 6, [-16, -6], false, 6),
          bandage('sh', 5, [-12, 4], false, 5),
          bandage('kneeB', 4, [0, 4], false, 5),
          bandage('handF', 4, [-10, 0], true, 5),
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
