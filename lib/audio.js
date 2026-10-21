// Background music and sound effects. Music is CC0 chiptune by Juhani Junkala
// (see README) served from public/audio; the effects are synthesized with Web Audio.
// Both can be switched off, and the choice is remembered.
import { load, save } from './storage';

const TRACKS = {
  lobby: { src: '/audio/lobby.mp3', loop: true },
  round: { src: '/audio/round.mp3', loop: true },
  trivia: { src: '/audio/trivia.mp3', loop: true },
  victory: { src: '/audio/victory.mp3', loop: false },
};
const MUSIC_VOLUME = 0.28;

const isOn = (kind) => load(`bitbench.${kind}`, true) !== false;
export const soundPrefs = () => ({ music: isOn('music'), sfx: isOn('sfx') });
export function setSoundPref(kind, on) {
  save(`bitbench.${kind}`, on);
  if (kind === 'music') playMusic(wanted);
}

// ---------- Music ----------
let audio = null;
let wanted = null; // the track the game asked for, kept while music is muted

// Browsers block audio until the page has had a click, so a failed play() is ignored.
export function playMusic(name) {
  wanted = name || null;
  if (typeof window === 'undefined') return;
  if (!wanted || !isOn('music')) { audio?.pause(); return; }
  const t = TRACKS[wanted];
  if (!audio) {
    audio = new Audio();
    audio.volume = MUSIC_VOLUME;
  }
  if (audio.dataset.track !== wanted) {
    audio.dataset.track = wanted;
    audio.src = t.src;
    audio.loop = t.loop;
  } else if (!audio.paused || audio.ended) return;
  audio.play().catch(() => {});
}

export const stopMusic = () => playMusic(null);

// ---------- Effects ----------
let ac = null;
function ctx() {
  if (!ac) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ac = new AC();
  }
  if (ac.state === 'suspended') ac.resume().catch(() => {});
  return ac;
}

function tone(freq, start, dur, { type = 'square', vol = 0.07, slide } = {}) {
  const c = ctx();
  if (!c) return;
  const t = c.currentTime + start;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(c.destination);
  o.start(t);
  o.stop(t + dur + 0.02);
}

const note = (semitones) => 523.25 * 2 ** (semitones / 12); // semitones from C5
const ARP = [0, 4, 7, 12, 16, 19, 24];
const guard = (fn) => (...args) => { if (typeof window !== 'undefined' && isOn('sfx')) fn(...args); };

export const sfx = {
  // A longer arpeggio the hotter your streak is.
  correct: guard((streak = 1) => {
    ARP.slice(0, Math.min(ARP.length, 2 + streak)).forEach((s, i) => tone(note(s), i * 0.07, 0.16));
  }),
  first: guard(() => {
    [0, 4, 7, 12].forEach((s, i) => tone(note(s), i * 0.06, 0.14));
    tone(note(24), 0.28, 0.45, { type: 'triangle', vol: 0.1 });
  }),
  wrong: guard(() => {
    tone(note(-5), 0, 0.16, { type: 'sawtooth', vol: 0.05 });
    tone(note(-11), 0.15, 0.32, { type: 'sawtooth', vol: 0.05, slide: note(-15) });
  }),
  lock: guard(() => tone(note(12), 0, 0.06, { type: 'triangle', vol: 0.06 })),
  tick: guard(() => tone(note(19), 0, 0.05, { vol: 0.035 })),
  start: guard(() => [0, 7, 12, 19].forEach((s, i) => tone(note(s), i * 0.11, 0.22, { type: 'triangle', vol: 0.1 }))),
};
