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

  // wg / wgB: weapon grip angle relative to the forearm (front / back hand)
  const KEYS = ['hipX', 'torso', 'head', 'aF1', 'aF2', 'aB1', 'aB2', 'lF1', 'lF2', 'lB1', 'lB2', 'rot', 'wg', 'wgB'];
  const BODY = ['hip', 'neck', 'head', 'sh', 'elbF', 'handF', 'elbB', 'handB', 'kneeF', 'footF', 'toeF', 'kneeB', 'footB', 'toeB'];
  // weapon points: blade tip, blade centre and butt of the held weapon(s); never touch the ground snap
  const POINTS = BODY.concat(['tip', 'blade', 'butt', 'tipB', 'bladeB']);
  // radius used for ground contact per joint
  const CONTACT = { hip: 15, neck: 12, head: 21, handF: 8, handB: 8, elbF: 8, elbB: 8, kneeF: 10, kneeB: 10, footF: 5, footB: 5, toeF: 4, toeB: 4, sh: 12 };

  // Fighting stance: slightly hunched, knees bent, compact footprint so two fighters in contact
  // don't visually stand inside each other.
  const STANCE = {
    hipX: 0, torso: 0.2, head: -0.04,
    aF1: 0.68, aF2: 1.9, aB1: 0.32, aB2: 2.2,
    lF1: 0.46, lF2: -0.82, lB1: -0.3, lB2: -0.22,
    rot: 0, wg: -0.35, wgB: -0.35,
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
    attention: P({ torso: 0, head: 0, aF1: 0.08, aF2: 0.12, aB1: -0.06, aB2: 0.12, lF1: 0.06, lF2: -0.02, lB1: -0.06, lB2: -0.02 }),
    bow: P({ torso: 0.8, head: 0.5, aF1: 0.35, aF2: 0.15, aB1: 0.25, aB2: 0.15, lF1: 0.05, lF2: -0.04, lB1: -0.08, lB2: -0.04 }),
    roll: P({ torso: 1.3, head: 0.6, aF1: 1.2, aF2: 2.3, aB1: 1.0, aB2: 2.4, lF1: 2.1, lF2: -2.6, lB1: 1.8, lB2: -2.5 }),
    rushDash: P({ torso: 0.75, head: -0.2, aF1: 1.55, aF2: 0.1, aB1: -0.9, aB2: 0.4, lF1: 1.2, lF2: -1.0, lB1: -0.9, lB2: -0.3 }),
  };

  // ---------- pose math ----------
  function copyPose(dst, src) {
    for (let i_k = 0, a_k = KEYS; i_k < a_k.length; i_k++) { const k = a_k[i_k]; dst[k] = src[k]; }
    return dst;
  }
  function lerpPose(out, a, b, t) {
    for (let i_k = 0, a_k = KEYS; i_k < a_k.length; i_k++) { const k = a_k[i_k]; out[k] = a[k] + (b[k] - a[k]) * t; }
    return out;
  }
  // wrap an angle to (-PI, PI]
  function wrapA(a) {
    while (a > Math.PI) a -= SA.TAU;
    while (a <= -Math.PI) a += SA.TAU;
    return a;
  }
  // exponential blend toward the target pose (frame-rate independent); the body rotation takes the
  // shortest way round, so a finished roll / flip (rot = 2π) never unwinds backwards
  function dampPose(cur, target, k, dt) {
    const f = 1 - Math.exp(-k * dt);
    for (let i_key = 0, a_key = KEYS; i_key < a_key.length; i_key++) { const key = a_key[i_key];
      if (key === 'rot') { cur.rot = wrapA(cur.rot); cur.rot += wrapA(target.rot - cur.rot) * f; }
      else cur[key] += (target[key] - cur[key]) * f;
    }
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
  // Idle: breathing chest, weight shifting between the legs, restless guard hands, small head moves.
  function idlePose(t, out) {
    const b = Math.sin(t * 2.4);                 // breath
    const w = Math.sin(t * 0.9);                 // slow weight shift
    const h = Math.sin(t * 1.7 + 1.3);           // hands
    copyPose(out, STANCE);
    out.torso += b * 0.03 + w * 0.02;
    out.head += Math.sin(t * 2.4 - 0.7) * 0.05 + Math.sin(t * 0.63) * 0.04;
    out.hipX += w * 5;
    out.aF1 += h * 0.08; out.aF2 += b * 0.09 - h * 0.06;
    out.aB1 -= h * 0.06; out.aB2 += Math.sin(t * 2.4 + 0.8) * 0.08;
    out.lF1 += (b + 1) * 0.03 + w * 0.04;
    out.lF2 -= (b + 1) * 0.07 + Math.max(0, w) * 0.08;
    out.lB2 -= (b + 1) * 0.07 + Math.max(0, -w) * 0.08;
    out.wg += h * 0.08;
    return out;
  }
  // Gait wave for one leg: during the stance part of the cycle the foot moves backwards at a
  // constant rate (so it can stay planted while the body moves at constant speed), then it swings
  // forward on an eased curve and lifts. G.x: -1..1 (back..front), G.lift: 0..1.
  const G = { x: 0, lift: 0 };
  function gait(phase, stance) {
    let u = (phase / SA.TAU) % 1;
    if (u < 0) u += 1;
    if (u < stance) { G.x = 1 - 2 * (u / stance); G.lift = 0; }
    else {
      const v = (u - stance) / (1 - stance);
      G.x = -1 + 2 * SA.M.smooth(v);
      G.lift = Math.sin(v * Math.PI);
    }
    return G;
  }
  // walk (dir 1) / walk backwards (dir -1): small fighting steps, guard up
  function walkPose(phase, dir, out) {
    copyPose(out, STANCE);
    const ph = dir > 0 ? phase : -phase;
    gait(ph, 0.62);
    const fx = G.x, fl = G.lift;
    gait(ph + Math.PI, 0.62);
    const bx = G.x, bl = G.lift;
    out.lF1 = 0.46 + fx * 0.36 + fl * 0.12;
    out.lB1 = -0.3 + bx * 0.36 + bl * 0.12;
    out.lF2 = -0.82 - fl * 0.7;
    out.lB2 = -0.22 - bl * 0.85;
    const c = Math.cos(phase * 2);
    out.torso = (dir > 0 ? 0.3 : 0.08) + c * 0.015;
    out.head = dir > 0 ? -0.1 : 0;
    out.aF1 += fx * -0.1;
    out.aB1 += fx * 0.12;
    out.hipX = (dir > 0 ? 6 : -5) + c * 2;
    out.wg += fx * 0.08;
    return out;
  }
  // Run / sprint: strong forward lean, big leg amplitude, pumping arms (sprint: even more).
  function runPose(phase, out, sprint) {
    copyPose(out, STANCE);
    const amp = sprint ? 1.05 : 0.92, lift = sprint ? 1.7 : 1.5;
    gait(phase, 0.42);
    const fx = G.x, fl = G.lift;
    gait(phase + Math.PI, 0.42);
    const bx = G.x, bl = G.lift;
    out.lF1 = 0.3 + amp * fx + fl * 0.35; out.lF2 = -0.3 - lift * fl;
    out.lB1 = 0.3 + amp * bx + bl * 0.35; out.lB2 = -0.3 - lift * bl;
    out.torso = sprint ? 0.78 : 0.58;
    out.head = sprint ? -0.42 : -0.3;
    const arm = sprint ? 1.2 : 1.0;
    // arms pump against the legs
    out.aF1 = 0.55 + arm * bx; out.aF2 = 1.5 + Math.max(0, -bx) * 0.5;
    out.aB1 = 0.55 + arm * fx; out.aB2 = 1.5 + Math.max(0, -fx) * 0.5;
    out.hipX = 8;
    out.wg = -0.9 + bx * 0.08;
    return out;
  }

  // ---------- acrobatics ----------
  // Flip poses are keyframed over the flip's rotation frames (u = 0..1): the limbs move through
  // take-off, tuck and opening instead of a stiff body spinning as one piece.
  const ACRO = {};
  function buildAcro() {
    const tuck = POSES.roll;
    ACRO.front = [
      [0, P({ torso: 0.35, head: -0.1, aF1: 2.6, aF2: 0.3, aB1: 2.4, aB2: 0.4, lF1: 0.2, lF2: -0.2, lB1: -0.4, lB2: -0.1 })],
      [0.22, tuck, 'smooth'],
      [0.7, P({ torso: 1.2, aF1: 1.0, aF2: 2.0, aB1: 0.9, aB2: 2.1 }, tuck)],
      [1, P({ torso: 0.1, head: -0.1, aF1: 1.4, aF2: 0.8, aB1: -0.8, aB2: 0.8, lF1: 0.8, lF2: -1.1, lB1: -0.1, lB2: -0.9 }), 'smooth'],
    ];
    ACRO.back = [
      [0, P({ torso: -0.35, head: 0.2, aF1: 2.9, aF2: 0.2, aB1: 2.7, aB2: 0.3, lF1: 0.3, lF2: -0.5, lB1: -0.2, lB2: -0.3 })],
      [0.25, P({ torso: 0.9, head: 0.4, aF1: 1.2, aF2: 1.9, aB1: 1.0, aB2: 2.0 }, tuck), 'smooth'],
      [0.7, P({ torso: 0.9, aF1: 1.6, aF2: 1.2, aB1: 1.4, aB2: 1.3 }, tuck)],
      [1, P({ torso: 0.2, aF1: 1.2, aF2: 1.2, aB1: 0.2, aB2: 1.6, lF1: 0.9, lF2: -1.3, lB1: 0.1, lB2: -1.1 }), 'smooth'],
    ];
    // handspring: arch back, hands to the floor, legs whip over, snap down into a crouch
    ACRO.hand = [
      [0, P({ torso: -0.5, head: 0.4, aF1: 3.0, aF2: 0.15, aB1: 2.9, aB2: 0.2, lF1: 0.55, lF2: -0.9, lB1: -0.2, lB2: -0.6 })],
      [0.35, P({ torso: -0.2, head: 0.5, aF1: 3.1, aF2: 0.05, aB1: 3.05, aB2: 0.05, lF1: 1.2, lF2: -0.2, lB1: -0.6, lB2: -0.1 }), 'out'],
      [0.65, P({ torso: 0.3, head: 0.3, aF1: 2.6, aF2: 0.5, aB1: 2.5, aB2: 0.5, lF1: 1.6, lF2: -1.6, lB1: 1.2, lB2: -1.8 })],
      [1, POSES.crouch, 'smooth'],
    ];
    ACRO.slide = P({ torso: -0.85, head: 0.5, lF1: 1.45, lF2: -0.1, lB1: 0.7, lB2: -2.2, aF1: -0.3, aF2: 0.9, aB1: -0.9, aB2: 0.4 });
    ACRO.airdash = P({ torso: 0.85, head: -0.35, aF1: 1.2, aF2: 0.4, aB1: -1.1, aB2: 0.6, lF1: 0.9, lF2: -1.4, lB1: -0.9, lB2: -0.5 });
  }
  function sampleU(keys, u, out) {
    // keys with times in 0..1
    if (u <= keys[0][0]) return copyPose(out, keys[0][1]);
    for (let i = 1; i < keys.length; i++) {
      const k1 = keys[i];
      if (u <= k1[0]) {
        const k0 = keys[i - 1];
        const e = EASE[k1[2] || 'smooth'](clamp((u - k0[0]) / (k1[0] - k0[0]), 0, 1));
        return lerpPose(out, k0[1], k1[1], e);
      }
    }
    return copyPose(out, keys[keys.length - 1][1]);
  }
  // rotation profile for flips / rolls: smooth start and end, peak speed only 1.5x the average,
  // so the spin reads as one continuous motion instead of a snap in the middle
  const easeInOut = (t) => t * t * (3 - 2 * t);

  // ---------- skeleton solve ----------
  function createSkeleton() {
    const s = {};
    for (let i_p = 0, a_p = POINTS; i_p < a_p.length; i_p++) { const p = a_p[i_p]; s[p] = { x: 0.5, y: 0.5 }; }   // double fields from the start (no number boxing)
    return s;
  }

  function place(p, from, ang, len) {
    p.x = from.x + Math.sin(ang) * len;
    p.y = from.y + Math.cos(ang) * len;
  }

  // Solves the pose into facing-local coordinates (x forward), snapped so the lowest point is y=0.
  function solveLocal(pose, S, bulk, wgeom) {
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

    // held weapon: blade continues from the hand along forearm angle + grip
    const len = wgeom ? wgeom.len : 0, back = wgeom ? wgeom.back || 0 : 0;
    const wa = pose.aF1 + pose.aF2 + pose.wg;
    place(S.tip, S.handF, wa, len);
    place(S.blade, S.handF, wa, len * 0.68);
    place(S.butt, S.handF, wa, -back);
    const lenB = wgeom && wgeom.dual ? len : 0;
    const wb = pose.aB1 + pose.aB2 + pose.wgB;
    place(S.tipB, S.handB, wb, lenB);
    place(S.bladeB, S.handB, wb, lenB * 0.68);

    if (pose.rot) {
      const c = Math.cos(pose.rot), s = Math.sin(pose.rot);
      for (let i_k = 0, a_k = POINTS; i_k < a_k.length; i_k++) { const k = a_k[i_k];
        if (k === 'hip') continue;
        const p = S[k];
        const x = p.x - hip.x, y = p.y - hip.y;
        p.x = hip.x + x * c - y * s;
        p.y = hip.y + x * s + y * c;
      }
    }

    let maxY = -Infinity;
    for (let i_k = 0, a_k = BODY; i_k < a_k.length; i_k++) { const k = a_k[i_k];
      const v = S[k].y + CONTACT[k] * (bulk || 1);
      if (v > maxY) maxY = v;
    }
    for (let i_k = 0, a_k = POINTS; i_k < a_k.length; i_k++) { const k = a_k[i_k]; S[k].y -= maxY; }
    return S;
  }

  // Local -> world with facing, spin (x scale) and squash.
  function toWorld(f) {
    const L = f.local, Wd = f.skel;
    const sx = f.facing * f.spinScale * f.scaleX * f.look.scale;
    const sy = f.scaleY * f.look.scale;
    for (let i_k = 0, a_k = POINTS; i_k < a_k.length; i_k++) { const k = a_k[i_k];
      Wd[k].x = f.x + L[k].x * sx;
      Wd[k].y = f.y + L[k].y * sy;
    }
  }

  // ---------- per-state animation driver ----------
  const target = P();
  const sampled = P();
  // Gait cycles advance with the distance travelled (px per radian of the cycle), not with time:
  // the planted foot moves backwards exactly as fast as the body moves forwards -> no skating.
  const STRIDE = { walk: 28, back: 34, run: 84, sprint: 112, dash: 120 };
  const ARM_KEYS = ['aF1', 'aF2', 'aB1', 'aB2'];
  SA.STRIDE = STRIDE;

  function update(f, ts) {
    const dt = SA.STEP * ts;
    f.pose.rot = wrapA(f.pose.rot);
    let k = 18;
    let direct = false;
    let attackPose = false;
    const st = f.state;
    f.animTime += dt;

    let name = st;
    if (st === 'intro' && f.introWalk) {
      // a god steps out of the shadows
      f.walkPhase += dt * 8;
      walkPose(f.walkPhase, 1, target);
      k = 14;
    } else if (st === 'intro') {
      sampleKeys(f.isBoss ? INTRO_BOSS : INTRO, f.st, target);
      k = 14;
    } else if (st === 'idle') {
      idlePose(f.animTime, target);
    } else if (st === 'walk') {
      f.walkPhase += Math.abs(f.vx) * dt / (f.walkDir > 0 ? STRIDE.walk : STRIDE.back);
      walkPose(f.walkPhase, f.walkDir, target);
      name = f.walkDir > 0 ? 'walk' : 'backwalk';
      // the gait is followed closely (a soft blend would shrink the steps and make the feet skate);
      // entering the walk from another pose still blends in over a few frames
      k = f.st < 6 ? 16 : 42;
    } else if (st === 'run' || st === 'sprint') {
      const sprint = st === 'sprint';
      f.walkPhase += Math.abs(f.vx) * dt / (sprint ? STRIDE.sprint : STRIDE.run);
      runPose(f.walkPhase, target, sprint);
      name = st;
      k = f.st < 5 ? 24 : 40;
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
    } else if (st === 'flip' && f.flip) {
      // acrobatics: keyed limbs + eased rotation around the body (front flip forward, back / hand backward)
      const F = f.flip.F, u = clamp(f.st / F.rotFrames, 0, 1);
      if (!ACRO.front) buildAcro();
      sampleU(ACRO[f.flip.kind], u, target);
      target.rot = F.dir * SA.TAU * easeInOut(u);
      // enter from the take-off crouch over 3 frames, then follow the keys exactly
      const w = SA.M.smooth(clamp(f.st / 3, 0, 1));
      if (w < 1) { const r = target.rot; lerpPose(target, f.pose, target, w); target.rot = r; }
      copyPose(f.pose, target);
      direct = true;
      name = f.flip.kind === 'hand' ? 'handspring' : f.flip.kind + 'flip';
    } else if (st === 'airdash') {
      if (!ACRO.front) buildAcro();
      copyPose(target, ACRO.airdash);
      k = 30;
    } else if (st === 'slide') {
      if (!ACRO.front) buildAcro();
      copyPose(target, ACRO.slide);
      target.torso += Math.sin(f.animTime * 30) * 0.02;
      k = f.st < 4 ? 20 : 32;
    } else if (st === 'air') {
      const u = clamp((f.vy + 900) / 1600, 0, 1);
      lerpPose(target, POSES.jump, POSES.fall, u);
      name = f.vy < 0 ? 'jump' : 'fall';
      if (f.jumpDir !== 0) target.torso += 0.15 * f.jumpDir;
      k = 12;
    } else if (st === 'dash') {
      f.walkPhase += Math.abs(f.vx) * dt / STRIDE.dash;
      runPose(f.walkPhase, tmp, true);
      lerpPose(target, POSES.dash, tmp, 0.35);
      k = 26;
    } else if (st === 'roll') {
      // tucked ball rotating around the hip; ground snap keeps it on the floor.
      // Limbs tuck in over ~3 frames, the rotation eases in and out, the last frames open up again.
      const u = clamp(f.st / 23, 0, 1);
      // tuck in, roll, then open up into the fighting stance over the last quarter (no snap into idle)
      if (u < 0.72) copyPose(target, POSES.roll);
      else if (u < 0.88) lerpPose(target, POSES.roll, POSES.crouch, SA.M.smooth((u - 0.72) / 0.16));
      else lerpPose(target, POSES.crouch, POSES.stance, SA.M.smooth((u - 0.88) / 0.12));
      const rot = (f.rollDir || 1) * SA.TAU * easeInOut(clamp(u / 0.9, 0, 1));
      dampPose(f.pose, target, f.st < 4 ? 26 : 40, dt);
      f.pose.rot = rot;
      copyPose(target, f.pose);
      direct = true;
    } else if (st === 'evade') {
      copyPose(target, POSES.evade);
      k = 26;
    } else if (st === 'hitstun') {
      // light hits jerk the head / torso, heavy hits throw the whole body
      const w = clamp(f.stun / 8, 0, 1) * clamp(0.45 + (f.hitPower || 0.5) * 0.7, 0.5, 1.15);
      lerpPose(target, POSES.stance, POSES[f.hitPose] || POSES.hitBody, Math.min(1, w));
      if (w > 1) { target.torso += (f.hitPose === 'hitBody' ? 0.2 : -0.2) * (w - 1) * 5; }
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
      // blend in from whatever the body was doing (run, roll, previous attack …) over ~3 frames:
      // hips / torso lead, the arms follow a fraction of a frame later, the weapon last
      // out of a flip (body still turning, tucked) the attack pose blends in a little longer
      const blend = Math.max(f.flipAtk ? 5 : 3, f.move && f.move.blend !== undefined ? f.move.blend : 3);
      const out = SA.M.smooth;
      const wb = out(clamp(f.mt / blend, 0, 1));
      lerpPose(target, f.entryPose, sampled, wb);
      if (wb < 1) {
        const wa = out(clamp(f.mt / (blend + 0.7), 0, 1)), ww = out(clamp(f.mt / (blend + 1.2), 0, 1));
        for (let i_key = 0, a_key = ARM_KEYS; i_key < a_key.length; i_key++) { const key = a_key[i_key]; target[key] = f.entryPose[key] + (sampled[key] - f.entryPose[key]) * wa; }
        target.wg = f.entryPose.wg + (sampled.wg - f.entryPose.wg) * ww;
        target.wgB = f.entryPose.wgB + (sampled.wgB - f.entryPose.wgB) * ww;
      }
      // an attack out of a flip finishes the flip's rotation (the spinning aerial slash) instead of
      // snapping the body upright; any other leftover body rotation blends out with the entry
      if (f.flipAtk && f.move && f.move.air) {
        // finish the remaining turn at a flip-like pace (≈0.3 rad per step), within the move
        const r0 = f.flipRot0 || 0, end = f.flipAtk * SA.TAU;
        const n = clamp(Math.abs(end - r0) / 0.23, 6, Math.max(6, f.move.total || 20));
        target.rot = r0 + (end - r0) * SA.M.smooth(clamp(f.mt / n, 0, 1));
      }
      direct = true;
      attackPose = true;
    } else {
      idlePose(f.animTime, target);
    }

    // ---- procedural overlays (never change timing, only the look) ----
    const grounded = f.grounded;
    // lean: from velocity and acceleration (smoothed). Speeding up tips the body forward, braking
    // throws it back for a moment; the head counter-rotates so the gaze stays level.
    const vf = (f.vx * f.facing) / 960;
    const acc = ((f.vx - (f.prevVx || 0)) * f.facing) / Math.max(dt, 1e-4);
    f.prevVx = f.vx;
    const leanT = grounded ? clamp(vf, -1, 1) * 0.6 + clamp(acc / 14000, -0.5, 0.45) : 0;
    f.lean = (f.lean || 0) + (leanT - (f.lean || 0)) * (1 - Math.exp(-10 * dt));
    if (!direct && grounded && st !== 'down' && st !== 'ko' && st !== 'getup') {
      const run = st === 'run' || st === 'sprint' || st === 'dash';
      const L = f.lean * (run ? 0.12 : 0.26);
      target.torso += L;
      target.head -= L * 0.7;
      target.hipX += f.lean * (run ? 4 : 8);
      // weapon and back arm drag a little behind fast movement
      target.wg -= f.lean * 0.18;
      target.aB1 -= f.lean * 0.12;
    }
    // landing: knees give way for a moment (visual only, input is live)
    if (f.landT > 0 && !direct && grounded) {
      const w = clamp(f.landT / 10, 0, 1) * 0.75;
      lerpPose(target, target, POSES.prejump, w);
    }
    // pivot: body turns first, head and weapon follow a beat later
    if (f.turnT > 0 && !direct) {
      const w = clamp(f.turnT / 7, 0, 1);
      target.torso -= 0.35 * w;
      target.head += 0.45 * w;
      target.aF1 -= 0.5 * w; target.aB1 += 0.4 * w;
      target.wg += 0.6 * w;
      f.scaleX = Math.min(f.scaleX, 1 - 0.18 * w);
    }
    // feint (AI mind game): a fake wind-up the opponent can read, then nothing comes
    if (f.feintT > 0 && !direct) {
      const w = Math.sin(clamp(f.feintT / 12, 0, 1) * Math.PI);
      target.torso -= 0.16 * w; target.hipX -= 10 * w;
      target.aF1 += 0.5 * w; target.aF2 += 0.5 * w; target.wg -= 0.7 * w;
    }
    // attacks: anticipation pull-back, commit on the strike, follow-through after it
    if (st === 'attack' && f.move && !f.move.air && !f.move.ranged) {
      const m = f.move, pw = clamp(m.power || 0.5, 0.2, 1.2);
      if (f.mt < m.startup) {
        const u = f.mt / Math.max(1, m.startup);
        const a = Math.sin(u * Math.PI) * 0.1 * pw;
        target.torso -= a; target.hipX -= a * 60;
      } else if (f.mt < m.startup + m.active) {
        target.torso += 0.07 * pw; target.hipX += 6 * pw;
      } else {
        const u = (f.mt - m.startup - m.active) / Math.max(1, m.recovery);
        const a = Math.max(0, 1 - u * 2.2) * 0.1 * pw;
        target.torso += a; target.head += a * 0.8;
      }
    }

    f.animName = name;
    // the first frames after touching down blend a little softer (the landing squash carries it)
    if (!direct && f.landT > 5) k = Math.min(k, 14);
    if (attackPose) {
      // strikes: body, hips and rotation follow the keys exactly (frame data), the limbs and the weapon
      // trail them by ~15 ms so a fast strike is drawn as an arc over several frames, never a snap
      // active frames follow the keys exactly (the hitbox is the authored one)
      const active = f.move && f.state === 'attack' && f.mt >= f.move.startup && f.mt < f.move.startup + f.move.active;
      const kl = active ? 1 : 1 - Math.exp(-68 * dt), kt = active ? 1 : 1 - Math.exp(-58 * dt);
      for (let i_key = 0, a_key = KEYS; i_key < a_key.length; i_key++) { const key = a_key[i_key];
        if (key === 'rot' || key === 'hipX') f.pose[key] = target[key];
        else if (key === 'torso' || key === 'head') f.pose[key] += (target[key] - f.pose[key]) * kt;   // trunk leads
        else f.pose[key] += (target[key] - f.pose[key]) * kl;
      }
    } else if (direct) copyPose(f.pose, target);
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

    solveLocal(f.pose, f.local, f.look.bulk, f.wgeom);
  }

  const GETUP = [
    [0, POSES.down],
    [9, POSES.sit, 'smooth'],
    [17, POSES.crouch, 'smooth'],
    [24, POSES.stance, 'out'],
  ];
  const INTRO = [
    [0, POSES.attention], [22, POSES.attention], [44, POSES.bow, 'smooth'], [66, POSES.bow],
    [88, POSES.attention, 'smooth'], [106, POSES.stance, 'out'],
  ];
  // gods never bow: they straighten up and take their stance
  const INTRO_BOSS = [[0, POSES.attention], [50, POSES.attention], [80, POSES.stance, 'smooth']];
  const VICTORY = [[0, POSES.stance], [14, POSES.victory, 'back'], [999, POSES.victory]];
  const VICTORY2 = [[0, POSES.stance], [16, POSES.victory2, 'smooth'], [999, POSES.victory2]];

  SA.Anim = {
    KEYS, POINTS, BODY, STANCE, P, copyPose, lerpPose, dampPose, sampleKeys,
    createSkeleton, solveLocal, toWorld, update,
    idlePose, walkPose, runPose,
  };
})(window.SA);
