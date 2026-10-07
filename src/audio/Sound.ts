/**
 * Procedural audio: every sound is synthesized with WebAudio, no assets.
 * - Continuous ride layers (wind, runner scrape, snow plow) driven by speed.
 * - One-shots (crash, ring chime, bounce, UI click).
 * - A soft generative ambient pad with bells for music.
 */

const CHORDS = [
  [48, 55, 59, 64], // Cmaj7
  [45, 52, 55, 60], // Am7
  [41, 48, 52, 57], // Fmaj7
  [43, 50, 55, 59], // G
];
const BELLS = [72, 74, 76, 79, 81, 84, 86, 88];
const midi = (n: number) => 440 * Math.pow(2, (n - 69) / 12);

interface Layer {
  gain: GainNode;
  filter: BiquadFilterNode;
}

export class Sound {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private muffle!: BiquadFilterNode;
  private sfx!: GainNode;
  private music!: GainNode;
  private reverb!: ConvolverNode;
  private noise!: AudioBuffer;
  private wind!: Layer;
  private scrape!: Layer;
  private snow!: Layer;
  private chordIndex = 0;
  private musicTimer = 0;
  private bellTimer = 0;

  sfxOn = true;
  musicOn = true;

  constructor() {
    try {
      this.sfxOn = localStorage.getItem('lr3d.sfx') !== '0';
      this.musicOn = localStorage.getItem('lr3d.music') !== '0';
    } catch {
      /* storage unavailable */
    }
    // Audio can only start after a user gesture.
    const unlock = () => {
      this.start();
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    document.addEventListener('visibilitychange', () => {
      if (!this.ctx) return;
      if (document.hidden) this.ctx.suspend();
      else this.ctx.resume();
    });
  }

  private start() {
    if (this.ctx) return;
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());
    this.master = ctx.createGain();
    this.master.gain.value = 0.9;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    // Low-pass on everything: opened fully normally, closed in slow motion.
    this.muffle = ctx.createBiquadFilter();
    this.muffle.type = 'lowpass';
    this.muffle.frequency.value = 20000;
    this.master.connect(this.muffle).connect(comp).connect(ctx.destination);

    this.sfx = ctx.createGain();
    this.sfx.gain.value = this.sfxOn ? 1 : 0;
    this.sfx.connect(this.master);
    this.music = ctx.createGain();
    this.music.gain.value = this.musicOn ? 0.5 : 0;
    this.music.connect(this.master);

    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this.impulse(3.2);
    const wet = ctx.createGain();
    wet.gain.value = 0.6;
    this.reverb.connect(wet).connect(this.master);
    // Reverb sends come after the mute gains so muting silences the tails too.
    const sfxSend = ctx.createGain();
    sfxSend.gain.value = 0.25;
    this.sfx.connect(sfxSend).connect(this.reverb);
    this.music.connect(this.reverb);

    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;

    this.wind = this.layer('lowpass', 400, 0.7);
    this.scrape = this.layer('bandpass', 3200, 1.2);
    this.snow = this.layer('lowpass', 700, 0.8);
    // A faint wind is always there: it's the mountains.
    this.wind.gain.gain.value = 0.025;

    this.scheduleMusic();
  }

