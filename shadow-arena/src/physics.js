'use strict';
/* Gravity, ground, walls and body separation (push boxes). */
(function (SA) {
  const BODY_WIDTH = 70;

  SA.Physics = {
    integrate(f, dt, game) {
      if (f.state === 'rushed') return;
      if (!f.grounded) f.vy += SA.GRAVITY * dt;
      f.x += f.vx * dt;
      f.y += f.vy * dt;
      if (!f.grounded) {
        if (f.y >= 0 && f.vy >= 0) {
          const impact = f.vy;
          f.y = 0;
          f.onLand(game, impact);
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

    // Keeps two fighters from overlapping. Airborne fighters can pass over each other.
    separate(a, b) {
      if (a.state === 'rushed' || b.state === 'rushed') return;
      const lying = (f) => f.state === 'down' || f.state === 'ko';
      if (lying(a) || lying(b)) return;
      if (Math.abs(a.y - b.y) > 150) return;
      const dx = b.x - a.x;
      const ad = Math.abs(dx);
      const minD = BODY_WIDTH * ((a.look.bulk || 1) + (b.look.bulk || 1)) / 2;
      if (ad >= minD) return;
      const dir = ad > 0.01 ? Math.sign(dx) : (a.x < 0 ? 1 : -1);
      const push = (minD - ad) / 2;
      a.x -= dir * push;
      b.x += dir * push;
      // if one side is pinned by a wall, the other takes the full correction
      for (const [f, o, s] of [[a, b, -dir], [b, a, dir]]) {
        if (Math.abs(f.x) > SA.WALL) {
          const over = Math.abs(f.x) - SA.WALL;
          f.x = Math.sign(f.x) * SA.WALL;
          o.x -= s * over;
        }
      }
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
