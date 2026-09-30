'use strict';
/*
 * Procedural audio via Web Audio API. No sound files.
 * - SFX are synthesized from noise bursts, pitched sines and filters
 * - Ambience: filtered noise beds (wind / rain / fire)
 * - Music: small generative sequencer (taiko + koto-like plucks + drone), pentatonic
 */
(function (SA) {
  const { rand } = SA.M;

  class AudioManager {
    constructor() {
      this.ctx = null;
      this.ready = false;
      this.muted = false;
      this.volumes = { master: 0.8, sfx: 1, music: 0.45 };
      this.lastPlay = {};
      this.ambience = null;
      this.music = null;
    }

    unlock() {
      if (!this.ctx) this.init();
      if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
    }

    init() {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      const ctx = this.ctx = new AC();
      this.master = ctx.createGain();
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.knee.value = 10;
      comp.ratio.value = 4;
      comp.attack.value = 0.003;
      comp.release.value = 0.2;
      this.master.connect(comp);
      comp.connect(ctx.destination);

      this.sfx = ctx.createGain();
      this.sfx.connect(this.master);
      this.musicBus = ctx.createGain();
      this.musicBus.connect(this.master);
      this.ambBus = ctx.createGain();
      this.ambBus.connect(this.master);

      this.reverb = ctx.createConvolver();
      this.reverb.buffer = this.makeImpulse(2.4, 2.6);
      this.reverbSend = ctx.createGain();
      this.reverbSend.gain.value = 0.9;
      this.reverbSend.connect(this.reverb);
      this.reverb.connect(this.master);

      const len = ctx.sampleRate * 2;
      this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

      this.ready = true;
      this.applyVolumes();
      if (this.pendingAmbience) this.setAmbience(this.pendingAmbience);
      if (this.pendingMusic) this.startMusic(this.pendingMusic);
    }

    makeImpulse(sec, decay) {
      const ctx = this.ctx, rate = ctx.sampleRate, len = Math.floor(rate * sec);
      const buf = ctx.createBuffer(2, len, rate);
      for (let ch = 0; ch < 2; ch++) {
        const d = buf.getChannelData(ch);
        for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
      }
      return buf;
    }

    setVolumes(v) {
      Object.assign(this.volumes, v);
      this.applyVolumes();
    }

    applyVolumes() {
      if (!this.ready) return;
      const t = this.ctx.currentTime;
      this.master.gain.setTargetAtTime(this.muted ? 0 : this.volumes.master, t, 0.05);
      this.sfx.gain.setTargetAtTime(this.volumes.sfx, t, 0.05);
      this.musicBus.gain.setTargetAtTime(this.volumes.music * 0.6, t, 0.2);
      this.ambBus.gain.setTargetAtTime(this.volumes.sfx * 0.5, t, 0.2);
    }

    // ---------- primitives ----------
    tone(o) {
      const ctx = this.ctx, t = o.t || ctx.currentTime;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = o.type || 'sine';
      osc.frequency.setValueAtTime(o.f, t);
      if (o.f2) osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.f2), t + (o.slide || o.dur));
      if (o.detune) osc.detune.value = o.detune;
      const a = o.attack || 0.002;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(Math.max(0.0002, o.g), t + a);
      g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
      let node = osc;
      if (o.lp) {
        const f = ctx.createBiquadFilter();
        f.type = 'lowpass';
        f.frequency.setValueAtTime(o.lp, t);
        if (o.lp2) f.frequency.exponentialRampToValueAtTime(o.lp2, t + o.dur);
        f.Q.value = o.q || 1;
        node.connect(f);
        node = f;
      }
      node.connect(g);
      g.connect(o.bus || this.sfx);
      if (o.rev) {
        const s = ctx.createGain();
        s.gain.value = o.rev;
        g.connect(s);
        s.connect(this.reverbSend);
      }
      osc.start(t);
      osc.stop(t + o.dur + 0.05);
    }

    noise(o) {
      const ctx = this.ctx, t = o.t || ctx.currentTime;
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuf;
      src.loop = true;
      src.playbackRate.value = o.rate || 1;
      const f = ctx.createBiquadFilter();
      f.type = o.filter || 'lowpass';
      f.frequency.setValueAtTime(o.f || 1000, t);
      if (o.f2) f.frequency.exponentialRampToValueAtTime(o.f2, t + o.dur);
      f.Q.value = o.q || 0.8;
      const g = ctx.createGain();
      const a = o.attack || 0.002;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(Math.max(0.0002, o.g), t + a);
      g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
      src.connect(f);
      f.connect(g);
      g.connect(o.bus || this.sfx);
      if (o.rev) {
        const s = ctx.createGain();
        s.gain.value = o.rev;
        g.connect(s);
        s.connect(this.reverbSend);
      }
      src.start(t, rand(0, 1.5));
      src.stop(t + o.dur + 0.05);
    }

    // ---------- sfx ----------
    play(name, power) {
      if (!this.ready || this.muted) return;
      if (SA.game && SA.game.silentSfx && !/^ui_|^denied|^unlock/.test(name)) return;
      const now = this.ctx.currentTime;
      if (this.lastPlay[name] && now - this.lastPlay[name] < 0.025) return;
      this.lastPlay[name] = now;
      const p = power === undefined ? 1 : power;
      const v = rand(0.94, 1.06);
      switch (name) {
        case 'whoosh_light':
          this.noise({ filter: 'bandpass', f: 700 * v, f2: 2200, q: 1.2, g: 0.13, dur: 0.1, attack: 0.02 });
          break;
        case 'whoosh_medium':
          this.noise({ filter: 'bandpass', f: 500 * v, f2: 1700, q: 1.1, g: 0.17, dur: 0.15, attack: 0.03 });
          break;
        case 'whoosh_heavy':
          this.noise({ filter: 'bandpass', f: 300 * v, f2: 1300, q: 1, g: 0.22 * p, dur: 0.22, attack: 0.05 });
          this.tone({ f: 90, f2: 60, dur: 0.2, g: 0.06, type: 'sine', attack: 0.05 });
          break;
        case 'hit_light':
          this.tone({ f: 190 * v, f2: 70, dur: 0.09, g: 0.55 });
          this.noise({ f: 2600, f2: 600, g: 0.4, dur: 0.07 });
          this.noise({ filter: 'highpass', f: 4000, g: 0.16, dur: 0.025 });
          break;
        case 'hit_kick':
          this.tone({ f: 130 * v, f2: 48, dur: 0.15, g: 0.75 });
          this.noise({ filter: 'bandpass', f: 1100, f2: 300, q: 0.9, g: 0.5, dur: 0.12 });
          this.noise({ filter: 'highpass', f: 3500, g: 0.15, dur: 0.03 });
          break;
        case 'hit_heavy':
          this.tone({ f: 150 * v, f2: 38, dur: 0.24, g: 0.95 });
          this.tone({ f: 60, f2: 30, dur: 0.3, g: 0.5, type: 'triangle' });
          this.noise({ f: 1800, f2: 200, g: 0.65, dur: 0.2, rev: 0.15 });
          this.noise({ filter: 'highpass', f: 3000, g: 0.25, dur: 0.04 });
          break;
        case 'hit_special':
          this.tone({ f: 170, f2: 30, dur: 0.5, g: 1, rev: 0.3 });
          this.tone({ f: 55, f2: 28, dur: 0.6, g: 0.6, type: 'triangle' });
          this.noise({ f: 3000, f2: 150, g: 0.8, dur: 0.45, rev: 0.4 });
          this.tone({ f: 1400, f2: 700, dur: 0.4, g: 0.12, type: 'triangle', rev: 0.5 });
          break;
        case 'block':
          this.tone({ f: 540 * v, f2: 470, dur: 0.06, g: 0.12, type: 'square', lp: 2400 });
          this.tone({ f: 1350 * v, dur: 0.12, g: 0.1, type: 'triangle' });
          this.noise({ filter: 'highpass', f: 2600, g: 0.3, dur: 0.05 });
          this.tone({ f: 110, f2: 70, dur: 0.08, g: 0.3 });
          break;
        case 'parry':
          this.tone({ f: 1568, dur: 0.9, g: 0.3, rev: 0.8 });
          this.tone({ f: 2349, dur: 0.7, g: 0.16, rev: 0.8 });
          this.tone({ f: 3136, dur: 0.4, g: 0.08, rev: 0.8 });
          this.tone({ f: 784, dur: 0.35, g: 0.2, type: 'triangle' });
          this.noise({ filter: 'highpass', f: 5000, g: 0.25, dur: 0.18, rev: 0.4 });
          break;
        case 'dash':
          this.noise({ filter: 'bandpass', f: 350, f2: 2600, q: 1.4, g: 0.18 * p, dur: 0.18, attack: 0.01 });
          break;
        case 'jump':
          this.noise({ f: 900, f2: 300, g: 0.1, dur: 0.07 });
          break;
        case 'land':
          this.tone({ f: 95, f2: 50, dur: 0.09, g: 0.3 * p });
          this.noise({ f: 600, f2: 150, g: 0.18 * p, dur: 0.1 });
          break;
        case 'knockdown':
          this.tone({ f: 80, f2: 34, dur: 0.3, g: 0.8 * p });
          this.noise({ f: 500, f2: 90, g: 0.5 * p, dur: 0.35, rev: 0.2 });
          break;
        case 'ko':
          this.tone({ f: 75, f2: 26, dur: 1.8, g: 1, rev: 0.6 });
          this.tone({ f: 220, f2: 55, dur: 1.1, g: 0.25, type: 'sawtooth', lp: 900, lp2: 120, rev: 0.5 });
          this.noise({ f: 900, f2: 60, g: 0.6, dur: 1.4, rev: 0.7 });
          this.gong(0.6, 73);
          break;
        case 'special':
          this.noise({ filter: 'bandpass', f: 200, f2: 4000, q: 2, g: 0.3, dur: 0.6, attack: 0.3, rev: 0.5 });
          this.tone({ f: 110, f2: 880, dur: 0.6, g: 0.18, type: 'sawtooth', lp: 600, lp2: 5000, attack: 0.2, rev: 0.6 });
          this.tone({ f: 55, dur: 0.9, g: 0.4, rev: 0.3 });
          break;
        case 'gong': this.gong(0.8, 98); break;
        case 'taiko': this.taiko(this.ctx.currentTime, 1.1); break;
        case 'fight':
          this.taiko(this.ctx.currentTime, 1.2);
          this.taiko(this.ctx.currentTime + 0.12, 0.8);
          this.noise({ filter: 'highpass', f: 2000, g: 0.2, dur: 0.3, rev: 0.6 });
          break;
        case 'whoosh_blade':
          this.noise({ filter: 'bandpass', f: 1400 * v, f2: 4200, q: 2.2, g: 0.16, dur: 0.12, attack: 0.02 });
          this.tone({ f: 2400 * v, f2: 1800, dur: 0.1, g: 0.02, type: 'sine' });
          break;
        case 'hit_blade':
          this.noise({ filter: 'highpass', f: 2600, f2: 5200, g: 0.4, dur: 0.1 });
          this.tone({ f: 140 * v, f2: 60, dur: 0.12, g: 0.5 });
          this.tone({ f: 2900 * v, dur: 0.18, g: 0.05, type: 'triangle', rev: 0.3 });
          break;
        case 'hit_shock':
          this.tone({ f: 150 * v, f2: 60, dur: 0.14, g: 0.6 });
          this.noise({ filter: 'bandpass', f: 3000, q: 4, g: 0.35, dur: 0.2 });
          this.tone({ f: 60, dur: 0.18, g: 0.12, type: 'sawtooth', lp: 3000 });
          break;
        case 'hit_bullet':
          this.tone({ f: 220 * v, f2: 80, dur: 0.08, g: 0.45 });
          this.noise({ filter: 'highpass', f: 3000, g: 0.25, dur: 0.05 });
          break;
        case 'block_metal':
          [1, 2.76, 5.4].forEach((m, i) => this.tone({ f: 620 * m * v, dur: 0.35 - i * 0.08, g: 0.08 / (i + 1), type: 'triangle', rev: 0.3 }));
          this.noise({ filter: 'highpass', f: 3500, g: 0.3, dur: 0.05 });
          this.tone({ f: 110, f2: 70, dur: 0.08, g: 0.25 });
          break;
        case 'draw':
          this.noise({ filter: 'bandpass', f: 900, f2: 5000, q: 3, g: 0.2, dur: 0.3, attack: 0.1 });
          this.tone({ f: 3100, dur: 0.6, g: 0.05, type: 'sine', rev: 0.6, t: this.ctx.currentTime + 0.25 });
          break;
        case 'throw':
          this.noise({ filter: 'bandpass', f: 1600 * v, f2: 3200, q: 2, g: 0.12, dur: 0.08 });
          break;
        case 'gunshot':
          this.noise({ f: 5000, f2: 400, g: 0.7, dur: 0.14 });
          this.tone({ f: 160, f2: 45, dur: 0.14, g: 0.7 });
          this.noise({ f: 900, g: 0.12, dur: 0.4, rev: 0.5 });
          break;
        case 'revolver':
          this.noise({ f: 4000, f2: 250, g: 0.9, dur: 0.22 });
          this.tone({ f: 120, f2: 35, dur: 0.25, g: 0.9 });
          this.noise({ f: 700, g: 0.2, dur: 0.6, rev: 0.7 });
          break;
        case 'shotgun':
          this.noise({ f: 3000, f2: 150, g: 1, dur: 0.3 });
          this.tone({ f: 90, f2: 30, dur: 0.3, g: 1 });
          this.noise({ f: 600, g: 0.25, dur: 0.7, rev: 0.7 });
          break;
        case 'crossbow':
          this.tone({ f: 330, f2: 120, dur: 0.12, g: 0.25, type: 'triangle' });
          this.noise({ filter: 'bandpass', f: 1200, f2: 3000, q: 2, g: 0.18, dur: 0.12 });
          break;
        case 'energy':
          this.tone({ f: 1400, f2: 300, dur: 0.22, g: 0.18, type: 'sawtooth', lp: 3000, lp2: 600 });
          this.tone({ f: 700, f2: 150, dur: 0.25, g: 0.12, type: 'square', lp: 1500 });
          break;
        case 'rocket':
          this.noise({ filter: 'bandpass', f: 400, f2: 1800, q: 1, g: 0.3, dur: 0.5, attack: 0.05 });
          break;
        case 'explosion':
          this.tone({ f: 90, f2: 28, dur: 0.8, g: 1, rev: 0.4 });
          this.noise({ f: 1400, f2: 80, g: 0.9, dur: 0.9, rev: 0.5 });
          break;
        case 'boss_impact':
          this.tone({ f: 70, f2: 22, dur: 1, g: 1 * p, rev: 0.5 });
          this.noise({ f: 900, f2: 60, g: 0.8 * p, dur: 0.8, rev: 0.6 });
          this.tone({ f: 190, f2: 60, dur: 0.3, g: 0.3 * p, type: 'triangle' });
          break;
        case 'reload':
          this.noise({ filter: 'highpass', f: 2500, g: 0.25, dur: 0.03 });
          this.noise({ filter: 'highpass', f: 1800, g: 0.2, dur: 0.04, t: this.ctx.currentTime + 0.09 * p });
          this.tone({ f: 900, dur: 0.05, g: 0.05, type: 'square', lp: 2000, t: this.ctx.currentTime + 0.09 * p });
          break;
        case 'empty':
          this.noise({ filter: 'highpass', f: 3000, g: 0.2, dur: 0.02 });
          break;
        case 'shield':
          this.tone({ f: 300, f2: 900, dur: 0.5, g: 0.18, type: 'sawtooth', lp: 1800, rev: 0.5 });
          this.tone({ f: 1200, dur: 0.6, g: 0.06, type: 'sine', rev: 0.6 });
          break;
        case 'teleport':
          this.noise({ filter: 'bandpass', f: 4000, f2: 300, q: 3, g: 0.25, dur: 0.3 });
          this.tone({ f: 1600, f2: 200, dur: 0.3, g: 0.1, type: 'sine', rev: 0.5 });
          break;
        case 'charge_up':
          this.tone({ f: 120, f2: 480, dur: 0.4, g: 0.15, type: 'sawtooth', lp: 1200, rev: 0.3 });
          break;
        case 'roar':
          this.tone({ f: 70, f2: 45, dur: 1.2, g: 0.6, type: 'sawtooth', lp: 500, lp2: 200, rev: 0.6 });
          this.noise({ filter: 'bandpass', f: 300, q: 1.5, g: 0.5, dur: 1.1, attack: 0.1, rev: 0.5 });
          this.gong(0.4, 55);
          break;
        case 'coin':
          [1318, 1760, 2093].forEach((f, i) => this.tone({ f, dur: 0.25, g: 0.1, type: 'square', lp: 5000, t: this.ctx.currentTime + i * 0.07 }));
          break;
        case 'levelup':
          [523, 659, 784, 1047, 1318].forEach((f, i) => this.tone({ f, dur: 0.5, g: 0.13, type: 'triangle', t: this.ctx.currentTime + i * 0.08, rev: 0.6 }));
          this.gong(0.3, 196);
          break;
        case 'purchase':
          [784, 1175].forEach((f, i) => this.tone({ f, dur: 0.3, g: 0.12, type: 'triangle', t: this.ctx.currentTime + i * 0.08, rev: 0.4 }));
          this.noise({ filter: 'highpass', f: 4000, g: 0.1, dur: 0.1 });
          break;
        case 'ui_move':
          this.tone({ f: 880, dur: 0.05, g: 0.06, type: 'triangle' });
          break;
        case 'ui_ok':
          this.tone({ f: 660, dur: 0.12, g: 0.1, type: 'triangle' });
          this.tone({ f: 990, dur: 0.18, g: 0.08, type: 'triangle', t: this.ctx.currentTime + 0.05, rev: 0.3 });
          break;
        case 'ui_back':
          this.tone({ f: 520, f2: 330, dur: 0.12, g: 0.08, type: 'triangle' });
          break;
        case 'denied':
          this.tone({ f: 180, dur: 0.1, g: 0.08, type: 'square', lp: 900 });
          break;
        case 'unlock':
          [523, 659, 784, 1047].forEach((f, i) => this.tone({ f, dur: 0.6, g: 0.12, type: 'triangle', t: this.ctx.currentTime + i * 0.09, rev: 0.6 }));
          break;
      }
    }

    gong(g, base) {
      const t = this.ctx.currentTime;
      [[1, 2.8], [2.76, 1.9], [5.4, 1.3], [8.93, 0.9]].forEach(([m, d], i) => {
        this.tone({ f: base * m, dur: d * 1.3, g: g * (0.5 / (i + 1)), t, attack: 0.004, rev: 0.7 });
      });
      this.noise({ f: 400, g: g * 0.3, dur: 0.15, t });
    }

    taiko(t, g, bus) {
      this.tone({ f: 105, f2: 52, dur: 0.5, g: 0.9 * g, t, bus, rev: 0.25 });
      this.noise({ f: 350, f2: 100, g: 0.35 * g, dur: 0.12, t, bus });
    }

    // ---------- ambience ----------
    setAmbience(type) {
      if (!this.ready) { this.pendingAmbience = type; return; }
      this.stopAmbience();
      if (!type) return;
      const ctx = this.ctx, t = ctx.currentTime;
      const nodes = [];
      const bed = (filter, f, q, gain, lfoRate, lfoDepth) => {
        const src = ctx.createBufferSource();
        src.buffer = this.noiseBuf;
        src.loop = true;
        const fl = ctx.createBiquadFilter();
        fl.type = filter; fl.frequency.value = f; fl.Q.value = q;
        const g = ctx.createGain();
        g.gain.value = 0;
        g.gain.setTargetAtTime(gain, t, 1.2);
        src.connect(fl); fl.connect(g); g.connect(this.ambBus);
        if (lfoRate) {
          const lfo = ctx.createOscillator();
          const lg = ctx.createGain();
          lfo.frequency.value = lfoRate;
          lg.gain.value = lfoDepth;
          lfo.connect(lg); lg.connect(fl.frequency);
          lfo.start();
          nodes.push(lfo);
        }
        src.start(0, rand(0, 1.5));
        nodes.push(src);
        return g;
      };
      if (type === 'wind') {
        bed('lowpass', 420, 0.7, 0.16, 0.13, 220);
        bed('bandpass', 1200, 3, 0.03, 0.21, 600);
      } else if (type === 'night') {
        bed('lowpass', 300, 0.7, 0.1, 0.08, 120);
      } else if (type === 'rain') {
        bed('highpass', 1500, 0.5, 0.14, 0, 0);
        bed('lowpass', 500, 0.6, 0.08, 0.1, 150);
      } else if (type === 'fire') {
        bed('lowpass', 180, 0.8, 0.22, 0.2, 60);
        bed('bandpass', 2500, 1, 0.025, 0.5, 900);
        this.crackleTimer = setInterval(() => {
          if (!this.ready || Math.random() > 0.6) return;
          this.noise({ filter: 'highpass', f: rand(2000, 5000), g: rand(0.02, 0.07), dur: rand(0.01, 0.04), bus: this.ambBus });
        }, 90);
      }
      this.ambience = nodes;
    }

    stopAmbience() {
      if (this.crackleTimer) { clearInterval(this.crackleTimer); this.crackleTimer = null; }
      if (!this.ambience) return;
      for (const n of this.ambience) { try { n.stop(this.ctx.currentTime + 0.1); } catch (e) { /* already stopped */ } }
      this.ambience = null;
    }

    // ---------- music ----------
    startMusic(style) {
      if (!this.ready) { this.pendingMusic = style; return; }
      if (this.music && this.music.style === style) return;
      this.stopMusic();
      const ctx = this.ctx;
      const cfg = {
        menu: { bpm: 72, taiko: false, root: 146.83, wave: 'triangle', density: 0.28 },
        temple: { bpm: 96, taiko: true, root: 146.83, wave: 'triangle', density: 0.32 },
        bamboo: { bpm: 84, taiko: true, root: 130.81, wave: 'sine', density: 0.26 },
        neon: { bpm: 110, taiko: true, root: 110, wave: 'square', density: 0.34, synth: true },
        ruins: { bpm: 116, taiko: true, root: 123.47, wave: 'sawtooth', density: 0.3 },
        boss: { bpm: 128, taiko: true, root: 98, wave: 'sawtooth', density: 0.36, synth: true },
      }[style] || { bpm: 96, taiko: true, root: 146.83, wave: 'triangle', density: 0.3 };
      const scale = [0, 3, 5, 7, 10, 12, 15, 17];
      const m = this.music = { style, cfg, step: 0, next: ctx.currentTime + 0.1, bar: 0, nodes: [], intensity: 1 };

      // drone
      const drone = ctx.createOscillator();
      drone.type = cfg.synth ? 'sawtooth' : 'triangle';
      drone.frequency.value = cfg.root / 2;
      const df = ctx.createBiquadFilter();
      df.type = 'lowpass'; df.frequency.value = cfg.synth ? 380 : 260;
      const dg = ctx.createGain();
      dg.gain.value = 0;
      dg.gain.setTargetAtTime(0.07, ctx.currentTime, 2);
      drone.connect(df); df.connect(dg); dg.connect(this.musicBus);
      drone.start();
      m.nodes.push(drone);
      m.droneOsc = drone;

      const spb = 60 / cfg.bpm / 4; // 16th note
      m.timer = setInterval(() => {
        if (!this.ready) return;
        while (m.next < ctx.currentTime + 0.25) {
          const s = m.step % 16;
          const t = m.next;
          const shift = [0, -2, 3, 0][m.bar % 4];
          const root = cfg.root * Math.pow(2, shift / 12);
          if (s === 0) m.droneOsc.frequency.setTargetAtTime(root / 2, t, 0.3);
          if (cfg.taiko && m.intensity > 0.2) {
            if (s === 0 || s === 10) this.taiko(t, 0.5 * m.intensity, this.musicBus);
            if (s === 6 && m.bar % 2) this.taiko(t, 0.3 * m.intensity, this.musicBus);
            if (s === 4 || s === 12) this.noise({ filter: 'highpass', f: 3500, g: 0.05 * m.intensity, dur: 0.04, t, bus: this.musicBus });
            if (cfg.synth && s % 2 === 0) this.tone({ f: root / 2, dur: spb * 1.6, g: 0.07 * m.intensity, type: 'sawtooth', lp: 700, lp2: 200, t, bus: this.musicBus });
          }
          if ([0, 3, 6, 8, 10, 13, 14].indexOf(s) >= 0 && Math.random() < cfg.density) {
            const note = scale[Math.floor(Math.random() * scale.length)] + (Math.random() < 0.3 ? 12 : 0);
            const f = root * Math.pow(2, note / 12);
            this.tone({ f, dur: 0.9, g: 0.07, type: cfg.wave, lp: 2600, lp2: 500, t, bus: this.musicBus, rev: 0.5 });
            this.tone({ f: f * 2, dur: 0.3, g: 0.02, type: 'sine', t, bus: this.musicBus });
          }
          m.next += spb;
          m.step++;
          if (m.step % 16 === 0) m.bar++;
        }
      }, 50);
    }

    setMusicIntensity(v) { if (this.music) this.music.intensity = v; }

    stopMusic() {
      if (!this.music) { this.pendingMusic = null; return; }
      clearInterval(this.music.timer);
      for (const n of this.music.nodes) { try { n.stop(this.ctx.currentTime + 0.3); } catch (e) { /* noop */ } }
      this.music = null;
    }
  }

  SA.audio = new AudioManager();
})(window.SA);
