'use strict';
/*
 * Gravity, ground, walls and body collision.
 *
 * Three separate volumes per fighter:
 *   body collider  (fighter.body)    – simplified movement volume, keeps the two fighters apart
 *   hurtboxes      (fighter.hurt)    – head / torso / legs, follow the skeleton, receive hits
 *   attack hitbox  (activeHit())     – weapon / limb volumes that may reach into the opponent's space
 *
 * Body separation is resolved once per tick after both fighters moved:
 *   overlap = minimumDistance - actualDistance
 * The correction is split by who is walking into whom (the mover takes most of it), a fighter pinned
 * at the wall never moves further out, and large overlaps (someone getting up inside the other) are
 * resolved softly over a few frames so nothing snaps. A fighter whose feet are above the other's
 * mid-body passes over it (cross-up), rolls pass under/through.
 */
(function (SA) {
  const { clamp } = SA.M;

  const BODY_W = 108;         // collider width at scale 1, bulk 1
  const BODY_H = 250;         // standing collider height
  const CROUCH_H = 170;
  const LYING_H = 70;
  const MAX_STEP = 26;        // max correction per tick for deep overlaps (soft resolve, no snapping)
  const OTHER_SHARE = 0.12;
  const FAST_FALL = 1650;
  const EDGE = 10;            // feet may overhang a platform edge this much   // share of the correction the standing fighter takes when only one walks

  // A fighter's movement collider (width/height in world px), cached per state.
  function bodyOf(f) {
    const s = f.look.scale, bulk = f.look.bulk || 1;
    const b = f._body || (f._body = { w: 0, h: 0, pass: false });
    b.w = BODY_W * s * (0.55 + 0.45 * bulk);
    const st = f.state;
    if (st === 'down' || st === 'ko') b.h = LYING_H * s;
    else if (f.isCrouching() || st === 'roll' || st === 'slide') b.h = CROUCH_H * s;
    else b.h = BODY_H * s;
    // states that pass through the other body
    b.pass = st === 'rushed' || st === 'ko' || (st === 'roll' && f.st < (f.rollThrough || 18)) || !!f.vanished ||
      (st === 'bossmove' && !!f.bm && f.bm.pass);
    return b;
  }

  SA.Physics = {
    BODY_W,
    bodyOf,
    minDistance(a, b) { return (bodyOf(a).w + bodyOf(b).w) / 2; },
    pairSide: 0,
    platforms: null,          // the arena's one-way platforms [{x, y (top), w}], set per fight

    // top of the floor below (x, y): the highest platform under that point, else the ground (0)
    floorAt(x, y) {
      let top = 0;
      const P = this.platforms;
      if (P) for (let i = 0; i < P.length; i++) {
        const p = P[i];
        if (p.y >= y - 1 && p.y < top && Math.abs(x - p.x) <= p.w / 2) top = p.y;
      }
      return top;
    },

    integrate(f, dt, game) {
      if (f.state === 'rushed') return;
      // falling is a bit faster than rising: snappy, weighty jumps
      if (!f.grounded) f.vy += SA.GRAVITY * (f.vy > 0 ? 1.18 : 1) * (f.gravMul === undefined ? 1 : f.gravMul) * dt;
      // fast fall (joystick down in the air): a hard, steady drop
      if (f.fastFall && !f.grounded && f.gravMul !== 0) f.vy = Math.max(f.vy, FAST_FALL);
      const y0 = f.y;
      f.x += f.vx * dt;
      f.y += f.vy * dt;
      if (f.dropT > 0) f.dropT -= dt * 60;
      if (!f.grounded) {
        // one-way platforms: only landed on from above while falling (jump through from below,
        // fast fall / drop-through ignore them for a moment)
        const P = this.platforms;
        if (P && f.vy >= 0 && !f.fastFall && !(f.dropT > 0)) {
          for (let i = 0; i < P.length; i++) {
            const p = P[i];
            if (y0 <= p.y + 0.5 && f.y >= p.y && Math.abs(f.x - p.x) <= p.w / 2 + EDGE) {
              const impact = f.vy;
              f.y = p.y;
              f.plat = p;
              f.onLand(game, impact);
              break;
            }
          }
        }
        if (!f.grounded && f.y >= 0 && f.vy >= 0) {
          const impact = f.vy;
          f.y = 0;
          f.plat = null;
          f.onLand(game, impact);
        }
      } else if (f.plat) {
        const p = f.plat;
        if (f.dropT > 0 || Math.abs(f.x - p.x) > p.w / 2 + EDGE) {
          // walked / dashed / rolled off the edge, or dropped through: falling, never stuck
          f.plat = null;
          f.grounded = false;
          f.y = p.y + (f.dropT > 0 ? 2 : 0);
          if (f.vy < 0) f.vy = 0;
          if (f.leaveGround) f.leaveGround(game);
        } else {
          f.y = p.y;
        }
      } else {
        f.y = 0;
      }

      if (f.x < -SA.WALL || f.x > SA.WALL) {
        const side = f.x < 0 ? -1 : 1;
        f.x = side * SA.WALL;
        if (f.state === 'launched' && f.vx * side > 350) {
          // wall bounce
          f.vx = -f.vx * 0.35;
          if (game) {
            SA.FX.dust(game.particles, f.x + side * 20, f.y - 150, 0.9, -side);
            game.shake(0.3);
            SA.audio.play('knockdown', 0.6);
          }
        } else if (f.vx * side > 0) {
          f.vx = 0;
        }
      }
    },

    // Keeps the two bodies from overlapping. Returns the resolved overlap (for debug).
    separate(a, b) {
      const A = bodyOf(a), B = bodyOf(b);
      const dx = b.x - a.x;
      if (Math.abs(dx) > 2) this.pairSide = Math.sign(dx);
      if (A.pass || B.pass) return 0;
      // vertical: whoever's feet are above the other's mid body sails over it
      if (a.y < b.y - B.h * 0.5 || b.y < a.y - A.h * 0.5) return 0;

      const minD = (A.w + B.w) / 2;
      const ad = Math.abs(dx);
      const overlap = minD - ad;
      if (overlap <= 0) return 0;

      // direction a -> b. Directly on top of each other: keep the last known sides; a fighter
      // landing from a jump keeps travelling the way it jumped.
      let dir;
      if (ad > 2) dir = Math.sign(dx);
      else if (!a.grounded && Math.abs(a.vx) > 50) dir = Math.sign(a.vx);
      else if (!b.grounded && Math.abs(b.vx) > 50) dir = -Math.sign(b.vx);
      else dir = this.pairSide || (a.x < b.x ? 1 : -1);

      // who is walking into whom
      const va = Math.max(0, a.vx * dir), vb = Math.max(0, -b.vx * dir);
      let wa, wb;
      if (va + vb < 30) { wa = 0.5; wb = 0.5; }
      else {
        wa = va / (va + vb);
        wa = clamp(wa, OTHER_SHARE, 1 - OTHER_SHARE);
        wb = 1 - wa;
      }
      // nobody stands on a lying fighter: the one on its feet steps off completely, right away
      const lyingA = a.state === 'down', lyingB = b.state === 'down';
      if (lyingA !== lyingB) { wa = lyingA ? 0 : 1; wb = 1 - wa; }
      // soft resolve only for overlaps that already existed last frame (getting up inside someone);
      // overlap created by this frame's movement (dashes, rushes, landings) is removed completely
      const prevOverlap = minD - Math.abs((b.prevX === undefined ? b.x : b.prevX) - (a.prevX === undefined ? a.x : a.prevX));
      const soft = prevOverlap > 2 && lyingA === lyingB;
      const step = soft ? Math.min(overlap, MAX_STEP + Math.max(0, overlap - 90) * 0.5) : overlap;
      let ca = step * wa, cb = step * wb;

      // wall: a pinned fighter can't be pushed further out; the other takes the rest
      const aOut = a.x - dir * ca, bOut = b.x + dir * cb;
      if (Math.abs(aOut) > SA.WALL) { const over = Math.abs(aOut) - SA.WALL; ca -= over; cb += over; }
      if (Math.abs(bOut) > SA.WALL) { const over = Math.abs(bOut) - SA.WALL; cb -= over; ca += over; }
      a.x -= dir * ca;
      b.x += dir * cb;
      a.x = clamp(a.x, -SA.WALL, SA.WALL);
      b.x = clamp(b.x, -SA.WALL, SA.WALL);

      // stop pushing into each other: remove the approach component of the velocities
      // (the walk/dash code re-applies its own speed next tick, so this never feels sticky)
      // airborne fighters keep their momentum (a flip over the enemy still clears it a moment later)
      if (va > 0 && a.grounded) a.vx -= dir * va;
      if (vb > 0 && b.grounded) b.vx += dir * vb;
      return overlap;
    },

    // Invisible camera wall: fighters can't get further apart than the camera can show.
    limitSeparation(a, b) {
      const d = Math.abs(a.x - b.x);
      if (d <= SA.MAX_SEPARATION) return;
      const excess = (d - SA.MAX_SEPARATION) / 2;
      const dir = Math.sign(b.x - a.x);
      a.x += dir * excess;
      b.x -= dir * excess;
    },
  };
})(window.SA);
