/**
 * Little creepy dungeon tunes, composed as short looping songs and played by synthesized
 * instruments (music box, harpsichord, chip lead, bell, organ, plucked bass, soft drums).
 * Notes are scheduled ahead on the Web Audio clock, so timing stays tight.
 */
export type SongId = "camp" | "crypt" | "tech" | "flesh" | "void" | "boss";
type Instrument = "musicbox" | "harpsi" | "chip" | "bell" | "organ" | "pluck";
type Track = { inst: Instrument; level: number; bars: string[]; octaveUpOnSection3?: boolean; mutedOnSection1?: boolean };
type Song = {
  bpm: number; stepsPerBeat: number; stepsPerBar: number;
  tracks: Track[];
  /** Per-bar drum pattern characters: k kick, s snare, h hat, . rest. */
  drums?: string[]; drumLevel?: number;
  /** A quiet ambience one-shot for the place, and its chance per step. */
  ambience?: { kind: "crackle" | "drip" | "blip" | "squelch" | "glitch"; chance: number };
};

const PC: Record<string, number> = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };
/** "c#5" → frequency. "-" is a rest. */
function freq(token: string): number | null {
  const m = /^([a-g])(#|b)?(-?\d)$/.exec(token);
  if (!m) return null;
  const midi = (Number(m[3]) + 1) * 12 + PC[m[1]] + (m[2] === "#" ? 1 : m[2] === "b" ? -1 : 0);
  return 440 * 2 ** ((midi - 69) / 12);
}
const bar = (s: string) => s.trim().split(/\s+/);

const SONGS: Record<SongId, Song> = {
  // Camp: a gentle, melancholy music-box lullaby by the fire. A minor: Am, F, C, E.
  camp: {
    bpm: 72, stepsPerBeat: 4, stepsPerBar: 16, ambience: { kind: "crackle", chance: 0.18 },
    tracks: [
      { inst: "musicbox", level: 0.11, octaveUpOnSection3: true, mutedOnSection1: true, bars: [
        "e5 - - - c5 - d5 - e5 - - - a4 - - -", "f5 - - - e5 - d5 - c5 - - - a4 - - -",
        "g5 - - - e5 - c5 - d5 - e5 - g5 - - -", "e5 - - - g#4 - b4 - d5 - - - c5 - b4 -",
        "a5 - - - e5 - - - c5 - d5 - e5 - - -", "f5 - - - a5 - - - g5 - f5 - e5 - - -",
        "e5 - - - c5 - - - d5 - b4 - c5 - - -", "b4 - - - g#4 - - - a4 - - - - - - -",
      ] },
      { inst: "musicbox", level: 0.045, bars: [
        "a3 - c4 - e4 - c4 - a3 - c4 - e4 - c4 -", "f3 - a3 - c4 - a3 - f3 - a3 - c4 - a3 -",
        "c4 - e4 - g4 - e4 - c4 - e4 - g4 - e4 -", "e3 - g#3 - b3 - g#3 - e3 - g#3 - b3 - d4 -",
      ] },
      { inst: "pluck", level: 0.1, bars: ["a2 - - - - - - - e2 - - - - - - -", "f2 - - - - - - - c3 - - - - - - -", "c3 - - - - - - - g2 - - - - - - -", "e2 - - - - - - - b1 - - - - - - -"] },
    ],
  },
  // Crypts: a creepy danse-macabre waltz. D harmonic minor in 3/4: Dm, Bb, Gm, A7.
  crypt: {
    bpm: 108, stepsPerBeat: 4, stepsPerBar: 12, ambience: { kind: "drip", chance: 0.03 },
    drums: ["k - - - h - - - h - - -"], drumLevel: 0.5,
    tracks: [
      { inst: "harpsi", level: 0.1, octaveUpOnSection3: true, mutedOnSection1: true, bars: [
        "a4 - - - d5 - - - f5 - e5 -", "d5 - - - bb4 - - - f4 - - -", "g4 - a4 - bb4 - - - d5 - c5 -", "c#5 - - - e5 - - - a4 - - -",
        "a5 - - - f5 - - - d5 - e5 -", "f5 - - - d5 - - - bb4 - - -", "g4 - bb4 - d5 - - - g5 - f5 -", "e5 - c#5 - a4 - - - - - - -",
      ] },
      { inst: "organ", level: 0.05, bars: [
        "- - - - f3 - - - a3 - - -", "- - - - d3 - - - f3 - - -", "- - - - bb3 - - - d4 - - -", "- - - - c#4 - - - g3 - - -",
      ] },
      { inst: "pluck", level: 0.11, bars: ["d2 - - - - - - - - - - -", "bb1 - - - - - - - - - - -", "g2 - - - - - - - - - - -", "a1 - - - - - - - e2 - - -"] },
    ],
  },
  // Signal Vaults: a nervous chiptune. E minor: Em, C, D, B.
  tech: {
    bpm: 124, stepsPerBeat: 4, stepsPerBar: 16, ambience: { kind: "blip", chance: 0.02 },
    drums: ["k - h - s - h - k - h - s - h h"], drumLevel: 0.55,
    tracks: [
      { inst: "chip", level: 0.07, mutedOnSection1: true, bars: [
        "b4 - - - e5 - - - d5 - b4 - - - - -", "c5 - - - e5 - - - g5 - e5 - - - - -",
        "f#5 - - - d5 - - - a4 - d5 - f#5 - - -", "d#5 - - - f#5 - - - b5 - a5 - f#5 - d#5 -",
        "e5 - g5 - b5 - - - a5 - g5 - e5 - - -", "c5 - e5 - g5 - - - c6 - b5 - g5 - - -",
        "d5 - f#5 - a5 - - - d6 - c6 - a5 - - -", "b5 - - - a5 - - - f#5 - - - d#5 - - -",
      ] },
      { inst: "chip", level: 0.03, bars: [
        "e4 g4 b4 e5 g4 b4 e5 b4 e4 g4 b4 e5 g4 b4 e5 b4", "c4 e4 g4 c5 e4 g4 c5 g4 c4 e4 g4 c5 e4 g4 c5 g4",
        "d4 f#4 a4 d5 f#4 a4 d5 a4 d4 f#4 a4 d5 f#4 a4 d5 a4", "b3 d#4 f#4 b4 d#4 f#4 b4 f#4 b3 d#4 f#4 a4 d#4 f#4 a4 f#4",
      ] },
      { inst: "pluck", level: 0.1, bars: ["e2 - e2 - e3 - e2 - e2 - e2 - e3 - e2 -", "c2 - c2 - c3 - c2 - c2 - c2 - c3 - c2 -", "d2 - d2 - d3 - d2 - d2 - d2 - d3 - d2 -", "b1 - b1 - b2 - b1 - b1 - b1 - b2 - a1 -"] },
    ],
  },
  // Hollow Deep: a slow, uneasy bell tune over a heartbeat. C harmonic minor: Cm, Ab, Fm, G.
  flesh: {
    bpm: 70, stepsPerBeat: 4, stepsPerBar: 16, ambience: { kind: "squelch", chance: 0.015 },
    drums: ["k - - k - - - - - - - - - - - -"], drumLevel: 0.9,
    tracks: [
      { inst: "bell", level: 0.08, mutedOnSection1: true, bars: [
        "g4 - - - - - - - eb5 - - - d5 - - -", "c5 - - - - - - - ab4 - - - - - - -",
        "f4 - - - ab4 - - - c5 - - - b4 - - -", "d5 - - - - - - - b4 - - - g4 - - -",
        "c5 - - - eb5 - - - g5 - - - f5 - - -", "eb5 - - - c5 - - - ab4 - - - - - - -",
        "ab4 - - - f4 - - - d5 - - - c5 - - -", "b4 - - - - - - - g4 - - - - - - -",
      ] },
      { inst: "organ", level: 0.045, bars: ["c3 - - - - - - - eb3 - - - - - - -", "ab2 - - - - - - - c3 - - - - - - -", "f2 - - - - - - - ab2 - - - - - - -", "g2 - - - - - - - b2 - - - - - - -"] },
      { inst: "pluck", level: 0.09, bars: ["c2 - - - - - - - - - - - g1 - - -", "ab1 - - - - - - - - - - - eb2 - - -", "f1 - - - - - - - - - - - c2 - - -", "g1 - - - - - - - - - - - d2 - - -"] },
    ],
  },
  // The Void: glassy whole-tone bells, dreamy and wrong.
  void: {
    bpm: 80, stepsPerBeat: 4, stepsPerBar: 16, ambience: { kind: "glitch", chance: 0.02 },
    tracks: [
      { inst: "bell", level: 0.1, octaveUpOnSection3: false, mutedOnSection1: true, bars: [
        "c6 - - - - - g#5 - - - e5 - - - - -", "f#5 - - - - - a#5 - - - d6 - - - - -",
        "e6 - - - c6 - - - g#5 - - - - - - -", "a#5 - - - f#5 - - - d5 - - - - - - -",
      ] },
      { inst: "musicbox", level: 0.04, bars: ["c4 - e4 - g#4 - e4 - c4 - e4 - g#4 - e4 -", "d4 - f#4 - a#4 - f#4 - d4 - f#4 - a#4 - f#4 -", "e4 - g#4 - c5 - g#4 - e4 - g#4 - c5 - g#4 -", "f#4 - a#4 - d5 - a#4 - f#4 - a#4 - d5 - a#4 -"] },
      { inst: "pluck", level: 0.07, bars: ["c2 - - - - - - - - - - - - - - -", "d2 - - - - - - - - - - - - - - -", "e2 - - - - - - - - - - - - - - -", "f#2 - - - - - - - - - - - - - - -"] },
    ],
  },
  // Boss: driving and menacing. D minor.
  boss: {
    bpm: 148, stepsPerBeat: 4, stepsPerBar: 16,
    drums: ["k - h - s - h - k - k - s - h h"], drumLevel: 0.7,
    tracks: [
      { inst: "harpsi", level: 0.09, bars: [
        "d5 - - - - - c#5 - d5 - f5 - e5 - d5 -", "d5 - - - bb4 - - - - - a4 - bb4 - - -",
        "c5 - - - e5 - - - g5 - f5 - e5 - c5 -", "a4 - c#5 - e5 - g5 - f5 - e5 - c#5 - a4 -",
      ] },
      { inst: "organ", level: 0.05, bars: ["- - d4 - - - a3 - - - d4 - - - f4 -", "- - bb3 - - - f3 - - - d4 - - - bb3 -", "- - c4 - - - g3 - - - e4 - - - c4 -", "- - c#4 - - - a3 - - - e4 - - - g4 -"] },
      { inst: "pluck", level: 0.12, bars: ["d2 d2 d3 d2 d2 d2 d3 d2 d2 d2 d3 d2 f2 d2 d3 d2", "bb1 bb1 bb2 bb1 bb1 bb1 bb2 bb1 bb1 bb1 bb2 bb1 d2 bb1 bb2 bb1", "c2 c2 c3 c2 c2 c2 c3 c2 c2 c2 c3 c2 e2 c2 c3 c2", "a1 a1 a2 a1 a1 a1 a2 a1 c#2 c#2 c#3 c#2 e2 e2 g2 e2"] },
    ],
  },
};

export class MusicPlayer {
  private timer = 0;
  private song: Song | null = null;
  private step = 0;
  private next = 0;
  constructor(private readonly ctx: AudioContext, private readonly bus: AudioNode, private readonly noise: AudioBuffer) {}

  start(id: SongId) {
    this.stop();
    this.song = SONGS[id];
    this.step = 0;
    this.next = this.ctx.currentTime + 0.3;
    this.timer = window.setInterval(() => this.schedule(), 25);
  }

  stop() { window.clearInterval(this.timer); this.song = null; }
  get playing() { return this.song !== null; }

  /** Schedule a whole stretch of a song at once (used to render previews offline). */
  prime(id: SongId, seconds: number) {
    this.song = SONGS[id];
    this.step = 0;
    this.next = 0.05;
    const stepDur = 60 / this.song.bpm / this.song.stepsPerBeat;
    while (this.next < seconds) { this.playStep(this.song, this.step, this.next, stepDur); this.step++; this.next += stepDur; }
    this.song = null;
  }

  private schedule() {
    const song = this.song;
    if (!song) return;
    const stepDur = 60 / song.bpm / song.stepsPerBeat;
    while (this.next < this.ctx.currentTime + 0.12) {
      this.playStep(song, this.step, this.next, stepDur);
      this.step++;
      this.next += stepDur;
    }
  }

  private playStep(song: Song, step: number, t: number, stepDur: number) {
    const inBar = step % song.stepsPerBar, barIndex = Math.floor(step / song.stepsPerBar);
    const longest = Math.max(...song.tracks.map(tr => tr.bars.length));
    const section = Math.floor(barIndex / longest) % 4;
    for (const track of song.tracks) {
      if (track.mutedOnSection1 && section === 1) continue;
      const tokens = bar(track.bars[barIndex % track.bars.length]);
      const f = freq(tokens[inBar] ?? "-");
      if (f === null) continue;
      // Hold the note until the next note or rest in the bar.
      let len = 1;
      while (inBar + len < tokens.length && tokens[inBar + len] === "-" && len < 8) len++;
      this.note(track.inst, t, f * (track.octaveUpOnSection3 && section === 3 ? 2 : 1), len * stepDur, track.level);
    }
    if (song.drums) {
      const hit = bar(song.drums[barIndex % song.drums.length])[inBar];
      const lv = song.drumLevel ?? 0.5;
      if (hit === "k") this.kick(t, lv);
      if (hit === "s") this.hit(t, 0.1, 1800, 900, 0.05 * lv, "bandpass");
      if (hit === "h") this.hit(t, 0.03, 8000, 6000, 0.025 * lv, "highpass");
    }
    const amb = song.ambience;
    if (amb && Math.random() < amb.chance) this.ambience(amb.kind, t);
  }

  private env(t: number, level: number, attack: number, decay: number): GainNode {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(level, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    g.connect(this.bus);
    return g;
  }
  private osc(type: OscillatorType, f: number, t: number, stop: number, out: AudioNode, detune = 0) {
    const o = this.ctx.createOscillator();
    o.type = type; o.frequency.value = f; o.detune.value = detune;
    o.connect(out); o.start(t); o.stop(stop);
  }

  private note(inst: Instrument, t: number, f: number, dur: number, level: number) {
    switch (inst) {
      case "musicbox": {
        const g = this.env(t, level, 0.004, 1.3);
        this.osc("sine", f, t, t + 1.4, g);
        const g2 = this.env(t, level * 0.25, 0.003, 0.4);
        this.osc("sine", f * 4, t, t + 0.5, g2);
        break;
      }
      case "harpsi": {
        const filter = this.ctx.createBiquadFilter();
        filter.type = "lowpass"; filter.frequency.setValueAtTime(3200, t); filter.frequency.exponentialRampToValueAtTime(700, t + 0.5);
        const g = this.env(t, level, 0.003, Math.min(0.9, dur + 0.25));
        filter.connect(g);
        this.osc("sawtooth", f, t, t + 1, filter);
        this.osc("sawtooth", f * 2, t, t + 1, filter, 4);
        break;
      }
      case "chip": {
        const g = this.env(t, level, 0.004, Math.max(0.08, Math.min(0.5, dur * 0.9)));
        this.osc("square", f, t, t + dur + 0.1, g);
        break;
      }
      case "bell": {
        const g = this.env(t, level, 0.005, 2.4);
        this.osc("sine", f, t, t + 2.5, g);
        const g2 = this.env(t, level * 0.35, 0.004, 1.1);
        this.osc("sine", f * 2.76, t, t + 1.2, g2);
        const g3 = this.env(t, level * 0.12, 0.003, 0.5);
        this.osc("sine", f * 5.4, t, t + 0.6, g3);
        break;
      }
      case "organ": {
        const g = this.ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(level, t + 0.08);
        g.gain.setValueAtTime(level, t + Math.max(0.1, dur - 0.08));
        g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.15);
        const filter = this.ctx.createBiquadFilter();
        filter.type = "lowpass"; filter.frequency.value = 1100;
        filter.connect(g); g.connect(this.bus);
        this.osc("square", f, t, t + dur + 0.2, filter);
        this.osc("sine", f / 2, t, t + dur + 0.2, filter);
        break;
      }
      case "pluck": {
        const filter = this.ctx.createBiquadFilter();
        filter.type = "lowpass"; filter.frequency.setValueAtTime(900, t); filter.frequency.exponentialRampToValueAtTime(180, t + 0.35);
        const g = this.env(t, level, 0.004, Math.min(0.6, dur + 0.15));
        filter.connect(g);
        this.osc("triangle", f, t, t + 0.8, filter);
        this.osc("sawtooth", f, t, t + 0.8, filter, -6);
        break;
      }
    }
  }

  private kick(t: number, level: number) {
    const g = this.env(t, 0.22 * level, 0.002, 0.22);
    const o = this.ctx.createOscillator();
    o.frequency.setValueAtTime(130, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.2);
    o.connect(g); o.start(t); o.stop(t + 0.25);
  }

  private hit(t: number, duration: number, from: number, to: number, level: number, type: BiquadFilterType) {
    const source = this.ctx.createBufferSource(), filter = this.ctx.createBiquadFilter();
    source.buffer = this.noise;
    filter.type = type;
    filter.frequency.setValueAtTime(from, t); filter.frequency.exponentialRampToValueAtTime(Math.max(40, to), t + duration);
    const g = this.env(t, level, 0.002, duration);
    source.connect(filter); filter.connect(g);
    source.start(t, Math.random() * 0.5); source.stop(t + duration + 0.02);
  }

  private ambience(kind: NonNullable<Song["ambience"]>["kind"], t: number) {
    switch (kind) {
      case "crackle": this.hit(t, 0.03 + Math.random() * 0.04, 3200, 1400, 0.04 + Math.random() * 0.04, "bandpass"); break;
      case "drip": { const f = 1300 + Math.random() * 900; const g = this.env(t, 0.05, 0.002, 0.15); const o = this.ctx.createOscillator(); o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(f * 0.5, t + 0.12); o.connect(g); o.start(t); o.stop(t + 0.2); break; }
      case "blip": { const g = this.env(t, 0.025, 0.002, 0.06); this.osc("square", 1800 + Math.random() * 1600, t, t + 0.08, g); break; }
      case "squelch": this.hit(t, 0.16, 600, 120, 0.07, "lowpass"); break;
      case "glitch": { const g = this.env(t, 0.025, 0.002, 0.05); this.osc("square", 200 + Math.random() * 2400, t, t + 0.07, g); break; }
    }
  }
}
