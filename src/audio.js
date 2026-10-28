/* ============================================================
   Полностью процедурный звук: дрон, шаги, сердце, шёпот,
   напряжение, скримеры. Ни одного внешнего файла.
   ============================================================ */

export class GameAudio {
  constructor() {
    this.ctx = null;
    this.ready = false;
  }

  init() {
    if (this.ready) return;
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();
    this.ctx = ctx;

    this.master = ctx.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(ctx.destination);

    // Общий белый шум для всего сыпучего.
    const len = ctx.sampleRate * 2;
    this.noiseBuffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = this.noiseBuffer.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = Math.random() * 2 - 1;

    // Низкий дрон-фон.
    this.drone = ctx.createOscillator();
    this.drone.type = "sawtooth";
    this.drone.frequency.value = 38;
    this.droneFilter = ctx.createBiquadFilter();
    this.droneFilter.type = "lowpass";
    this.droneFilter.frequency.value = 140;
    this.droneGain = ctx.createGain();
    this.droneGain.gain.value = 0.05;
    this.drone.connect(this.droneFilter);
    this.droneFilter.connect(this.droneGain);
    this.droneGain.connect(this.master);
    this.drone.start();

    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.08;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 7;
    lfo.connect(lfoGain);
    lfoGain.connect(this.drone.frequency);
    lfo.start();

    // Гул самой дежурной — рядом с игроком.
    this.humOsc = ctx.createOscillator();
    this.humOsc.type = "sine";
    this.humOsc.frequency.value = 71;
    this.humOsc2 = ctx.createOscillator();
    this.humOsc2.type = "sine";
    this.humOsc2.frequency.value = 74.5;
    this.humGain = ctx.createGain();
    this.humGain.gain.value = 0;
    this.humOsc.connect(this.humGain);
    this.humOsc2.connect(this.humGain);
    this.humGain.connect(this.master);
    this.humOsc.start();
    this.humOsc2.start();

    // Напряжение при охоте — расстроенная пила.
    this.tension = ctx.createOscillator();
    this.tension.type = "sawtooth";
    this.tension.frequency.value = 92;
    this.tensionFilter = ctx.createBiquadFilter();
    this.tensionFilter.type = "lowpass";
    this.tensionFilter.frequency.value = 320;
    this.tensionGain = ctx.createGain();
    this.tensionGain.gain.value = 0;
    this.tension.connect(this.tensionFilter);
    this.tensionFilter.connect(this.tensionGain);
    this.tensionGain.connect(this.master);
    this.tension.start();

    this.heartTimer = 0;
    this.ready = true;
  }

  resume() {
    if (this.ctx && this.ctx.state === "suspended") this.ctx.resume();
  }

