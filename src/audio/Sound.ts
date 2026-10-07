/**
 * Procedural audio: every sound is synthesized with WebAudio, no assets.
 * - Continuous ride layers (wind, runner scrape, snow plow) driven by speed,
 *   plus engines (motorbike, buggy) and freewheel ticks (BMX) per vehicle.
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

export type RideSound = 'sled' | 'skis' | 'board' | 'pedal' | 'engine' | 'motor';

interface Engine {
  gain: GainNode;
  filter: BiquadFilterNode;
  oscs: OscillatorNode[];
  /** Amplitude "putt" of the cylinders. */
  lfo: OscillatorNode;
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
  private engine: Engine | null = null;
  private rideKind: RideSound = 'sled';
  private tickClock = 0;
  private lastRide = 0;
  private chordIndex = 0;
  private musicTimer = 0;
  private bellTimer = 0;

  sfxOn = true;
  musicOn = true;
  /** Volumes (0..1) from the settings; the on/off buttons mute on top. */
  sfxVolume = 0.9;
  musicVolume = 0.6;

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
    this.sfx.gain.value = this.sfxGain();
    this.sfx.connect(this.master);
    this.music = ctx.createGain();
    this.music.gain.value = this.musicGain();
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
    if (this.ctx) this.sfx.gain.setTargetAtTime(this.sfxGain(), this.ctx.currentTime, 0.1);
  }

  setMusic(on: boolean) {
    this.musicOn = on;
    this.persist();
    if (this.ctx) this.music.gain.setTargetAtTime(this.musicGain(), this.ctx.currentTime, 0.3);
  }

  private sfxGain() {
    return this.sfxOn ? this.sfxVolume * 1.1 : 0;
  }

  private musicGain() {
    return this.musicOn ? this.musicVolume * 0.8 : 0;
  }

  /** Volume sliders (0..1). */
  setVolumes(sfx: number, music: number) {
    this.sfxVolume = sfx;
    this.musicVolume = music;
    if (!this.ctx) return;
    this.sfx.gain.setTargetAtTime(this.sfxGain(), this.ctx.currentTime, 0.05);
    this.music.gain.setTargetAtTime(this.musicGain(), this.ctx.currentTime, 0.1);
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
  /** Which ride is playing (changes the runner sound and the engine). */
  setRide(kind: RideSound) {
    this.rideKind = kind;
  }

  /**
   * Continuous ride sound. `throttle` is the push key (pedalling, gas) and
   * `airborne` free-revs the engines.
   */
  ride(playing: boolean, speed: number, onTrack: boolean, onSnow: boolean, throttle = false, airborne = false) {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    const dt = Math.min(0.1, t - this.lastRide);
    this.lastRide = t;
    const s = playing ? Math.min(speed / 30, 1.3) : 0;
    const kind = this.rideKind;
    const wheels = kind === 'pedal' || kind === 'engine' || kind === 'motor';
    this.wind.gain.gain.setTargetAtTime(0.025 + s * 0.16, t, 0.15);
    this.wind.filter.frequency.setTargetAtTime(350 + s * 1600, t, 0.2);
    // Runners scrape, skis and boards hiss lower, tyres hum.
    const scrapeFreq = kind === 'sled' ? 2200 + s * 2500 : wheels ? 300 + s * 500 : 1100 + s * 1400;
    const scrapeGain = kind === 'sled' ? Math.min(0.05 + s * 0.12, 0.16) : wheels ? Math.min(0.03 + s * 0.08, 0.1) : Math.min(0.06 + s * 0.14, 0.2);
    this.scrape.gain.gain.setTargetAtTime(onTrack && playing ? scrapeGain : 0, t, 0.04);
    this.scrape.filter.frequency.setTargetAtTime(scrapeFreq, t, 0.1);
    this.snow.gain.gain.setTargetAtTime(onSnow && playing && speed > 1 ? Math.min(0.1 + s * 0.4, 0.45) : 0, t, 0.05);
    this.updateEngine(playing, speed, throttle, airborne);
    // BMX freewheel: ticks while coasting, faster with speed.
    if (kind === 'pedal' && playing && !throttle && speed > 2 && (onTrack || onSnow)) {
      this.tickClock += dt * Math.min(4 + speed * 0.9, 26);
      if (this.tickClock >= 1) {
        this.tickClock %= 1;
        this.tick();
      }
    }
  }

  private tick() {
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const n = ctx.createBufferSource();
    n.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 5200;
    f.Q.value = 6;
    const g = ctx.createGain();
    this.env(g, t, 0.12, 0.001, 0.025);
    n.connect(f).connect(g).connect(this.sfx);
    n.start(t, Math.random());
    n.stop(t + 0.04);
  }

  /** Motorbike (snarling twin) and buggy (deep rumble) engines with gear shifts. */
  private updateEngine(playing: boolean, speed: number, throttle: boolean, airborne: boolean) {
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const kind = this.rideKind;
    const motor = kind === 'engine' || kind === 'motor';
    if (!motor) {
      if (this.engine) this.engine.gain.gain.setTargetAtTime(0, t, 0.08);
      return;
    }
    if (!this.engine) this.engine = this.makeEngine();
    const e = this.engine;
    const moto = kind === 'engine';
    // Rev through gears: rpm climbs with speed, drops at each shift.
    const gearSpan = moto ? 9 : 11;
    const inGear = (speed % gearSpan) / gearSpan;
    const gear = Math.min(5, Math.floor(speed / gearSpan));
    let rpm = 0.18 + inGear * 0.62 + gear * 0.04;
    if (airborne && throttle) rpm = 1;
    else if (throttle) rpm += 0.12;
    const idle = moto ? 48 : 34;
    const top = moto ? 210 : 120;
    const f = idle + (top - idle) * Math.min(rpm, 1);
    e.oscs[0].frequency.setTargetAtTime(f, t, 0.05);
    e.oscs[1].frequency.setTargetAtTime(f * 0.5, t, 0.05);
    e.oscs[2].frequency.setTargetAtTime(f * 1.01, t, 0.05);
    e.lfo.frequency.setTargetAtTime(f * 0.5, t, 0.05);
    e.filter.frequency.setTargetAtTime((moto ? 700 : 420) + rpm * (moto ? 2200 : 900) + (throttle ? 500 : 0), t, 0.06);
    const vol = playing ? (moto ? 0.09 : 0.11) * (0.6 + rpm * 0.5 + (throttle ? 0.25 : 0)) : 0.0;
    e.gain.gain.setTargetAtTime(vol, t, 0.06);
  }

  private makeEngine(): Engine {
    const ctx = this.ctx!;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.Q.value = 3;
    const putt = ctx.createGain();
    putt.gain.value = 0.6;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    const types: OscillatorType[] = ['sawtooth', 'square', 'sawtooth'];
    const oscs = types.map((type) => {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = 50;
      o.connect(filter);
      o.start();
      return o;
    });
    // Cylinder firing: amplitude modulation at half the engine pitch.
    const lfo = ctx.createOscillator();
    lfo.type = 'square';
    lfo.frequency.value = 25;
    const depth = ctx.createGain();
    depth.gain.value = 0.4;
    lfo.connect(depth).connect(putt.gain);
    lfo.start();
    filter.connect(putt).connect(gain).connect(this.sfx);
    return { gain, filter, oscs, lfo };
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
