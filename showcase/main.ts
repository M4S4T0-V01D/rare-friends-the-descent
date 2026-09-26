// The /live-preview showcase page: no wallet, no game session. It renders the family guide straight from the
// game's own kit and trait tables (so the page cannot drift from the game) and plays each family's real voice.
import { AudioEngine, type VoiceAction } from "../src/audio/audio";
import { ATTACKS, BOLTS, DODGES, friendKit } from "../src/game/kit";
import { FAMILY_TRAITS } from "../src/game/stats";

const FAMILIES = ["Skeleton", "Mask", "Family", "Cellular", "Asymmetry", "Hoverer", "Colossus", "Sparkling", "Hollow"] as const;
const VOICES: Readonly<Record<(typeof FAMILIES)[number], string>> = {
  Skeleton: "bone clacks", Mask: "hollow toks", Family: "chirps", Cellular: "bubbles", Asymmetry: "detuned zaps",
  Hoverer: "airy whooshes", Colossus: "deep thuds", Sparkling: "chimes", Hollow: "echoing pings",
};

const audio = new AudioEngine();
let unlocked: Promise<boolean> | null = null;

async function speak(family: string, button: HTMLButtonElement) {
  unlocked ??= audio.unlock();
  if (!(await unlocked)) return;
  audio.setVoice(family, 3);
  button.classList.add("speaking");
  const lines: VoiceAction[] = ["greet", "signature", "happy", "heavy"];
  lines.forEach((line, i) => setTimeout(() => audio.friendVoice(line), i * 420));
  setTimeout(() => button.classList.remove("speaking"), lines.length * 420);
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[K]> = {}, ...children: (Node | string)[]) {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
}

function familyCard(family: (typeof FAMILIES)[number]) {
  const sig = friendKit(family, 0).signature, trait = FAMILY_TRAITS[family];
  const slug = family.toLowerCase();
  const video = el("video", { muted: true, loop: true, playsInline: true, preload: "none", poster: `media/families/${slug}.jpg` },
    el("source", { src: `media/families/${slug}.webm`, type: "video/webm" }),
    el("source", { src: `media/families/${slug}.mp4`, type: "video/mp4" }));
  video.setAttribute("aria-label", `${sig.name}, the ${family} signature ability, cast in a fight`);
  const voice = el("button", { type: "button", className: "voice" }, "▶ Hear its voice");
  voice.addEventListener("click", () => void speak(family, voice));
  const card = el("article", { className: "family" },
    el("div", { className: "clip" }, video),
    el("div", { className: "family-body" },
      el("h3", {}, family),
      el("p", { className: "sig" }, el("span", { className: "key" }, "R"), el("strong", {}, sig.name), ` · ${sig.energy} energy · ${sig.cd}s`),
      el("p", {}, sig.text),
      el("p", { className: "trait" }, el("strong", {}, trait.name), ` · ${trait.text}`),
      el("p", { className: "voice-line" }, `Voice: ${VOICES[family]}. `, voice),
    ),
  );
  card.style.setProperty("--sig", sig.color);
  return { card, video };
}

function styleTable(rows: readonly { name: string; text: string }[]) {
  return el("ul", { className: "styles" }, ...rows.map(r => el("li", {}, el("strong", {}, r.name), ` · ${r.text}`)));
}

const grid = document.getElementById("families")!;
const videos: HTMLVideoElement[] = [];
for (const family of FAMILIES) { const { card, video } = familyCard(family); grid.append(card); videos.push(video); }

// Clips play only while on screen (and never with reduced motion).
const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
if (!still && "IntersectionObserver" in window) {
  const io = new IntersectionObserver(entries => {
    for (const entry of entries) {
      const v = entry.target as HTMLVideoElement;
      if (entry.isIntersecting) void v.play().catch(() => {}); else v.pause();
    }
  }, { threshold: 0.35 });
  videos.forEach(v => io.observe(v));
}

document.getElementById("attacks")!.replaceWith(styleTable(ATTACKS));
document.getElementById("bolts")!.replaceWith(styleTable(BOLTS));
document.getElementById("dodges")!.replaceWith(styleTable(DODGES));