  _env(gainNode, peak, attack, decay) {
    const t = this.ctx.currentTime;
    gainNode.gain.cancelScheduledValues(t);
    gainNode.gain.setValueAtTime(0.0001, t);
    gainNode.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + attack);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  }

  tone(freq, duration, { type = "sine", peak = 0.08, attack = 0.005, slideTo = 0 } = {}) {
    if (!this.ready) return;
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(slideTo, 1), ctx.currentTime + duration);
    this._env(g, peak, attack, duration);
    osc.connect(g);
    g.connect(this.master);
    osc.start();
    osc.stop(ctx.currentTime + attack + duration + 0.05);
  }

  noise(duration, { peak = 0.1, filter = "bandpass", freq = 800, q = 1, attack = 0.005, slideTo = 0 } = {}) {
    if (!this.ready) return;
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = filter;
    f.frequency.setValueAtTime(freq, ctx.currentTime);
    if (slideTo) f.frequency.exponentialRampToValueAtTime(Math.max(slideTo, 20), ctx.currentTime + duration);
    f.Q.value = q;
    const g = ctx.createGain();
    this._env(g, peak, attack, duration);
    src.connect(f);
    f.connect(g);
    g.connect(this.master);
    src.start();
    src.stop(ctx.currentTime + attack + duration + 0.05);
  }

  /* ---------------------- игровые звуки ---------------------- */

  step(sprint, crouch) {
    const peak = sprint ? 0.09 : crouch ? 0.02 : 0.05;
    this.noise(0.07, { peak, freq: 240 + Math.random() * 160, q: 1.4, filter: "bandpass" });
    this.tone(sprint ? 64 : 54, 0.06, { type: "triangle", peak: peak * 0.7 });
  }

  breath() {
    this.noise(0.5, { peak: 0.035, freq: 520, q: 0.8, filter: "bandpass", slideTo: 300 });
  }

  gasp() {
    this.noise(0.6, { peak: 0.11, freq: 700, q: 0.9, filter: "bandpass", slideTo: 380 });
    this.tone(150, 0.3, { type: "sawtooth", peak: 0.03, slideTo: 90 });
  }

  heartbeat(intensity) {
    const peak = 0.06 + intensity * 0.16;
    this.tone(56, 0.14, { type: "sine", peak, slideTo: 36 });
    setTimeout(() => this.tone(48, 0.12, { type: "sine", peak: peak * 0.7, slideTo: 34 }), 170);
  }

  whisper() {
    if (!this.ready) return;
    const pan = this.ctx.createStereoPanner ? this.ctx.createStereoPanner() : null;
    const dur = 1.1 + Math.random() * 0.9;
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = "bandpass";
    f.Q.value = 6;
    f.frequency.setValueAtTime(900 + Math.random() * 700, ctx.currentTime);
    f.frequency.linearRampToValueAtTime(500 + Math.random() * 900, ctx.currentTime + dur);
    const g = ctx.createGain();
    this._env(g, 0.05, 0.25, dur);
    src.connect(f);
    f.connect(g);
    if (pan) {
      pan.pan.value = Math.random() * 1.6 - 0.8;
      g.connect(pan);
      pan.connect(this.master);
    } else {
      g.connect(this.master);
    }
    src.start();
    src.stop(ctx.currentTime + dur + 0.35);
  }

  stinger() {
    this.tone(720, 0.7, { type: "sawtooth", peak: 0.12, slideTo: 90 });
    this.noise(0.5, { peak: 0.1, freq: 1800, filter: "highpass", slideTo: 300 });
  }

  thud() {
    this.tone(62, 0.18, { type: "triangle", peak: 0.16 });
    setTimeout(() => this.tone(41, 0.24, { type: "sawtooth", peak: 0.12 }), 90);
    this.noise(0.2, { peak: 0.06, freq: 200, filter: "lowpass" });
  }

  fuseFix() {
    this.tone(880, 0.06, { type: "square", peak: 0.07 });
    setTimeout(() => this.tone(1320, 0.05, { type: "square", peak: 0.05 }), 70);
    setTimeout(() => this.thud(), 220);
    this.noise(0.9, { peak: 0.05, freq: 3400, filter: "highpass" });
  }

  spark() {
    for (let i = 0; i < 5; i += 1) {
      setTimeout(() => this.noise(0.05, { peak: 0.05, freq: 2600 + Math.random() * 2400, filter: "bandpass", q: 3 }), i * 60 + Math.random() * 40);
    }
  }

  pickup() {
    this.tone(660, 0.1, { type: "triangle", peak: 0.07 });
    setTimeout(() => this.tone(990, 0.14, { type: "triangle", peak: 0.06 }), 90);
  }

  paper() {
    this.noise(0.28, { peak: 0.05, freq: 2400, filter: "highpass" });
  }

  locker(open) {
    this.noise(0.3, { peak: 0.06, freq: open ? 500 : 700, filter: "bandpass", q: 2, slideTo: open ? 260 : 340 });
    this.tone(open ? 90 : 70, 0.2, { type: "square", peak: 0.03 });
  }

  flicker() {
    this.noise(0.25, { peak: 0.045, freq: 4200, filter: "bandpass", q: 8 });
  }

  doorRattle() {
    this.tone(120, 0.1, { type: "square", peak: 0.06 });
    setTimeout(() => this.tone(96, 0.12, { type: "square", peak: 0.05 }), 90);
    this.noise(0.2, { peak: 0.05, freq: 900, q: 2 });
  }

  scream() {
    if (!this.ready) return;
    const ctx = this.ctx;    this.tone(840, 1.3, { type: "sawtooth", peak: 0.3, slideTo: 55 });
    this.tone(420, 1.3, { type: "square", peak: 0.16, slideTo: 40 });
    this.noise(1.2, { peak: 0.3, freq: 1400, filter: "bandpass", q: 0.7, slideTo: 220 });
    // Хриплый рёв на FM.
    const carrier = ctx.createOscillator();
    const mod = ctx.createOscillator();
    const modGain = ctx.createGain();
    const g = ctx.createGain();
    carrier.type = "sawtooth";
    carrier.frequency.setValueAtTime(160, ctx.currentTime);
    carrier.frequency.exponentialRampToValueAtTime(60, ctx.currentTime + 1.4);
    mod.frequency.value = 63;
    modGain.gain.value = 240;
    mod.connect(modGain);
    modGain.connect(carrier.frequency);
    this._env(g, 0.22, 0.02, 1.4);
    carrier.connect(g);
    g.connect(this.master);
    carrier.start();
    mod.start();
    carrier.stop(ctx.currentTime + 1.6);
    mod.stop(ctx.currentTime + 1.6);
  }

  winChime() {
    const notes = [392, 523, 659, 784];
    notes.forEach((n, i) => {
      setTimeout(() => {
        this.tone(n, 0.9, { type: "triangle", peak: 0.07 });
        this.tone(n * 2, 0.7, { type: "sine", peak: 0.03 });
      }, i * 190);
    });
  }

  /** Вызывается каждый кадр. */
  update(dt, { panic, enemyDist, enemyLos, hunted }) {
    if (!this.ready) return;

    // Дрон реагирует на панику.
    const targetDrone = 0.035 + panic * 0.09;
    this.droneGain.gain.value += (targetDrone - this.droneGain.gain.value) * Math.min(1, dt * 3);
    this.drone.frequency.value = 38 + panic * 10;

    // Гул дежурной.
    let humTarget = 0;
    if (enemyDist < 15) {
      humTarget = Math.pow(1 - enemyDist / 15, 2) * 0.24 * (enemyLos ? 1 : 0.45);
    }
    this.humGain.gain.value += (humTarget - this.humGain.gain.value) * Math.min(1, dt * 5);

    // Напряжение при охоте.
    const tenTarget = hunted ? 0.05 + panic * 0.05 : 0;
    this.tensionGain.gain.value += (tenTarget - this.tensionGain.gain.value) * Math.min(1, dt * 2.5);

    // Сердцебиение по панике.
    this.heartTimer -= dt * (0.55 + panic * 1.9);
    if (panic > 0.22 && this.heartTimer <= 0) {
      this.heartTimer = 1;
      this.heartbeat(Math.min(1, panic));
    }
  }

  setMaster(muted) {
    if (!this.ready) return;
    this.master.gain.value = muted ? 0 : 0.5;
  }
}
