import { createFriendSoundKit, type FriendSoundCue, type FriendSoundKit } from "@rarefriends/friendsdk/sounds";

/**
 * Procedural combat audio plus the FriendSDK sound kit for rewards and RF moments.
 * No recordings: everything is synthesized, and nothing plays until a player gesture unlocks audio.
 */
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
  private musicMode: "none" | "ambient" | "boss" = "none";
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

  /** Ambient drone for exploration; a pulsing bass for boss arenas. */
  setMusicMode(mode: "none" | "ambient" | "boss") {
    if (mode === this.musicMode) return;
    this.musicMode = mode;
    this.stopMusic();
    if (mode !== "none") this.startMusic(mode);
  }

  private startMusic(mode: "ambient" | "boss") {
    const ctx = this.ctx, bus = this.musicBus;
    if (!ctx || !bus) return;
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass"; filter.frequency.value = mode === "boss" ? 700 : 420; filter.Q.value = 3;
    const drone = ctx.createGain(); drone.gain.value = 0;
    drone.gain.setTargetAtTime(mode === "boss" ? 0.22 : 0.18, ctx.currentTime, 1.5);
    filter.connect(drone); drone.connect(bus);
    const root = mode === "boss" ? 43.65 : 55;
    const nodes: AudioNode[] = [filter, drone];
    for (const ratio of [1, 1.003, 1.5, 2.01]) {
      const osc = ctx.createOscillator();
      osc.type = ratio === 1.5 ? "triangle" : "sawtooth";
      osc.frequency.value = root * ratio;
      osc.connect(filter); osc.start();
      nodes.push(osc);
    }
    const lfo = ctx.createOscillator(), lfoGain = ctx.createGain();
    lfo.frequency.value = mode === "boss" ? 2 : 0.07; lfoGain.gain.value = mode === "boss" ? 260 : 180;
    lfo.connect(lfoGain); lfoGain.connect(filter.frequency); lfo.start();
    nodes.push(lfo, lfoGain);
    this.musicNodes = nodes;
    // Sparse bells over the drone: a minor pentatonic walk.
    const scale = [0, 3, 5, 7, 10, 12, 15];
    const bell = () => {
      if (!this.ctx || this.musicMode === "none" || !this.musicBus) return;
      const now = this.ctx.currentTime;
      const note = 220 * 2 ** (scale[Math.floor(Math.random() * scale.length)] / 12) * (mode === "boss" ? 0.5 : 1);
      this.tone(now, note, note, 2.4, mode === "boss" ? 0.05 : 0.07, "sine", this.musicBus);
      if (mode === "boss") this.tone(now, root * 2, root * 2, 0.18, 0.2, "square", this.musicBus);
      this.musicTimer = window.setTimeout(bell, mode === "boss" ? 500 : 2600 + Math.random() * 3000);
    };
    this.musicTimer = window.setTimeout(bell, 800);
  }

  private stopMusic() {
    window.clearTimeout(this.musicTimer);
    for (const node of this.musicNodes) {
      try { if (node instanceof OscillatorNode) node.stop(); node.disconnect(); } catch { /* already stopped */ }
    }
    this.musicNodes = [];
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
