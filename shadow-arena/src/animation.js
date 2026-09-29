'use strict';
/*
 * Skeletal animation.
 * A pose is a set of joint angles in facing-local space (x = forward, y = down).
 * dir(a) = (sin a, cos a): a = 0 points down, PI/2 forward, PI up, -PI/2 backward.
 *   torso  : lean of the spine from vertical (+ = forward)
 *   aX1    : upper arm absolute angle, aX2: elbow bend (forearm relative, + = bends up/forward)
 *   lX1    : thigh absolute angle, lX2: knee bend (shin relative, - = bends backward)
 *   rot    : whole-body rotation around the hip (knockdowns, get-ups)
 * After the joints are solved, the body is "ground snapped": its lowest point is placed on
 * the fighter's y. This keeps feet planted, lets crouches sink naturally and makes lying
 * and getting up physically plausible without hand-tuned offsets.
 */
(function (SA) {
  const { lerp, clamp, damp } = SA.M;

  const DIM = SA.DIM = {
    torso: 98, neck: 12, headR: 21,
    upperArm: 60, lowerArm: 56,
    thigh: 80, shin: 78, foot: 22,
  };

  const KEYS = ['hipX', 'torso', 'head', 'aF1', 'aF2', 'aB1', 'aB2', 'lF1', 'lF2', 'lB1', 'lB2', 'rot'];
  const POINTS = ['hip', 'neck', 'head', 'sh', 'elbF', 'handF', 'elbB', 'handB', 'kneeF', 'footF', 'toeF', 'kneeB', 'footB', 'toeB'];
  // radius used for ground contact per joint
  const CONTACT = { hip: 15, neck: 12, head: 21, handF: 8, handB: 8, elbF: 8, elbB: 8, kneeF: 10, kneeB: 10, footF: 5, footB: 5, toeF: 4, toeB: 4, sh: 12 };

  const STANCE = {
    hipX: 0, torso: 0.12, head: 0.05,
    aF1: 0.55, aF2: 1.95, aB1: 0.25, aB2: 2.25,
    lF1: 0.55, lF2: -0.8, lB1: -0.4, lB2: -0.05,
    rot: 0,
  };

  function P(over, base) {
    const p = Object.assign({}, base || STANCE);
    if (over) Object.assign(p, over);
    return p;
  }

  const POSES = SA.POSES = {
    stance: P(),
    crouch: P({ torso: 0.66, head: 0.15, aF1: 0.8, aF2: 1.85, aB1: 0.5, aB2: 2.2, lF1: 1.15, lF2: -2.1, lB1: 0.15, lB2: -1.72 }),
    prejump: P({ torso: 0.3, lF1: 0.8, lF2: -1.3, lB1: -0.05, lB2: -1.1, aF1: 0.3, aF2: 1.6, aB1: -0.2, aB2: 1.6 }),
    jump: P({ torso: 0.2, aF1: 0.95, aF2: 1.55, aB1: -0.5, aB2: 1.3, lF1: 1.15, lF2: -1.75, lB1: 0.25, lB2: -1.45 }),
    fall: P({ torso: 0.05, aF1: 1.35, aF2: 0.7, aB1: -0.9, aB2: 0.6, lF1: 0.55, lF2: -0.7, lB1: -0.2, lB2: -0.5 }),
    block: P({ torso: 0.02, head: 0.25, aF1: 1.3, aF2: 2.45, aB1: 0.95, aB2: 2.5, lF1: 0.6, lF2: -0.9, lB1: -0.42, lB2: -0.08 }),
    crouchBlock: P({ torso: 0.6, head: 0.3, aF1: 1.25, aF2: 2.3, aB1: 0.9, aB2: 2.45, lF1: 1.15, lF2: -2.1, lB1: 0.15, lB2: -1.72 }),
    dash: P({ torso: 0.6, head: -0.1, aF1: 0.9, aF2: 1.5, aB1: -0.6, aB2: 1.2, lF1: 1.0, lF2: -1.2, lB1: -0.7, lB2: -0.6 }),
    evade: P({ torso: -0.3, head: 0.1, aF1: 0.9, aF2: 2.2, aB1: 0.5, aB2: 2.3, lF1: 0.7, lF2: -1.0, lB1: -0.15, lB2: -0.9 }),
    hitHigh: P({ torso: -0.45, head: -0.5, aF1: 1.0, aF2: 0.9, aB1: -0.5, aB2: 0.8, lF1: 0.3, lF2: -0.2, lB1: -0.5, lB2: -0.3 }),
    hitBody: P({ torso: 0.65, head: 0.35, aF1: 0.3, aF2: 1.5, aB1: 0.15, aB2: 1.6, lF1: 0.45, lF2: -0.7, lB1: -0.35, lB2: -0.6 }),
    hitLow: P({ torso: 0.25, head: 0.2, aF1: 1.1, aF2: 0.8, aB1: -0.7, aB2: 0.9, lF1: 0.05, lF2: -0.9, lB1: -0.5, lB2: -0.2 }),
    stagger: P({ torso: -0.5, head: -0.45, aF1: 1.9, aF2: 0.4, aB1: -1.5, aB2: 0.4, lF1: 0.5, lF2: -0.3, lB1: -0.25, lB2: -0.6 }),
    launch: P({ torso: -0.5, head: -0.5, aF1: 2.3, aF2: 0.5, aB1: -1.7, aB2: 0.6, lF1: 0.9, lF2: -0.9, lB1: 0.3, lB2: -1.2 }),
    down: P({ torso: 0, head: -0.1, aF1: 0.5, aF2: 1.2, aB1: 0.05, aB2: 0.1, lF1: 0.5, lF2: -1.0, lB1: 0.0, lB2: -0.05, rot: -1.57 }),
    ko: P({ torso: 0, head: -0.35, aF1: 2.8, aF2: 0.3, aB1: 0.1, aB2: 0.2, lF1: 0.25, lF2: -0.5, lB1: 0.0, lB2: 0.0, rot: -1.57 }),
    sit: P({ torso: 0.3, head: 0.1, aF1: 0.9, aF2: 1.2, aB1: -0.9, aB2: 0.0, lF1: 2.0, lF2: -1.0, lB1: 1.5, lB2: -3.0, rot: 0 }),
    victory: P({ torso: -0.05, head: -0.15, aF1: 2.95, aF2: 0.25, aB1: 0.15, aB2: 2.0, lF1: 0.22, lF2: -0.08, lB1: -0.22, lB2: -0.08 }),
    victory2: P({ torso: 0.35, head: 0.3, aF1: 1.0, aF2: 2.35, aB1: 1.0, aB2: 2.35, lF1: 0.05, lF2: -0.02, lB1: -0.05, lB2: -0.02 }),
    defeat: P({ torso: 0.9, head: 0.6, aF1: 0.15, aF2: 0.1, aB1: 0.05, aB2: 0.15, lF1: 1.2, lF2: -2.2, lB1: 0.15, lB2: -1.72 }),
    special: P({ torso: 0.2, head: 0.1, aF1: 0.3, aF2: 2.6, aB1: -0.2, aB2: 2.6, lF1: 0.75, lF2: -1.0, lB1: -0.55, lB2: -0.6 }),
    rushDash: P({ torso: 0.75, head: -0.2, aF1: 1.55, aF2: 0.1, aB1: -0.9, aB2: 0.4, lF1: 1.2, lF2: -1.0, lB1: -0.9, lB2: -0.3 }),
  };

  // ---------- pose math ----------
  function copyPose(dst, src) {
    for (const k of KEYS) dst[k] = src[k];
    return dst;
  }
  function lerpPose(out, a, b, t) {
    for (const k of KEYS) out[k] = a[k] + (b[k] - a[k]) * t;
    return out;
  }
  function dampPose(cur, target, k, dt) {
    const f = 1 - Math.exp(-k * dt);
    for (const key of KEYS) cur[key] += (target[key] - cur[key]) * f;
  }

  const EASE = {
    linear: (t) => t,
    smooth: SA.M.smooth,
    out: SA.M.easeOutCubic,
    in: SA.M.easeInCubic,
    back: SA.M.easeOutBack,
  };

  // keys: [[frame, pose, easeName?], ...]; ease applies to the segment ending at that key
  function sampleKeys(keys, t, out) {
    if (t <= keys[0][0]) return copyPose(out, keys[0][1]);
    for (let i = 1; i < keys.length; i++) {
      const k1 = keys[i];
      if (t <= k1[0]) {
        const k0 = keys[i - 1];
        const span = k1[0] - k0[0];
        const u = span <= 0 ? 1 : (t - k0[0]) / span;
        const e = EASE[k1[2] || 'smooth'](clamp(u, 0, 1));
        return lerpPose(out, k0[1], k1[1], e);
      }
    }
    return copyPose(out, keys[keys.length - 1][1]);
  }

  // ---------- procedural locomotion ----------
  const tmp = P();
  function idlePose(t, out) {
    const b = Math.sin(t * 2.3);
    copyPose(out, STANCE);
    out.torso += b * 0.018;
    out.head += Math.sin(t * 2.3 - 0.6) * 0.03;
    out.aF2 += b * 0.07;
    out.aB2 += Math.sin(t * 2.3 + 0.8) * 0.06;
    out.lF2 -= (b + 1) * 0.06;
    out.lB2 -= (b + 1) * 0.06;
    out.lF1 += (b + 1) * 0.025;
    return out;
  }
  function walkPose(phase, dir, out) {
    copyPose(out, STANCE);
    const s = Math.sin(phase), c = Math.cos(phase);
    out.lF1 = 0.55 + s * 0.3;
    out.lB1 = -0.4 - s * 0.26;
    out.lF2 = -0.8 - Math.max(0, c * dir) * 0.5;
    out.lB2 = -0.05 - Math.max(0, -c * dir) * 0.75;
    out.torso = dir > 0 ? 0.2 : 0.02;
    out.aF1 += s * 0.06;
    out.aB1 -= s * 0.06;
    out.hipX = dir > 0 ? 4 : -4;
    return out;
  }
  function runPose(phase, out) {
    copyPose(out, STANCE);
    const s = Math.sin(phase);
    const leg = (ph) => [0.35 + 0.9 * Math.sin(ph), -0.3 - 1.4 * Math.max(0, Math.cos(ph))];
    const f = leg(phase), b = leg(phase + Math.PI);
    out.lF1 = f[0]; out.lF2 = f[1];
    out.lB1 = b[0]; out.lB2 = b[1];
    out.torso = 0.5;
    out.head = -0.15;
    out.aF1 = 0.6 - 0.9 * s; out.aF2 = 1.7;
    out.aB1 = 0.6 + 0.9 * s; out.aB2 = 1.7;
    return out;
  }

  // ---------- skeleton solve ----------
  function createSkeleton() {
    const s = {};
    for (const p of POINTS) s[p] = { x: 0, y: 0 };
    return s;
  }

  function place(p, from, ang, len) {
    p.x = from.x + Math.sin(ang) * len;
    p.y = from.y + Math.cos(ang) * len;
  }

  // Solves the pose into facing-local coordinates (x forward), snapped so the lowest point is y=0.
  function solveLocal(pose, S, bulk) {
    const d = DIM;
    const hip = S.hip;
    hip.x = pose.hipX; hip.y = 0;
    const t = pose.torso;
    const tx = Math.sin(t), ty = -Math.cos(t);
    S.neck.x = hip.x + tx * d.torso; S.neck.y = hip.y + ty * d.torso;
    S.sh.x = hip.x + tx * (d.torso - 10); S.sh.y = hip.y + ty * (d.torso - 10);
    const ha = t + pose.head * 0.6;
    S.head.x = S.neck.x + Math.sin(ha) * (d.neck + d.headR);
    S.head.y = S.neck.y - Math.cos(ha) * (d.neck + d.headR);

    place(S.elbF, S.sh, pose.aF1, d.upperArm);
    place(S.handF, S.elbF, pose.aF1 + pose.aF2, d.lowerArm);
    place(S.elbB, S.sh, pose.aB1, d.upperArm);
    place(S.handB, S.elbB, pose.aB1 + pose.aB2, d.lowerArm);

    place(S.kneeF, hip, pose.lF1, d.thigh);
    const shinF = pose.lF1 + pose.lF2;
    place(S.footF, S.kneeF, shinF, d.shin);
    place(S.toeF, S.footF, Math.max(shinF + 1.45, 1.5), d.foot);
    place(S.kneeB, hip, pose.lB1, d.thigh);
    const shinB = pose.lB1 + pose.lB2;
    place(S.footB, S.kneeB, shinB, d.shin);
    place(S.toeB, S.footB, Math.max(shinB + 1.45, 1.5), d.foot);

    if (pose.rot) {
      const c = Math.cos(pose.rot), s = Math.sin(pose.rot);
      for (const k of POINTS) {
        if (k === 'hip') continue;
        const p = S[k];
        const x = p.x - hip.x, y = p.y - hip.y;
        p.x = hip.x + x * c - y * s;
        p.y = hip.y + x * s + y * c;
      }
    }

    let maxY = -Infinity;
    for (const k of POINTS) {
      const v = S[k].y + CONTACT[k] * (bulk || 1);
      if (v > maxY) maxY = v;
    }
    for (const k of POINTS) S[k].y -= maxY;
    return S;
  }

  // Local -> world with facing, spin (x scale) and squash.
  function toWorld(f) {
    const L = f.local, Wd = f.skel;
    const sx = f.facing * f.spinScale * f.scaleX * f.look.scale;
    const sy = f.scaleY * f.look.scale;
    for (const k of POINTS) {
      Wd[k].x = f.x + L[k].x * sx;
      Wd[k].y = f.y + L[k].y * sy;
    }
  }

  // ---------- per-state animation driver ----------
  const target = P();
  const sampled = P();

  function update(f, ts) {
    const dt = SA.STEP * ts;
    let k = 18;
    let direct = false;
    const st = f.state;
    f.animTime += dt;

    let name = st;
    if (st === 'idle' || st === 'intro') {
      idlePose(f.animTime, target);
    } else if (st === 'walk') {
      f.walkPhase += dt * (f.walkDir > 0 ? 10.5 : 9);
      walkPose(f.walkPhase * f.walkDir, f.walkDir, target);
      name = f.walkDir > 0 ? 'walk' : 'backwalk';
      k = 16;
    } else if (st === 'run') {
      f.walkPhase += dt * 15;
      runPose(f.walkPhase, target);
      k = 20;
    } else if (st === 'crouch') {
      copyPose(target, POSES.crouch);
      target.torso += Math.sin(f.animTime * 2.3) * 0.02;
      k = 34;
    } else if (st === 'block' || st === 'blockstun') {
      copyPose(target, f.crouchBlock ? POSES.crouchBlock : POSES.block);
      if (st === 'blockstun') { target.torso -= 0.15; target.head += 0.1; }
      k = 34;
    } else if (st === 'prejump' || st === 'landing') {
      copyPose(target, POSES.prejump);
      k = 30;
    } else if (st === 'air') {
      const u = clamp((f.vy + 900) / 1600, 0, 1);
      lerpPose(target, POSES.jump, POSES.fall, u);
      name = f.vy < 0 ? 'jump' : 'fall';
      if (f.jumpDir !== 0) target.torso += 0.15 * f.jumpDir;
      k = 12;
    } else if (st === 'dash') {
      runPose(f.walkPhase += dt * 16, tmp);
      lerpPose(target, POSES.dash, tmp, 0.35);
      k = 24;
    } else if (st === 'evade') {
      copyPose(target, POSES.evade);
      k = 26;
    } else if (st === 'hitstun') {
      const w = clamp(f.stun / 8, 0, 1);
      lerpPose(target, POSES.stance, POSES[f.hitPose] || POSES.hitBody, w);
      name = 'hit:' + f.hitPose;
      k = 22;
    } else if (st === 'stagger') {
      copyPose(target, POSES.stagger);
      target.torso += Math.sin(f.animTime * 11) * 0.12;
      target.aF1 += Math.sin(f.animTime * 9) * 0.3;
      target.aB1 -= Math.sin(f.animTime * 8) * 0.3;
      k = 14;
    } else if (st === 'launched' || st === 'rushed') {
      copyPose(target, POSES.launch);
      target.rot = f.grounded ? -1.57 : clamp(-0.4 - f.airTime * 3.2, -1.7, -0.3);
      if (st === 'rushed') target.rot = -0.25 + Math.sin(f.animTime * 20) * 0.1;
      target.aF1 += Math.sin(f.animTime * 14) * 0.4;
      k = 12;
    } else if (st === 'down' || st === 'ko') {
      copyPose(target, st === 'ko' && f.st > 20 ? POSES.ko : POSES.down);
      name = 'knockdown';
      k = 10;
    } else if (st === 'getup') {
      sampleKeys(GETUP, f.st, target);
      direct = true;
    } else if (st === 'victory') {
      sampleKeys(f.look.victory === 2 ? VICTORY2 : VICTORY, f.st, target);
      target.torso += Math.sin(f.animTime * 2) * 0.02;
      k = 12;
    } else if (st === 'defeat') {
      copyPose(target, POSES.defeat);
      target.torso += Math.sin(f.animTime * 1.7) * 0.03;
      k = 5;
    } else if ((st === 'attack' || st === 'special') && f.animKeys) {
      sampleKeys(f.animKeys, f.mt, sampled);
      name = f.move ? f.move.id : f.sp ? 'special:' + f.sp.phase : st;
      const blend = f.move && f.move.blend !== undefined ? f.move.blend : 2;
      const w = blend <= 0 ? 1 : clamp(f.mt / blend, 0, 1);
      lerpPose(target, f.entryPose, sampled, SA.M.smooth(w));
      direct = true;
    } else {
      idlePose(f.animTime, target);
    }

    f.animName = name;
    if (direct) copyPose(f.pose, target);
    else dampPose(f.pose, target, k, dt);

    // spin illusion (x scale flips through zero)
    if (f.spin) {
      const [a, b] = f.spin;
      const u = clamp((f.mt - a) / (b - a), 0, 1);
      f.spinScale = u > 0 && u < 1 ? Math.cos(u * SA.TAU) : 1;
      if (Math.abs(f.spinScale) < 0.15) f.spinScale = f.spinScale < 0 ? -0.15 : 0.15;
    } else {
      f.spinScale = 1;
    }

    // squash & stretch relax
    f.scaleY = damp(f.scaleY, 1, 14, dt);
    f.scaleX = damp(f.scaleX, 1, 14, dt);

    solveLocal(f.pose, f.local, f.look.bulk);
  }

  const GETUP = [
    [0, POSES.down],
    [9, POSES.sit, 'smooth'],
    [17, POSES.crouch, 'smooth'],
    [24, POSES.stance, 'out'],
  ];
  const VICTORY = [[0, POSES.stance], [14, POSES.victory, 'back'], [999, POSES.victory]];
  const VICTORY2 = [[0, POSES.stance], [16, POSES.victory2, 'smooth'], [999, POSES.victory2]];

  SA.Anim = {
    KEYS, POINTS, STANCE, P, copyPose, lerpPose, dampPose, sampleKeys,
    createSkeleton, solveLocal, toWorld, update,
    idlePose, walkPose, runPose,
  };
})(window.SA);
