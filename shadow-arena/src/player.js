'use strict';
/* Character roster: looks (silhouette accessories, eye/accent colors) and base stats. */
(function (SA) {
  const headband = (color) => ({
    anchor: 'head', color, windMul: 1,
    rope: [
      { n: 8, seg: 12, w0: 8, w1: 3, at: [-17, -6] },
      { n: 7, seg: 11, w0: 7, w1: 2, at: [-17, -1] },
    ],
  });
  const sash = (color, len) => ({
    anchor: 'hip', color, front: true, windMul: 0.8,
    rope: [{ n: len || 5, seg: 10, w0: 7, w1: 3, at: [-14, -4] }],
  });

  SA.CHARACTERS = {
    shadow: {
      id: 'shadow', name: 'SHADOW', title: 'The Nameless',
      look: {
        body: '#050508', back: '#16161f', accent: '#e3263f', trail: '#ff7a6a', spark: '#ffcf86',
        eye: '#9fe3ff', eyeCore: '#ffffff', scale: 1, bulk: 1, victory: 1,
        accessories: [headband('#d9233a'), sash('#b01d31')],
      },
      stats: { maxHp: 1000, damageMul: 1, speedMul: 1 },
    },
    ronin: {
      id: 'ronin', name: 'RONIN', title: 'Blade Without Master',
      look: {
        body: '#060506', back: '#18141a', accent: '#ffc15e', spark: '#ffd08a',
        eye: '#ffc15e', eyeCore: '#fff3d0', scale: 1.02, bulk: 1.04, victory: 2,
        accessories: [
          { type: 'hat' },
          sash('#0b090b', 7),
        ],
      },
      stats: { maxHp: 1000, damageMul: 1, speedMul: 0.98 },
      ai: { aggression: 0.6, range: 235, blockMul: 1.1, dodgeMul: 0.8, jumpiness: 0.12,
        weights: { jab: 3, kick: 2, heavy: 1.5, lowKick: 1.2, dashPunch: 1, slideKick: 0.6, jumpIn: 0.5, combo: 3 } },
    },
    kitsune: {
      id: 'kitsune', name: 'KITSUNE', title: 'Fox of the Bamboo',
      look: {
        body: '#05060a', back: '#151822', accent: '#ff9a3d', spark: '#ffc68a',
        eye: '#ffb35c', eyeCore: '#fff0d8', scale: 0.96, bulk: 0.94, victory: 1,
        accessories: [
          { anchor: 'head', windMul: 1.2, rope: [{ n: 10, seg: 13, w0: 13, w1: 4, at: [-12, -16] }] },
        ],
      },
      stats: { maxHp: 950, damageMul: 0.95, speedMul: 1.1 },
      ai: { aggression: 0.55, range: 290, blockMul: 0.8, dodgeMul: 1.8, jumpiness: 0.3,
        weights: { jab: 1.5, kick: 3.5, heavy: 0.6, lowKick: 2, dashPunch: 0.8, slideKick: 1.6, jumpIn: 1.6, combo: 2.5 } },
    },
    volt: {
      id: 'volt', name: 'VOLT', title: 'Neon Street Phantom',
      look: {
        body: '#04050a', back: '#131725', accent: '#35f0ff', trail: '#35f0ff', spark: '#9ffbff',
        eye: '#35f0ff', eyeCore: '#e8ffff', visor: true, scale: 1, bulk: 1, victory: 2,
        accessories: [
          { anchor: 'hip', windMul: 0.6, rope: [
            { n: 6, seg: 14, w0: 18, w1: 10, at: [-14, -12] },
            { n: 6, seg: 13, w0: 16, w1: 8, at: [-6, -10] },
          ] },
        ],
      },
      stats: { maxHp: 1000, damageMul: 1, speedMul: 1.06 },
      ai: { aggression: 0.85, range: 190, blockMul: 0.75, dodgeMul: 1, jumpiness: 0.15,
        weights: { jab: 3, kick: 1.5, heavy: 1, lowKick: 1.5, dashPunch: 2.2, slideKick: 1.2, jumpIn: 0.8, combo: 4 } },
    },
    oni: {
      id: 'oni', name: 'ONI', title: 'Ash-Born Demon',
      look: {
        body: '#070404', back: '#1c1212', accent: '#ff4a1c', trail: '#ff6a2a', spark: '#ffb070',
        eye: '#ff2a1a', eyeCore: '#ffd0c0', scale: 1.07, bulk: 1.16, victory: 2,
        accessories: [
          { type: 'horns' },
          { anchor: 'hip', front: true, windMul: 0.5, rope: [{ n: 5, seg: 12, w0: 16, w1: 10, at: [4, -2] }] },
        ],
      },
      stats: { maxHp: 1150, damageMul: 1.15, speedMul: 0.9 },
      ai: { aggression: 0.7, range: 240, blockMul: 1.2, dodgeMul: 0.5, jumpiness: 0.08,
        weights: { jab: 1.6, kick: 1.5, heavy: 3, lowKick: 1, dashPunch: 1.4, slideKick: 0.5, jumpIn: 0.4, combo: 3 } },
    },
    dummy: {
      id: 'dummy', name: 'TRAINING DUMMY', title: 'Straw & Patience',
      look: {
        body: '#08080a', back: '#1a1a20', accent: '#9aa0a8', spark: '#ffe0a0',
        eye: '#8d949c', eyeCore: '#d0d6dc', scale: 1, bulk: 1, victory: 1,
        accessories: [{ type: 'topknot' }],
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
    const out = Object.assign({}, look, { accent: c.accent, trail: c.trail, eye: c.eye });
    out.accessories = look.accessories.map((a) => (a.color ? Object.assign({}, a, { color: a.anchor === 'hip' ? SA.M.shade(c.band, -0.18) : c.band }) : a));
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