  private impulse(seconds: number) {
    const ctx = this.ctx!;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
    }
    return buf;
  }

  private layer(type: BiquadFilterType, freq: number, q: number): Layer {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    src.playbackRate.value = 0.7 + Math.random() * 0.3;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = freq;
    filter.Q.value = q;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    src.connect(filter).connect(gain).connect(this.sfx);
    src.start();
    return { gain, filter };
  }

  setSfx(on: boolean) {
    this.sfxOn = on;
    this.persist();
    if (this.ctx) this.sfx.gain.setTargetAtTime(on ? 1 : 0, this.ctx.currentTime, 0.1);
  }

  setMusic(on: boolean) {
    this.musicOn = on;
    this.persist();
    if (this.ctx) this.music.gain.setTargetAtTime(on ? 0.5 : 0, this.ctx.currentTime, 0.3);
  }

  private persist() {
    try {
      localStorage.setItem('lr3d.sfx', this.sfxOn ? '1' : '0');
      localStorage.setItem('lr3d.music', this.musicOn ? '1' : '0');
    } catch {
      /* storage unavailable */
    }
  }

  /** Muffles the mix during slow motion (timeScale < 1). */
  slowmo(timeScale: number) {
    if (!this.ctx) return;
    const f = timeScale >= 0.99 ? 20000 : 500 + 6000 * timeScale;
    this.muffle.frequency.setTargetAtTime(f, this.ctx.currentTime, 0.05);
  }

  /** Deep whoosh at the start of a slow-motion moment. */
  slowmoHit() {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.frequency.setValueAtTime(220, t);
    osc.frequency.exponentialRampToValueAtTime(55, t + 0.6);
    const g = ctx.createGain();
    this.env(g, t, 0.25, 0.01, 0.7);
    osc.connect(g).connect(this.sfx);
    osc.start(t);
    osc.stop(t + 0.8);
  }

  /** Updates ride layers. Speed in units/second. */
  ride(playing: boolean, speed: number, onTrack: boolean, onSnow: boolean) {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    const s = playing ? Math.min(speed / 30, 1.3) : 0;
    this.wind.gain.gain.setTargetAtTime(0.025 + s * 0.16, t, 0.15);
    this.wind.filter.frequency.setTargetAtTime(350 + s * 1600, t, 0.2);
    this.scrape.gain.gain.setTargetAtTime(onTrack && playing ? Math.min(0.05 + s * 0.12, 0.16) : 0, t, 0.04);
    this.scrape.filter.frequency.setTargetAtTime(2200 + s * 2500, t, 0.1);
    this.snow.gain.gain.setTargetAtTime(onSnow && playing && speed > 1 ? Math.min(0.1 + s * 0.4, 0.45) : 0, t, 0.05);
  }

  private env(node: GainNode, t: number, peak: number, attack: number, decay: number) {
    node.gain.setValueAtTime(0.0001, t);
    node.gain.exponentialRampToValueAtTime(peak, t + attack);
    node.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  }

  crash() {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.frequency.setValueAtTime(140, t);
    osc.frequency.exponentialRampToValueAtTime(38, t + 0.35);
    const g = ctx.createGain();
    this.env(g, t, 0.7, 0.005, 0.4);
    osc.connect(g).connect(this.sfx);
    osc.start(t);
    osc.stop(t + 0.5);
    const n = ctx.createBufferSource();
    n.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(2400, t);
    f.frequency.exponentialRampToValueAtTime(300, t + 0.6);
    const ng = ctx.createGain();
    this.env(ng, t, 0.5, 0.005, 0.7);
    n.connect(f).connect(ng).connect(this.sfx);
    n.start(t);
    n.stop(t + 0.8);
  }

  ring() {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    [76, 83, 88, 95].forEach((note, i) => {
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = midi(note);
      const g = ctx.createGain();
      this.env(g, t + i * 0.055, 0.18, 0.005, 0.7);
      osc.connect(g).connect(this.sfx);
      osc.start(t + i * 0.055);
      osc.stop(t + i * 0.055 + 0.8);
    });
    // Whoosh.
    const n = ctx.createBufferSource();
    n.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 2;
    f.frequency.setValueAtTime(600, t);
    f.frequency.exponentialRampToValueAtTime(4000, t + 0.35);
    const ng = ctx.createGain();
    this.env(ng, t, 0.25, 0.05, 0.35);
    n.connect(f).connect(ng).connect(this.sfx);
    n.start(t);
    n.stop(t + 0.5);
  }

  bounce() {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(160, t);
    osc.frequency.exponentialRampToValueAtTime(560, t + 0.18);
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 28;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 25;
    lfo.connect(lfoGain).connect(osc.frequency);
    const g = ctx.createGain();
    this.env(g, t, 0.35, 0.01, 0.3);
    osc.connect(g).connect(this.sfx);
    osc.start(t);
    lfo.start(t);
    osc.stop(t + 0.35);
    lfo.stop(t + 0.35);
  }

  click(high = false) {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(high ? 1400 : 900, t);
    osc.frequency.exponentialRampToValueAtTime(high ? 1800 : 600, t + 0.05);
    const g = ctx.createGain();
    this.env(g, t, 0.08, 0.002, 0.06);
    osc.connect(g).connect(this.sfx);
    osc.start(t);
    osc.stop(t + 0.1);
  }

  /** Bright fanfare for a clean run. */
  success() {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    [72, 76, 79, 84].forEach((note, i) => {
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = midi(note);
      const g = ctx.createGain();
      this.env(g, t + i * 0.09, 0.16, 0.01, 0.9);
      osc.connect(g).connect(this.sfx);
      osc.start(t + i * 0.09);
      osc.stop(t + i * 0.09 + 1);
    });
  }

  /** Coin-like pickup for a star. */
  star() {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    [88, 95].forEach((note, i) => {
      const osc = ctx.createOscillator();
      osc.type = 'square';
      osc.frequency.value = midi(note);
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 3500;
      const g = ctx.createGain();
      this.env(g, t + i * 0.07, 0.08, 0.003, 0.25 + i * 0.2);
      osc.connect(f).connect(g).connect(this.sfx);
      osc.start(t + i * 0.07);
      osc.stop(t + i * 0.07 + 0.6);
    });
  }

  /** Crowd-ish cheer + fanfare at the finish line. */
  finish() {
    this.success();
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    const n = ctx.createBufferSource();
    n.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 1400;
    f.Q.value = 0.6;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.12, t + 0.3);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 2.2);
    n.connect(f).connect(g).connect(this.sfx);
    n.start(t);
    n.stop(t + 2.3);
  }

  /** Sparkly rising arpeggio for a perfect landing. */
  perfect() {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    [79, 83, 86, 91, 95].forEach((note, i) => {
      const osc = ctx.createOscillator();
      osc.type = i % 2 ? 'sine' : 'triangle';
      osc.frequency.value = midi(note);
      const g = ctx.createGain();
      this.env(g, t + i * 0.045, 0.14, 0.004, 0.8);
      osc.connect(g).connect(this.sfx);
      osc.start(t + i * 0.045);
      osc.stop(t + i * 0.045 + 0.9);
    });
  }

  // ------------------------------------------------------------- music

  private scheduleMusic() {
    const playChord = () => {
      const ctx = this.ctx!;
      const t = ctx.currentTime + 0.05;
      const chord = CHORDS[this.chordIndex++ % CHORDS.length];
      for (const note of chord) {
        for (const detune of [-6, 6]) {
          const osc = ctx.createOscillator();
          osc.type = 'sine';
          osc.frequency.value = midi(note);
          osc.detune.value = detune;
          const f = ctx.createBiquadFilter();
          f.type = 'lowpass';
          f.frequency.value = 900;
          const g = ctx.createGain();
          g.gain.setValueAtTime(0.0001, t);
          g.gain.linearRampToValueAtTime(0.022, t + 2.5);
          g.gain.linearRampToValueAtTime(0.018, t + 6);
          g.gain.linearRampToValueAtTime(0.0001, t + 9.5);
          osc.connect(f).connect(g).connect(this.music);
          osc.start(t);
          osc.stop(t + 10);
        }
      }
    };
    const playBell = () => {
      const ctx = this.ctx!;
      if (this.musicOn && Math.random() < 0.7) {
        const t = ctx.currentTime + 0.02;
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = midi(BELLS[Math.floor(Math.random() * BELLS.length)]);
        const g = ctx.createGain();
        this.env(g, t, 0.035, 0.005, 2.2);
        osc.connect(g).connect(this.music);
        osc.start(t);
        osc.stop(t + 2.5);
      }
      this.bellTimer = window.setTimeout(playBell, 900 + Math.random() * 1600);
    };
    playChord();
    this.musicTimer = window.setInterval(playChord, 8000);
    playBell();
  }

  dispose() {
    clearInterval(this.musicTimer);
    clearTimeout(this.bellTimer);
    this.ctx?.close();
  }
}
