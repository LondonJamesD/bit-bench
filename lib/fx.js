// Canvas particles: a burst of confetti and 1s and 0s on a correct answer,
// fireworks and falling confetti for the winner. Everything draws on one
// fixed, click-through canvas that stops animating when it's empty.
let cv = null;
let cx = null;
let parts = [];
let raf = 0;

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const reduced = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export const cssVar = (name) =>
  typeof document === 'undefined' ? '' : getComputedStyle(document.documentElement).getPropertyValue(name).trim();
// Player colour classes are c1..c10, matching --p1..--p10.
export const playerColor = (cls) => cssVar(`--p${String(cls || 'c1').slice(1)}`);

function ready() {
  if (typeof window === 'undefined' || reduced()) return false;
  if (cv) return true;
  cv = document.createElement('canvas');
  cv.className = 'fx-canvas';
  cv.setAttribute('aria-hidden', 'true');
  document.body.appendChild(cv);
  cx = cv.getContext('2d');
  const size = () => {
    const d = window.devicePixelRatio || 1;
    cv.width = window.innerWidth * d;
    cv.height = window.innerHeight * d;
    cx.setTransform(d, 0, 0, d, 0, 0);
  };
  size();
  window.addEventListener('resize', size);
  return true;
}

function spawn(p) {
  parts.push(p);
  if (!raf) raf = requestAnimationFrame(step);
}

function step() {
  const w = window.innerWidth, h = window.innerHeight;
  cx.clearRect(0, 0, w, h);
  parts = parts.filter((p) => p.life > 0 && p.y < h + 40);
  for (const p of parts) {
    p.vx *= p.drag;
    p.vy = p.vy * p.drag + p.g;
    p.x += p.vx;
    p.y += p.vy;
    p.rot += p.vr;
    p.life--;
    cx.globalAlpha = Math.min(1, p.life / 25);
    cx.save();
    cx.translate(p.x, p.y);
    cx.rotate(p.rot);
    cx.fillStyle = p.color;
    if (p.glyph) {
      cx.font = `600 ${Math.round(p.size * 2.2)}px "IBM Plex Mono", ui-monospace, monospace`;
      cx.textAlign = 'center';
      cx.textBaseline = 'middle';
      cx.fillText(p.glyph, 0, 0);
    } else cx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
    cx.restore();
  }
  cx.globalAlpha = 1;
  raf = parts.length ? requestAnimationFrame(step) : 0;
}

const glyph = (chance) => (Math.random() < chance ? pick(['0', '1']) : null);

export function burst(x, y, { colors, count = 40, power = 9 } = {}) {
  if (!ready()) return;
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const s = power * (0.3 + Math.random() * 0.7);
    spawn({
      x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - power * 0.35, g: 0.22, drag: 0.96,
      rot: Math.random() * 6, vr: (Math.random() - 0.5) * 0.3, size: 5 + Math.random() * 5,
      life: 60 + Math.random() * 45, color: pick(colors), glyph: glyph(0.45),
    });
  }
}

export function burstAt(el, opts) {
  if (!el) return;
  const r = el.getBoundingClientRect();
  burst(r.left + r.width / 2, r.top + r.height / 2, opts);
}

export function fireworks({ colors, shots = 5 } = {}) {
  for (let i = 0; i < shots; i++) {
    setTimeout(() => burst(
      window.innerWidth * (0.15 + Math.random() * 0.7),
      window.innerHeight * (0.15 + Math.random() * 0.35),
      { colors, count: 55, power: 11 },
    ), i * 320);
  }
}

export function confetti({ colors, duration = 3000, rate = 5 } = {}) {
  if (!ready()) return;
  const end = performance.now() + duration;
  const drop = () => {
    for (let i = 0; i < rate; i++) {
      spawn({
        x: Math.random() * window.innerWidth, y: -20, vx: (Math.random() - 0.5) * 3, vy: 2 + Math.random() * 3,
        g: 0.05, drag: 0.995, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 0.25,
        size: 7 + Math.random() * 6, life: 500, color: pick(colors), glyph: glyph(0.2),
      });
    }
    if (performance.now() < end) requestAnimationFrame(drop);
  };
  drop();
}
