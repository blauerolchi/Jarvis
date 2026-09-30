'use strict';
/*
 * ProjectileSystem — pooled projectiles (no per-frame allocations).
 * Types: shuriken knife kunai boomerang bullet pellet bolt energy rocket wave shockwave
 * Rules that keep ranged combat fair:
 *   - projectiles can be blocked (chip damage) and a well-timed parry reflects them
 *   - evade invulnerability passes through them, crouching ducks under bullets
 *   - explosions hurt everyone except the thrower
 */
(function (SA) {
  const { rand, clamp } = SA.M;

  // big boss attacks can be blocked but not sent back
  const NO_REFLECT = { shockwave: 1, wave: 1, beam: 1, pillar: 1, sand: 1 };

  class ProjectileSystem {
    constructor(max) {
      this.pool = [];
      for (let i = 0; i < (max || 48); i++) this.pool.push({ alive: false, hitList: new Set() });
      this.count = 0;
      this.serial = 0;
    }

    clear() { for (const p of this.pool) p.alive = false; }

    get(ownerFilter) {
      const out = [];
      for (const p of this.pool) if (p.alive && (!ownerFilter || p.owner !== ownerFilter)) out.push(p);
      return out;
    }

    spawn(o) {
      let p = null;
      for (const q of this.pool) if (!q.alive) { p = q; break; }
      if (!p) return null;
      p.alive = true;
      p.px = p.py = undefined;
      p.sid = ++this.serial;
      p.reflected = false;
      p.type = o.type; p.owner = o.owner;
      p.x = o.x; p.y = o.y; p.vx = o.vx; p.vy = o.vy || 0;
      p.grav = o.grav || 0; p.life = 0; p.maxLife = o.life || 1.6;
      p.size = o.size || 16; p.w = o.w || p.size; p.h = o.h || p.size;
      p.rot = 0; p.spin = o.spin || 0;
      p.data = o.data;
      p.explode = o.explode || null;
      p.returns = !!o.returns; p.returning = false;
      p.ground = !!o.ground;
      p.pierce = !!o.pierce;
      p.color = o.color || '#ffffff';
      p.level = o.level || 'mid';
      p.sourceId = o.sourceId || null;
      // homing (boss spirits / sun orbs): steer toward target after a short delay, fixed speed
      p.homing = o.homing || 0; p.homingDelay = o.homingDelay || 0; p.speed = o.speed || 0; p.target = o.target || null;
      p.warn = !!o.warn;                 // telegraph only (never collides)
      p.unblockable = !!o.unblockable;   // lightning from the sky: move out of it
      p.hitList.clear();
      p.trail = 0;
      return p;
    }

    // Fire the owner's ranged weapon from its hand.
    fire(f, def, game) {
      const hand = f.skel.handF;
      const pr = def.proj;
      const count = pr.count || 1;
      const air = !f.grounded;
      for (let i = 0; i < count; i++) {
        const spread = count > 1 ? (i - (count - 1) / 2) * (pr.spread || 0) : 0;
        const sp = pr.speed * (count > 1 ? rand(0.92, 1.06) : 1);
        let vx = Math.cos(spread) * sp * f.facing;
        let vy = Math.sin(spread) * sp + (pr.vy || 0);
        if (air && def.kind === 'throw') { vy += 420; vx *= 0.9; }
        // lobbed shots (rockets) are aimed so they come down on the opponent
        if (pr.aim && pr.grav && game.p1 && game.p2) {
          const tgt = f === game.p1 ? game.p2 : game.p1;
          const t = SA.M.clamp(Math.abs(tgt.x - hand.x) / Math.abs(vx), 0.3, 1.6);
          vy = (-110 - hand.y - 0.5 * pr.grav * t * t) / t;
        }
        this.spawn({
          type: pr.type, owner: f, x: hand.x + f.facing * 18, y: hand.y, vx, vy, grav: pr.grav,
          life: pr.life || (pr.returns ? pr.life : 1.4), size: pr.size, spin: pr.type === 'shuriken' ? 30 : pr.type === 'boomerang' ? 22 : 0,
          explode: pr.explode, returns: pr.returns, sourceId: def.id, color: pr.color,
          data: { id: def.id, damage: Math.round(pr.dmg * (f.damageMul || 1)), hitstun: pr.hitstun || SA.BALANCE.ranged.projectileHitstun,
            blockstun: 10, kb: pr.kb || 150, level: 'mid', hitstop: pr.type === 'bullet' || pr.type === 'bolt' ? 4 : 3,
            shake: pr.type === 'pellet' ? 0.08 : 0.14, sound: pr.type === 'bullet' || pr.type === 'pellet' || pr.type === 'bolt' ? 'hit_bullet' : 'hit_light',
            power: pr.type === 'bolt' ? 0.7 : 0.4, projectile: true, element: def.element || null },
        });
      }
      if (def.kind === 'gun') {
        SA.FX.muzzle(game.particles, hand.x + f.facing * 30, hand.y, f.facing, pr.type === 'energy' ? '#6fe8ff' : '#ffd27a');
        f.vx -= f.facing * (def.recoil || 100);
        game.camera.addTrauma(pr.type === 'pellet' ? 0.2 : 0.08);
      }
      SA.audio.play(def.sound || 'throw');
    }

    // Special-move and boss waves travel along the ground or through the air.
    wave(owner, x, y, dir, o) {
      return this.spawn(Object.assign({
        type: 'wave', owner, x, y, vx: dir * (o.speed || 1700), vy: 0, life: o.life || 0.7,
        w: o.w || 110, h: o.h || 220, color: o.color || '#b58cff',
        data: Object.assign({ id: 'wave', damage: 60, hitstun: 26, blockstun: 16, kb: 700, level: 'mid', hitstop: 6, shake: 0.4, sound: 'hit_special', power: 1 }, o.data || {}),
      }, o.extra || {}));
    }

    shockwave(owner, x, dir, o) {
      o = o || {};
      return this.spawn({
        type: 'shockwave', owner, x, y: -34, vx: dir * (o.speed || 950), vy: 0, life: o.life || 0.65,
        w: 90, h: 70, color: o.color || '#ffcf8a', ground: true, level: 'low',
        data: Object.assign({ id: 'shockwave', damage: o.dmg || 40, hitstun: 22, blockstun: 12, kb: 500, kbY: -420, knockdown: true, level: 'low', hitstop: 4, shake: 0.35, sound: 'hit_heavy', power: 0.8 }, o.data || {}),
      });
    }

    update(dt, game) {
      const fighters = [game.p1, game.p2];
      let n = 0;
      for (const p of this.pool) {
        if (!p.alive) continue;
        n++;
        p.life += dt;
        if (p.returns && !p.returning && p.life > p.maxLife * 0.45) { p.returning = true; p.hitList.clear(); }
        if (p.returning) {
          const o = p.owner;
          const tx = o.skel.handF.x, ty = o.skel.handF.y;
          const dx = tx - p.x, dy = ty - p.y, d = Math.hypot(dx, dy) || 1;
          const spd = 1500;
          p.vx += (dx / d * spd - p.vx) * Math.min(1, dt * 8);
          p.vy += (dy / d * spd - p.vy) * Math.min(1, dt * 8);
          if (d < 50) { this.kill(p); if (o.rangedState) o.rangedState.out = false; continue; }
        }
        if (p.homing && p.target && p.life > p.homingDelay) {
          const t = p.target, tx = t.skel.hip.x, ty = t.y - 130 * t.look.scale;
          const want = Math.atan2(ty - p.y, tx - p.x), cur = Math.atan2(p.vy, p.vx);
          let d = want - cur;
          while (d > Math.PI) d -= SA.TAU;
          while (d < -Math.PI) d += SA.TAU;
          const a = cur + clamp(d, -p.homing * dt, p.homing * dt);
          const sp = Math.max(p.speed, Math.hypot(p.vx, p.vy) * 0.96);
          p.vx = Math.cos(a) * sp; p.vy = Math.sin(a) * sp;
          if (p.y > -30 && p.vy > 0) p.vy *= 0.5;   // skim over the floor instead of dying on it
        }
        p.vy += p.grav * dt;
        p.px = p.x; p.py = p.y;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.rot += p.spin * dt;
        if (p.type === 'rocket' || p.type === 'energy' || p.type === 'wave' || p.type === 'spirit' || p.type === 'orb') {
          if ((p.trail = (p.trail || 0) + 1) % 2 === 0) SA.FX.projectileTrail(game.particles, p.x, p.y, p.color, p.type);
        }
        if (p.type === 'shockwave' && (p.trail = (p.trail || 0) + 1) % 3 === 0) SA.FX.dust(game.particles, p.x, 0, 0.35, Math.sign(p.vx));
        // ground / walls / lifetime
        if (p.type === 'sand' || p.type === 'wind') { if ((p.trail = (p.trail || 0) + 1) % 3 === 0) SA.FX.sandTrail(game.particles, p.x, p.y, Math.sign(p.vx), p.type === 'wind' ? '#cfeeff' : '#d8b070'); }
        if (p.warn) { if (p.life > p.maxLife) this.kill(p); continue; }
        if (!p.ground && p.y > -6 && !p.homing) {
          if (p.explode) { this.explode(p, game); continue; }
          if (p.type === 'kunai' || p.type === 'knife' || p.type === 'shuriken' || p.type === 'bolt') SA.FX.spark(game.particles, p.x, -4, '#ffe0b0');
          this.kill(p);
          continue;
        }
        for (const f of fighters) {
          if (f === p.owner && !p.reflected) continue;
          if (f === p.owner && p.reflected && p.life < 0.05) continue;
          if (p.hitList.has(f)) continue;
          if (this.collide(p, f, game)) break;
        }
        if (!p.alive) continue;
        if (Math.abs(p.x) > SA.ARENA_HALF + 200 || p.life > p.maxLife) {
          if (p.returns && p.owner.rangedState) p.owner.rangedState.out = false;
          if (p.explode) this.explode(p, game);
          else this.kill(p);
          continue;
        }
      }
      this.count = n;
    }

    // swept box from last frame's position: fast bullets (40+ px per frame) cannot tunnel through a fighter
    rect(p) {
      const px = p.px === undefined ? p.x : p.px, py = p.py === undefined ? p.y : p.py;
      const x0 = Math.min(px, p.x), y0 = Math.min(py, p.y);
      return { x: x0 - p.w / 2, y: y0 - p.h / 2, w: Math.abs(p.x - px) + p.w, h: Math.abs(p.y - py) + p.h };
    }

    collide(p, f, game) {
      if (!f.canBeHit(p.owner)) return false;
      const hit = SA.Combat.hurtRegion(this.rect(p), f);
      if (!hit) return false;
      p.hitList.add(f);
      // beams / pillars stand still: they push away from their source
      const src = p.type === 'beam' ? p.owner.x : p.x;
      const dir = p.vx ? Math.sign(p.vx) : Math.sign(f.x - src) || 1;
      // energy shield (bosses) stops projectiles
      if (f.shieldT > 0) {
        SA.FX.block(game.particles, hit.x, hit.y, -dir, 0.6);
        SA.audio.play('shield');
        this.kill(p);
        return true;
      }
      const fromX = p.type === 'beam' ? p.owner.x : p.px === undefined ? p.x : p.px;
      const facingIt = Math.sign(fromX - f.x) === f.facing || Math.abs(fromX - f.x) < 10;
      const blocking = !p.unblockable && (f.state === 'block' || f.state === 'blockstun') && facingIt &&
        !(p.level === 'low' && !f.crouchBlock);
      if (blocking) {
        if (f.parryAge <= SA.PARRY_WINDOW && !NO_REFLECT[p.type]) {
          // parry reflects the projectile back to its owner
          p.owner = f;
          p.reflected = true;
          p.vx = -p.vx * 1.1;
          p.vy = -Math.abs(p.vy) * 0.3;
          p.hitList.clear();
          p.returns = false; p.returning = false;
          p.life = 0;
          f.parryLock = 0;
          f.addEnergy(10);
          SA.FX.parry(game.particles, hit.x, hit.y);
          SA.audio.play('parry');
          game.hitStop(5);
          game.label('REFLECT!', hit.x, hit.y - 80, '#ffe9a8', f, 1.1);
          return true;
        }
        const chip = Math.round(p.data.damage * SA.BALANCE.ranged.blockChip);
        f.hp = Math.max(1, f.hp - chip);
        f.setState('blockstun');
        f.stun = p.data.blockstun || 8;
        f.vx = dir * (p.data.kb || 150) * 0.5;
        f.addEnergy(3);
        SA.FX.block(game.particles, hit.x, hit.y, -dir, 0.5);
        SA.audio.play('block_metal', 0.5);
        game.hitStop(2);
        if (p.explode) this.explode(p, game);
        else if (!p.returns) this.kill(p);
        return true;
      }
      const owner = p.owner;
      SA.Combat.applyHit(owner, f, p.data, hit, game, { projectile: true, dir });
      if (p.explode) this.explode(p, game);
      else if (!p.pierce && !p.returns && p.type !== 'wave') this.kill(p);
      if (p.type === 'spirit' || p.type === 'orb') SA.FX.glyphBurst(game.particles, p.x, p.y, p.color, 3, 200);
      return true;
    }

    explode(p, game) {
      const ex = p.explode;
      SA.FX.explosion(game.particles, p.x, Math.min(p.y, -20), ex.r);
      SA.audio.play('explosion');
      game.shake(0.35);
      SA.Device.vibrate(20);
      for (const f of [game.p1, game.p2]) {
        if (f === p.owner || !f.canBeHit(p.owner)) continue;
        const cx = f.skel.hip.x, cy = f.skel.hip.y - 40;
        const d = Math.hypot(cx - p.x, cy - p.y);
        if (d > ex.r + 40) continue;
        const dir = Math.sign(f.x - p.x) || 1;
        const guarded = (f.state === 'block' || f.state === 'blockstun');
        const data = { id: 'explosion', damage: Math.round(ex.dmg * (guarded ? 0.3 : 1)), hitstun: 22, blockstun: 12, kb: 520, kbY: guarded ? 0 : -520,
          knockdown: !guarded, level: 'mid', hitstop: 5, shake: 0.3, sound: 'hit_heavy', power: 0.8, projectile: true };
        if (guarded) {
          f.hp = Math.max(1, f.hp - data.damage);
          f.setState('blockstun'); f.stun = 14; f.vx = dir * 300;
        } else {
          SA.Combat.applyHit(p.owner, f, data, { region: 'torso', x: cx, y: cy }, game, { projectile: true, dir });
        }
      }
      this.kill(p);
    }

    kill(p) { p.alive = false; }

    // ---------- drawing ----------
    draw(ctx) {
      for (const p of this.pool) {
        if (!p.alive) continue;
        ctx.save();
        ctx.translate(p.x, p.y);
        const dir = Math.sign(p.vx) || 1;
        switch (p.type) {
          case 'shuriken': {
            // spinning bronze scarab disc
            ctx.rotate(p.rot);
            ctx.fillStyle = '#b88a44';
            ctx.beginPath(); ctx.ellipse(0, 0, 15, 11, 0, 0, SA.TAU); ctx.fill();
            ctx.fillStyle = '#2fb8a0';
            ctx.beginPath(); ctx.ellipse(0, 0, 8, 6, 0, 0, SA.TAU); ctx.fill();
            ctx.strokeStyle = '#ffe2a0'; ctx.lineWidth = 1.5;
            ctx.beginPath(); ctx.moveTo(-15, 0); ctx.lineTo(15, 0); ctx.stroke();
            break;
          }
          case 'knife': case 'kunai': {
            ctx.rotate(Math.atan2(p.vy, p.vx));
            ctx.fillStyle = '#3a2616';
            ctx.fillRect(-18, -2.5, 16, 5);
            ctx.fillStyle = p.type === 'kunai' ? '#5a4a6a' : '#d8b066';
            ctx.beginPath(); ctx.moveTo(-2, -5); ctx.lineTo(18, 0); ctx.lineTo(-2, 5); ctx.closePath(); ctx.fill();
            if (p.type === 'kunai') { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.6; ctx.drawImage(SA.glowSprite('#9b6bff'), -12, -12, 24, 24); ctx.globalAlpha = 1; }
            if (p.explode) { ctx.globalCompositeOperation = 'lighter'; ctx.drawImage(SA.glowSprite('#ff7a2a'), -30, -12, 24, 24); }
            break;
          }
          case 'bolt': {
            // arrow with fletching
            ctx.rotate(Math.atan2(p.vy, p.vx));
            ctx.strokeStyle = '#6a4a2a'; ctx.lineWidth = 3;
            ctx.beginPath(); ctx.moveTo(-34, 0); ctx.lineTo(10, 0); ctx.stroke();
            ctx.fillStyle = '#c9a25a';
            ctx.beginPath(); ctx.moveTo(8, -5); ctx.lineTo(20, 0); ctx.lineTo(8, 5); ctx.closePath(); ctx.fill();
            ctx.fillStyle = '#e8dcc0';
            ctx.beginPath(); ctx.moveTo(-34, 0); ctx.lineTo(-40, -7); ctx.lineTo(-26, 0); ctx.lineTo(-40, 7); ctx.closePath(); ctx.fill();
            break;
          }
          case 'boomerang': {
            // Egyptian throwing stick
            ctx.rotate(p.rot);
            ctx.strokeStyle = '#8a5a2a'; ctx.lineWidth = 8; ctx.lineCap = 'round';
            ctx.beginPath(); ctx.arc(0, 0, 20, 0.2, 2.6); ctx.stroke();
            ctx.strokeStyle = '#e0b24a'; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.arc(0, 0, 20, 0.5, 2.3); ctx.stroke();
            break;
          }
          case 'bullet': case 'pellet': {
            ctx.globalCompositeOperation = 'lighter';
            if (p.type === 'pellet') {
              // sand shards
              ctx.fillStyle = '#e8c884';
              ctx.beginPath(); ctx.moveTo(6, 0); ctx.lineTo(-dir * 16, -4); ctx.lineTo(-dir * 12, 4); ctx.closePath(); ctx.fill();
              ctx.globalAlpha = 0.5; ctx.drawImage(SA.glowSprite('#ffcf8a'), -12, -12, 24, 24);
            } else if (p.sourceId === 'revolver') {
              // lightning of Set: jagged bolt
              ctx.strokeStyle = '#bfe0ff'; ctx.lineWidth = 3; ctx.lineCap = 'round';
              ctx.beginPath(); ctx.moveTo(0, 0);
              for (let i = 1; i <= 5; i++) ctx.lineTo(-dir * i * 11, (i % 2 ? -7 : 7) * Math.random());
              ctx.stroke();
              ctx.drawImage(SA.glowSprite('#7ab8ff'), -20, -20, 40, 40);
            } else {
              // sunlight bolt (Eye of Ra)
              ctx.strokeStyle = '#fff1c2'; ctx.lineWidth = 5; ctx.lineCap = 'round';
              ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-dir * 46, 0); ctx.stroke();
              ctx.drawImage(SA.glowSprite('#ffc861'), -18, -18, 36, 36);
            }
            break;
          }
          case 'energy': {
            // divine light (Ankh of Radiance) or serpent venom (green)
            ctx.globalCompositeOperation = 'lighter';
            const c = p.color && p.color !== '#ffffff' ? p.color : '#ffd27a';
            ctx.drawImage(SA.glowSprite(c), -30, -30, 60, 60);
            ctx.fillStyle = '#fffbe8'; ctx.beginPath(); ctx.arc(0, 0, 7, 0, SA.TAU); ctx.fill();
            break;
          }
          case 'rocket': {
            ctx.rotate(Math.atan2(p.vy, p.vx));
            ctx.fillStyle = '#23232b'; ctx.fillRect(-16, -6, 30, 12);
            ctx.fillStyle = '#d7263d'; ctx.beginPath(); ctx.moveTo(14, -6); ctx.lineTo(24, 0); ctx.lineTo(14, 6); ctx.fill();
            ctx.globalCompositeOperation = 'lighter';
            ctx.drawImage(SA.glowSprite('#ff8a2a'), -40, -14, 28, 28);
            break;
          }
          case 'wave': {
            ctx.globalCompositeOperation = 'lighter';
            ctx.scale(dir, 1);
            ctx.globalAlpha = clamp(1 - p.life / p.maxLife + 0.3, 0, 1);
            ctx.strokeStyle = p.color; ctx.lineWidth = 16;
            ctx.beginPath(); ctx.arc(-40, 0, p.h * 0.55, -1.1, 1.1); ctx.stroke();
            ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 5;
            ctx.beginPath(); ctx.arc(-34, 0, p.h * 0.55, -1.0, 1.0); ctx.stroke();
            ctx.drawImage(SA.glowSprite(p.color), -p.w, -p.h * 0.7, p.w * 2, p.h * 1.4);
            break;
          }
          case 'spirit': {
            // wailing soul: glowing head with a tail that follows its flight
            ctx.globalCompositeOperation = 'lighter';
            ctx.rotate(Math.atan2(p.vy, p.vx));
            ctx.drawImage(SA.glowSprite(p.color), -34, -24, 68, 48);
            ctx.globalAlpha = 0.7;
            ctx.fillStyle = p.color;
            ctx.beginPath(); ctx.moveTo(10, -9); ctx.quadraticCurveTo(-30, -6 + Math.sin(p.life * 30) * 6, -46, 0); ctx.quadraticCurveTo(-30, 6, 10, 9); ctx.closePath(); ctx.fill();
            ctx.globalAlpha = 1;
            ctx.fillStyle = '#ffffff';
            ctx.beginPath(); ctx.arc(8, 0, 7, 0, SA.TAU); ctx.fill();
            break;
          }
          case 'orb': {
            ctx.globalCompositeOperation = 'lighter';
            const r = 16 + Math.sin(p.life * 18) * 2;
            ctx.drawImage(SA.glowSprite(p.color), -44, -44, 88, 88);
            ctx.fillStyle = '#fff4c8'; ctx.beginPath(); ctx.arc(0, 0, r * 0.6, 0, SA.TAU); ctx.fill();
            ctx.strokeStyle = p.color; ctx.lineWidth = 3;
            for (let i = 0; i < 6; i++) { const a = p.life * 4 + i * SA.TAU / 6; ctx.beginPath(); ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r); ctx.lineTo(Math.cos(a) * r * 1.6, Math.sin(a) * r * 1.6); ctx.stroke(); }
            break;
          }
          case 'wind': {
            ctx.globalCompositeOperation = 'lighter';
            ctx.scale(dir, 1);
            ctx.strokeStyle = p.color; ctx.lineWidth = 4; ctx.globalAlpha = 0.85;
            for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(-10 - i * 14, 0, 18 - i * 3, -1.3, 1.3); ctx.stroke(); }
            ctx.drawImage(SA.glowSprite(p.color), -50, -26, 80, 52);
            break;
          }
          case 'sand': {
            ctx.fillStyle = '#c8a060'; ctx.globalAlpha = 0.9;
            for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.arc(-i * 9 * dir, Math.sin(i * 2 + p.life * 20) * 6, 5 - i * 0.6, 0, SA.TAU); ctx.fill(); }
            break;
          }
          case 'beam': {
            // Ra's sun beam; a thin flickering line first (the warning), then the burning ray
            ctx.globalCompositeOperation = 'lighter';
            if (p.warn) {
              ctx.globalAlpha = 0.35 + 0.35 * Math.abs(Math.sin(p.life * 30));
              ctx.fillStyle = p.color; ctx.fillRect(-p.w / 2, -2, p.w, 4);
            } else {
              const k = clamp(1 - p.life / p.maxLife, 0, 1);
              ctx.globalAlpha = 0.5 + 0.5 * k;
              ctx.fillStyle = p.color; ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
              ctx.fillStyle = '#fffbe8'; ctx.fillRect(-p.w / 2, -p.h * 0.18, p.w, p.h * 0.36);
              ctx.drawImage(SA.glowSprite(p.color), -p.w / 2, -p.h * 1.6, p.w, p.h * 3.2);
            }
            break;
          }
          case 'pillar': {
            // lightning of Set: a jagged bolt from the sky down to the floor
            ctx.globalCompositeOperation = 'lighter';
            if (p.warn) {
              const k = p.life / p.maxLife;
              ctx.globalAlpha = (0.12 + 0.25 * k) * (0.6 + 0.4 * Math.abs(Math.sin(p.life * (12 + 30 * k))));
              ctx.fillStyle = p.color;
              ctx.fillRect(-(8 + 50 * k), -p.h / 2, 16 + 100 * k, p.h);
              ctx.globalAlpha = 0.5 + 0.4 * k;
              ctx.drawImage(SA.glowSprite(p.color), -90, p.h / 2 - 50, 180, 70);
              break;
            }
            ctx.globalAlpha = clamp(1 - p.life / p.maxLife + 0.2, 0, 1);
            ctx.drawImage(SA.glowSprite(p.color), -110, -p.h / 2, 220, p.h);
            ctx.strokeStyle = '#f4e8ff'; ctx.lineWidth = 7; ctx.lineJoin = 'round';
            ctx.beginPath();
            let x = 0;
            for (let y = -p.h / 2; y <= p.h / 2; y += 60) { ctx.lineTo(x, y); x = rand(-22, 22); }
            ctx.stroke();
            ctx.strokeStyle = p.color; ctx.lineWidth = 16; ctx.globalAlpha *= 0.4; ctx.stroke();
            break;
          }
          case 'shockwave': {
            ctx.globalCompositeOperation = 'lighter';
            ctx.globalAlpha = clamp(1 - p.life / p.maxLife, 0, 1);
            ctx.scale(dir, 1);
            ctx.fillStyle = p.color;
            ctx.beginPath(); ctx.moveTo(-50, 34); ctx.quadraticCurveTo(0, -70, 40, 34); ctx.closePath(); ctx.fill();
            ctx.drawImage(SA.glowSprite(p.color), -80, -60, 160, 120);
            break;
          }
        }
        ctx.restore();
      }
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
    }
  }

  SA.ProjectileSystem = ProjectileSystem;
})(window.SA);
