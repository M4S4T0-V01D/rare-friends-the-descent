import { MusicPlayer, type RoomSong, type SongId } from "./music";
import { createFriendSoundKit, type FriendSoundCue, type FriendSoundKit } from "@rarefriends/friendsdk/sounds";

/**
 * Procedural combat audio plus the FriendSDK sound kit for rewards and RF moments.
 * No recordings: everything is synthesized, and nothing plays until a player gesture unlocks audio.
 */
/** One mood per place: the camp, each floor style, and boss fights. */
export type MusicMode = "none" | "camp" | "crypt" | "tech" | "flesh" | "void" | "boss";
export type { RoomSong } from "./music";
export type VoiceAction = "greet" | "dodge" | "hurt" | "signature" | "happy" | "heavy";

export type SfxName =
  | "swing" | "heavySwing" | "hit" | "crit" | "enemyDie" | "playerHurt" | "dodge" | "bolt" | "nova" | "potion"
  | "coin" | "spend" | "pickup" | "levelUp" | "doorLock" | "doorOpen" | "enemySwing" | "enemyShot" | "charge"
  | "slam" | "roar" | "summon" | "blink" | "telegraph" | "death" | "ui" | "deny" | "shrine" | "explode" | "burn";

type Layer = { player: MusicPlayer; gain: GainNode };

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
  /** The place tune (camp, floor or boss) and the special-room tune that fades in over it. */
  private place: Layer | null = null;
  private room: Layer | null = null;
  private roomSong: RoomSong | null = null;
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
        this.musicBus = this.ctx.createGain(); this.musicBus.gain.value = this.musicOn ? 0.45 : 0; this.musicBus.connect(this.master);
        const length = this.ctx.sampleRate;
        this.noise = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
        const data = this.noise.getChannelData(0);
        for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
      }
      if (this.ctx.state !== "running") await this.ctx.resume();
      await this.kit.unlock();
      if (this.musicMode !== "none" && !this.place) this.place = this.startLayer(this.musicMode, this.roomSong ? 0 : 1, 1.2);
      if (this.roomSong && !this.room) this.room = this.startLayer(this.roomSong, 1, 1.5);
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
    if (this.musicBus && this.ctx) this.musicBus.gain.setTargetAtTime(on ? 0.45 : 0, this.ctx.currentTime, 0.2);
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

  /** Each place has its own tune. Changing place crossfades rather than cutting. */
  setMusicMode(mode: MusicMode) {
    if (mode === this.musicMode) return;
    this.musicMode = mode;
    this.fadeOut(this.place, mode === "none" ? 0.5 : 0.9);
    this.place = mode === "none" ? null : this.startLayer(mode, this.roomSong ? 0 : 1, 1.0);
  }

  /**
   * Special rooms (shrines, The Corpse, the merchant, treasure, secrets…) have their own tune.
   * It fades in as you walk in, the place tune ducks under it, and both reverse as you walk out.
   */
  setRoomSong(song: RoomSong | null) {
    if (song === this.roomSong) return;
    this.roomSong = song;
    this.fadeOut(this.room, 1.4);
    this.room = song ? this.startLayer(song, 1, 1.6) : null;
    this.ramp(this.place, song ? 0 : 1, song ? 1.2 : 1.8);
  }
  get currentRoomSong() { return this.roomSong; }

  private startLayer(id: SongId, target: number, fade: number): Layer | null {
    const ctx = this.ctx;
    if (!ctx || !this.musicBus || !this.noise) return null;
    const gain = ctx.createGain();
    gain.gain.value = 0.0001;
    gain.connect(this.musicBus);
    const player = new MusicPlayer(ctx, gain, this.noise);
    player.start(id);
    const layer = { player, gain };
    this.ramp(layer, target, fade);
    return layer;
  }

  private ramp(layer: Layer | null, target: number, seconds: number) {
    const ctx = this.ctx;
    if (!layer || !ctx) return;
    const g = layer.gain.gain, now = ctx.currentTime;
    g.cancelScheduledValues(now);
    g.setValueAtTime(Math.max(0.0001, g.value), now);
    g.linearRampToValueAtTime(Math.max(0.0001, target), now + seconds);
  }

  private fadeOut(layer: Layer | null, seconds: number) {
    if (!layer) return;
    this.ramp(layer, 0, seconds);
    window.setTimeout(() => { layer.player.stop(); layer.gain.disconnect(); }, seconds * 1000 + 400);
  }

  private stopMusic() {
    for (const layer of [this.place, this.room]) if (layer) { layer.player.stop(); layer.gain.disconnect(); }
    this.place = null; this.room = null;
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

  /** Render a song to 16-bit PCM WAV bytes offline (for previews and tests; never used in play). */
  static async renderSong(id: SongId, seconds: number): Promise<Uint8Array> {
    const rate = 22050, ctx = new OfflineAudioContext(1, rate * seconds, rate);
    const noise = ctx.createBuffer(1, rate, rate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const bus = ctx.createGain(); bus.gain.value = 1.4; bus.connect(ctx.destination);
    new MusicPlayer(ctx as unknown as AudioContext, bus, noise).prime(id, seconds - 0.5);
    const pcm = (await ctx.startRendering()).getChannelData(0);
    const out = new DataView(new ArrayBuffer(44 + pcm.length * 2));
    const text = (o: number, str: string) => { for (let i = 0; i < str.length; i++) out.setUint8(o + i, str.charCodeAt(i)); };
    text(0, "RIFF"); out.setUint32(4, 36 + pcm.length * 2, true); text(8, "WAVEfmt "); out.setUint32(16, 16, true);
    out.setUint16(20, 1, true); out.setUint16(22, 1, true); out.setUint32(24, rate, true); out.setUint32(28, rate * 2, true);
    out.setUint16(32, 2, true); out.setUint16(34, 16, true); text(36, "data"); out.setUint32(40, pcm.length * 2, true);
    for (let i = 0; i < pcm.length; i++) out.setInt16(44 + i * 2, Math.max(-1, Math.min(1, pcm[i])) * 32767, true);
    return new Uint8Array(out.buffer);
  }

  dispose() {
    this.stopMusic();
    this.kit.dispose();
    void this.ctx?.close();
    this.ctx = null;
  }
}
