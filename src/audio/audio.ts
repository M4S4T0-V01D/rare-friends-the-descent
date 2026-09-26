import { createFriendSoundKit, type FriendSoundCue, type FriendSoundKit } from "@rarefriends/friendsdk/sounds";

/**
 * Procedural combat audio plus the FriendSDK sound kit for rewards and RF moments.
 * No recordings: everything is synthesized, and nothing plays until a player gesture unlocks audio.
 */
/** One mood per place: the camp, each floor style, and boss fights. */
export type MusicMode = "none" | "camp" | "crypt" | "tech" | "flesh" | "void" | "boss";
export type VoiceAction = "greet" | "dodge" | "hurt" | "signature" | "happy" | "heavy";

export type SfxName =
  | "swing" | "heavySwing" | "hit" | "crit" | "enemyDie" | "playerHurt" | "dodge" | "bolt" | "nova" | "potion"
  | "coin" | "spend" | "pickup" | "levelUp" | "doorLock" | "doorOpen" | "enemySwing" | "enemyShot" | "charge"
  | "slam" | "roar" | "summon" | "blink" | "telegraph" | "death" | "ui" | "deny" | "shrine" | "explode" | "burn";

const SDK_CUES: Partial<Record<string, FriendSoundCue>> = {
  purchase: "purchase", reward: "reward", anticipation: "anticipation", "reveal-common": "reveal-common",
  "reveal-rare": "reveal-rare", "reveal-legendary": "reveal-legendary", select: "select", impact: "impact",
  "action-start": "action-start", "action-ready": "action-ready",
};

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private kit: FriendSoundKit;
  private muted = false;
  private musicOn = true;
  private musicMode: MusicMode = "none";
  private voice: { family: string; pitch: number } = { family: "", pitch: 1 };
  private step = 0;
  private musicNodes: AudioNode[] = [];
  private musicTimer = 0;
  private lastPlayed = new Map<string, number>();

  constructor() { this.kit = createFriendSoundKit({ volume: 0.7 }); }

  /** Call from a user gesture. Safe to call repeatedly. */
  async unlock(): Promise<boolean> {
    try {
      if (!this.ctx) {
        const Context = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Context) return false;
        this.ctx = new Context();
        this.master = this.ctx.createGain();
        this.master.gain.value = this.muted ? 0 : 0.8;
        this.master.connect(this.ctx.destination);
        this.sfxBus = this.ctx.createGain(); this.sfxBus.gain.value = 0.55; this.sfxBus.connect(this.master);
        this.musicBus = this.ctx.createGain(); this.musicBus.gain.value = this.musicOn ? 0.32 : 0; this.musicBus.connect(this.master);
        const length = this.ctx.sampleRate;
        this.noise = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
        const data = this.noise.getChannelData(0);
        for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
      }
      if (this.ctx.state !== "running") await this.ctx.resume();
      await this.kit.unlock();
      if (this.musicMode !== "none" && !this.musicNodes.length) this.startMusic(this.musicMode);
      return this.ctx.state === "running";
    } catch { return false; }
  }

  get isMuted() { return this.muted; }
  setMuted(muted: boolean) {
    this.muted = muted;
    this.kit.setMuted(muted);
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(muted ? 0 : 0.8, this.ctx.currentTime, 0.03);
  }
  setMusic(on: boolean) {
    this.musicOn = on;
    if (this.musicBus && this.ctx) this.musicBus.gain.setTargetAtTime(on ? 0.32 : 0, this.ctx.currentTime, 0.2);
  }

  cue(name: string) {
    const cue = SDK_CUES[name];
    if (cue && !this.muted) this.kit.play(cue);
  }

  play(name: SfxName, intensity = 1) {
    const ctx = this.ctx, bus = this.sfxBus;
    if (!ctx || !bus || this.muted || ctx.state !== "running") return;
    // Rate-limit very frequent cues so crowds of enemies stay readable.
    const now = ctx.currentTime, minGap = name === "hit" || name === "coin" ? 0.035 : name === "enemyShot" ? 0.06 : 0.02;
    if ((this.lastPlayed.get(name) ?? -1) > now - minGap) return;
    this.lastPlayed.set(name, now);
    const t = now + 0.005;
    const v = Math.min(1.4, intensity);
    switch (name) {
      case "swing": this.noiseBurst(t, 0.09, 1800, 5200, 0.22 * v, "bandpass"); break;
      case "heavySwing": this.noiseBurst(t, 0.16, 900, 3000, 0.3 * v, "bandpass"); this.tone(t, 110, 60, 0.14, 0.18, "triangle"); break;
      case "hit": this.noiseBurst(t, 0.06, 2400, 900, 0.28 * v, "lowpass"); this.tone(t, 180, 90, 0.07, 0.16, "square"); break;
      case "crit": this.noiseBurst(t, 0.1, 3000, 800, 0.32, "lowpass"); this.tone(t, 880, 440, 0.12, 0.14, "square"); this.tone(t + 0.03, 1320, 660, 0.1, 0.08, "triangle"); break;
      case "enemyDie": this.noiseBurst(t, 0.22, 1200, 200, 0.3, "lowpass"); this.tone(t, 220, 55, 0.25, 0.16, "sawtooth"); break;
      case "playerHurt": this.tone(t, 160, 70, 0.2, 0.3, "sawtooth"); this.noiseBurst(t, 0.12, 800, 300, 0.25, "lowpass"); break;
      case "dodge": this.noiseBurst(t, 0.16, 600, 3600, 0.2, "bandpass"); break;
      case "bolt": this.tone(t, 660, 1320, 0.12, 0.13, "square"); this.tone(t, 330, 990, 0.14, 0.08, "sawtooth"); break;
      case "nova": this.tone(t, 90, 30, 0.5, 0.35, "sawtooth"); this.noiseBurst(t, 0.45, 4000, 200, 0.3, "lowpass"); this.tone(t, 440, 1760, 0.3, 0.08, "triangle"); break;
      case "potion": [523, 659, 784].forEach((f, i) => this.tone(t + i * 0.05, f, f * 1.01, 0.12, 0.12, "triangle")); break;
      case "coin": this.tone(t, 1568, 1568, 0.06, 0.12, "square"); this.tone(t + 0.05, 2093, 2093, 0.12, 0.1, "square"); break;
      case "spend": [880, 660, 440].forEach((f, i) => this.tone(t + i * 0.055, f, f * 0.98, 0.09, 0.13, "square")); this.noiseBurst(t, 0.05, 6000, 3000, 0.08, "highpass"); break;
      case "pickup": this.tone(t, 784, 1175, 0.1, 0.12, "triangle"); break;
      case "levelUp": [392, 523, 659, 784, 1047].forEach((f, i) => this.tone(t + i * 0.07, f, f, 0.22, 0.14, "triangle")); break;
      case "doorLock": this.tone(t, 70, 50, 0.35, 0.3, "square"); this.noiseBurst(t, 0.3, 400, 120, 0.3, "lowpass"); break;
      case "doorOpen": this.tone(t, 60, 120, 0.4, 0.2, "triangle"); this.noiseBurst(t, 0.35, 300, 1200, 0.18, "bandpass"); break;
      case "enemySwing": this.noiseBurst(t, 0.08, 900, 2200, 0.12, "bandpass"); break;
      case "enemyShot": this.tone(t, 300, 180, 0.12, 0.08, "sine"); this.tone(t, 600, 360, 0.1, 0.04, "square"); break;
      case "charge": this.tone(t, 80, 240, 0.5, 0.2, "sawtooth"); break;
      case "slam": this.tone(t, 70, 30, 0.45, 0.4, "sine"); this.noiseBurst(t, 0.4, 900, 100, 0.35, "lowpass"); break;
      case "roar": this.tone(t, 110, 40, 1.1, 0.35, "sawtooth"); this.tone(t, 117, 42, 1.1, 0.25, "sawtooth"); this.noiseBurst(t, 1.0, 700, 150, 0.25, "lowpass"); break;
      case "summon": this.tone(t, 200, 600, 0.4, 0.12, "sine"); this.tone(t, 210, 620, 0.4, 0.1, "sine"); break;
      case "blink": this.tone(t, 1200, 300, 0.18, 0.1, "sine"); break;
      case "telegraph": this.tone(t, 520, 520, 0.08, 0.06, "square"); break;
      case "death": this.tone(t, 220, 40, 1.4, 0.3, "sawtooth"); this.tone(t, 330, 55, 1.4, 0.2, "triangle"); this.noiseBurst(t, 1.0, 600, 60, 0.25, "lowpass"); break;
      case "ui": this.tone(t, 660, 660, 0.05, 0.07, "triangle"); break;
      case "deny": this.tone(t, 180, 150, 0.12, 0.14, "square"); this.tone(t + 0.1, 150, 120, 0.14, 0.14, "square"); break;
      case "shrine": [220, 277, 330, 440].forEach((f, i) => this.tone(t + i * 0.09, f, f, 0.8, 0.07, "sine")); break;
      case "explode": this.noiseBurst(t, 0.5, 1800, 80, 0.4, "lowpass"); this.tone(t, 90, 30, 0.4, 0.3, "sine"); break;
      case "burn": this.noiseBurst(t, 0.12, 2400, 1200, 0.07, "bandpass"); break;
    }
  }

  /** Background mood: a drone bed, a rhythmic layer and ambient one-shots, different for each place. */
  setMusicMode(mode: MusicMode) {
    if (mode === this.musicMode) return;
    this.musicMode = mode;
    this.stopMusic();
    if (mode !== "none") this.startMusic(mode);
  }

  private startMusic(mode: Exclude<MusicMode, "none">) {
    const ctx = this.ctx, bus = this.musicBus;
    if (!ctx || !bus) return;
    const cfg = {
      camp: { root: 55, types: ["triangle", "sine"], ratios: [1, 1.5, 2], cutoff: 520, lfo: 0.08, lfoDepth: 120, level: 0.16 },
      crypt: { root: 36.7, types: ["sawtooth", "sine"], ratios: [1, 1.002, 1.5, 2.003], cutoff: 380, lfo: 0.06, lfoDepth: 160, level: 0.17 },
      tech: { root: 55, types: ["sawtooth", "square"], ratios: [1, 2, 3.01], cutoff: 700, lfo: 7, lfoDepth: 90, level: 0.12 },
      flesh: { root: 41.2, types: ["sawtooth", "triangle"], ratios: [1, 1.01, 1.19], cutoff: 240, lfo: 0.3, lfoDepth: 90, level: 0.2 },
      void: { root: 65.4, types: ["sine", "triangle"], ratios: [1, 1.498, 2.01, 3.003], cutoff: 1400, lfo: 0.05, lfoDepth: 700, level: 0.12 },
      boss: { root: 43.65, types: ["sawtooth", "sawtooth"], ratios: [1, 1.003, 1.5, 2.01], cutoff: 700, lfo: 2, lfoDepth: 260, level: 0.22 },
    }[mode];
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass"; filter.frequency.value = cfg.cutoff; filter.Q.value = 3;
    const drone = ctx.createGain(); drone.gain.value = 0;
    drone.gain.setTargetAtTime(cfg.level, ctx.currentTime, 1.5);
    filter.connect(drone); drone.connect(bus);
    const nodes: AudioNode[] = [filter, drone];
    cfg.ratios.forEach((ratio, i) => {
      const osc = ctx.createOscillator();
      osc.type = cfg.types[i % cfg.types.length] as OscillatorType;
      osc.frequency.value = cfg.root * ratio;
      osc.connect(filter); osc.start();
      nodes.push(osc);
    });
    const lfo = ctx.createOscillator(), lfoGain = ctx.createGain();
    lfo.frequency.value = cfg.lfo; lfoGain.gain.value = cfg.lfoDepth;
    lfo.connect(lfoGain); lfoGain.connect(filter.frequency); lfo.start();
    nodes.push(lfo, lfoGain);
    this.musicNodes = nodes;
    this.step = 0;
    const tick = () => {
      if (!this.ctx || this.musicMode !== mode || !this.musicBus) return;
      this.musicStep(mode, this.ctx.currentTime);
      this.step++;
      this.musicTimer = window.setTimeout(tick, mode === "tech" ? 180 : mode === "boss" ? 250 : 125);
    };
    this.musicTimer = window.setTimeout(tick, 600);
  }

  /** One sequencer tick: rhythm, melody fragments and ambience for the current place. */
  private musicStep(mode: Exclude<MusicMode, "none">, t: number) {
    const bus = this.musicBus!, n = this.step, r = Math.random();
    const minor = [0, 3, 5, 7, 10, 12, 15], major = [0, 2, 4, 7, 9, 12, 14];
    const note = (root: number, scale: number[]) => root * 2 ** (scale[Math.floor(Math.random() * scale.length)] / 12);
    switch (mode) {
      case "camp":
        if (r < 0.35) this.noiseBurstOn(bus, t, 0.03 + Math.random() * 0.05, 3000, 1500, 0.05 + Math.random() * 0.05, "bandpass");
        if (n % 24 === 0 && Math.random() < 0.7) this.tone(t, note(330, major), 0, 2.6, 0.06, "sine", bus);
        break;
      case "crypt":
        if (n % 40 === 0) this.tone(t, note(220, minor), 0, 3.2, 0.06, "sine", bus);
        if (r < 0.02) { const f = 1200 + Math.random() * 900; this.tone(t, f, f * 0.55, 0.12, 0.05, "sine", bus); }
        if (n % 64 === 32) this.noiseBurstOn(bus, t, 2.6, 300, 900, 0.05, "bandpass");
        break;
      case "tech": {
        const seq = [0, 7, 12, 7, 3, 10, 15, 10];
        this.tone(t, 110 * 2 ** (seq[n % 8] / 12), 0, 0.12, 0.035, "square", bus);
        if (r < 0.06) { const f = 1800 + Math.random() * 1600; this.tone(t, f, f * 1.2, 0.05, 0.03, "square", bus); }
        if (n % 32 === 0) this.tone(t, 90, 260, 0.8, 0.04, "sawtooth", bus);
        break;
      }
      case "flesh":
        if (n % 9 === 0) { this.tone(t, 70, 40, 0.18, 0.28, "sine", bus); this.tone(t + 0.22, 62, 36, 0.2, 0.22, "sine", bus); }
        if (r < 0.03) this.noiseBurstOn(bus, t, 0.18, 500, 120, 0.09, "lowpass");
        if (n % 72 === 36) this.tone(t, 140, 55, 1.6, 0.05, "sawtooth", bus);
        break;
      case "void":
        if (n % 32 === 0) this.tone(t, note(440, [0, 2, 6, 7, 11]), 0, 4, 0.04, "sine", bus);
        if (r < 0.04) { const f = 200 + Math.random() * 2400; this.tone(t, f, f * (Math.random() < 0.5 ? 0.5 : 2), 0.06, 0.03, "square", bus); }
        if (n % 48 === 20) this.noiseBurstOn(bus, t, 1.8, 4000, 7000, 0.035, "bandpass");
        break;
      case "boss":
        this.tone(t, n % 2 ? 87.3 : 43.65, 0, 0.18, 0.2, "square", bus);
        if (n % 4 === 0) this.noiseBurstOn(bus, t, 0.08, 2400, 600, 0.12, "lowpass");
        if (n % 16 === 8) this.tone(t, note(175, minor), 0, 1.2, 0.05, "sawtooth", bus);
        break;
    }
  }

  private stopMusic() {
    window.clearTimeout(this.musicTimer);
    for (const node of this.musicNodes) {
      try { if (node instanceof OscillatorNode) node.stop(); node.disconnect(); } catch { /* already stopped */ }
    }
    this.musicNodes = [];
  }

  /** Each Generations family has its own little voice; each Friend's seed tunes it slightly. */
  setVoice(family: string, seed: number) { this.voice = { family, pitch: 2 ** (((seed % 7) - 3) / 12) }; }

  friendVoice(action: VoiceAction) {
    const ctx = this.ctx, bus = this.sfxBus;
    if (!ctx || !bus || this.muted || ctx.state !== "running") return;
    const now = ctx.currentTime;
    if ((this.lastPlayed.get("voice") ?? -1) > now - 0.12) return;
    this.lastPlayed.set("voice", now);
    const t = now + 0.005, k = this.voice.pitch * (action === "hurt" ? 0.8 : action === "happy" ? 1.25 : 1);
    const lvl = action === "heavy" ? 0.07 : action === "hurt" ? 0.11 : 0.1;
    switch (this.voice.family) {
      case "Skeleton": this.noiseBurst(t, 0.03, 4000, 2500, lvl * 1.4, "highpass"); this.tone(t + 0.05, 820 * k, 760 * k, 0.05, lvl, "square"); this.noiseBurst(t + 0.09, 0.03, 4000, 2500, lvl, "highpass"); break;
      case "Mask": this.tone(t, 320 * k, 210 * k, 0.12, lvl * 1.4, "sine"); this.tone(t + 0.1, 280 * k, 190 * k, 0.1, lvl, "sine"); break;
      case "Family": this.tone(t, 880 * k, 900 * k, 0.07, lvl, "triangle"); this.tone(t + 0.08, 1175 * k, 1190 * k, 0.09, lvl, "triangle"); break;
      case "Cellular": this.tone(t, 300 * k, 900 * k, 0.09, lvl, "sine"); this.tone(t + 0.1, 420 * k, 1200 * k, 0.07, lvl * 0.7, "sine"); break;
      case "Asymmetry": this.tone(t, 700 * k, 300 * k, 0.12, lvl * 0.8, "square"); this.tone(t, 737 * k, 290 * k, 0.12, lvl * 0.8, "square"); break;
      case "Hoverer": this.noiseBurst(t, 0.22, 500, 2600, lvl, "bandpass"); this.tone(t, 520 * k, 700 * k, 0.2, lvl * 0.7, "sine"); break;
      case "Colossus": this.tone(t, 95 * k, 45 * k, 0.28, lvl * 2.2, "sine"); this.noiseBurst(t, 0.12, 600, 120, lvl * 1.5, "lowpass"); break;
      case "Sparkling": [1568, 2093, 2637].forEach((f, i) => this.tone(t + i * 0.05, f * k, f * k, 0.12, lvl * 0.8, "triangle")); break;
      case "Hollow": [1, 0.5, 0.25].forEach((g, i) => this.tone(t + i * 0.13, 660 * k, 640 * k, 0.1, lvl * g * 1.2, "sine")); break;
      default: this.tone(t, 600 * k, 800 * k, 0.1, lvl, "triangle");
    }
  }

  private noiseBurstOn(bus: AudioNode, t: number, duration: number, from: number, to: number, level: number, type: BiquadFilterType) {
    const ctx = this.ctx;
    if (!ctx || !this.noise) return;
    const source = ctx.createBufferSource(), filter = ctx.createBiquadFilter(), gain = ctx.createGain();
    source.buffer = this.noise;
    filter.type = type;
    filter.frequency.setValueAtTime(from, t);
    filter.frequency.exponentialRampToValueAtTime(Math.max(40, to), t + duration);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(level, t + Math.min(0.4, duration / 3));
    gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    source.connect(filter); filter.connect(gain); gain.connect(bus);
    source.start(t, Math.random() * 0.4); source.stop(t + duration + 0.02);
  }

  private tone(t: number, from: number, to: number, duration: number, level: number, type: OscillatorType, bus: AudioNode | null = this.sfxBus) {
    const ctx = this.ctx;
    if (!ctx || !bus) return;
    const osc = ctx.createOscillator(), gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(20, from), t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + duration);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(level, t + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    osc.connect(gain); gain.connect(bus);
    osc.start(t); osc.stop(t + duration + 0.02);
  }

  private noiseBurst(t: number, duration: number, from: number, to: number, level: number, type: BiquadFilterType) {
    const ctx = this.ctx, bus = this.sfxBus;
    if (!ctx || !bus || !this.noise) return;
    const source = ctx.createBufferSource(), filter = ctx.createBiquadFilter(), gain = ctx.createGain();
    source.buffer = this.noise;
    filter.type = type;
    filter.frequency.setValueAtTime(from, t);
    filter.frequency.exponentialRampToValueAtTime(Math.max(40, to), t + duration);
    gain.gain.setValueAtTime(level, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    source.connect(filter); filter.connect(gain); gain.connect(bus);
    source.start(t, Math.random() * 0.5); source.stop(t + duration + 0.02);
  }

  dispose() {
    this.stopMusic();
    this.kit.dispose();
    void this.ctx?.close();
    this.ctx = null;
  }
}
