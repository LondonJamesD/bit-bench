// Pure game logic: question generation, answer checking, scoring.
// No browser APIs here, so the host can run it and it can be tested in Node.

export const TYPES = [
  { id: 'b2d', name: 'Binary → decimal', group: 'Conversion', desc: 'Read a binary number' },
  { id: 'd2b', name: 'Decimal → binary', group: 'Conversion', desc: 'Write a number in binary' },
  { id: 'calc1', name: '1-step calculation', group: 'Arithmetic', desc: 'A op B', arith: true },
  { id: 'calc2', name: '2-step calculation', group: 'Arithmetic', desc: '(A op B) op C', arith: true },
  { id: 'find', name: 'Find the missing number', group: 'Arithmetic', desc: 'A op ? = R', arith: true },
  { id: 'tcEnc', name: 'Encode / negate', group: "Two's complement", desc: 'Write −x in bits' },
  { id: 'tcDec', name: 'Read signed value', group: "Two's complement", desc: 'Bits → signed decimal' },
  { id: 'tcCalc', name: 'Signed calculation', group: "Two's complement", desc: '+, −, × with negatives' },
];

export const PRESETS = {
  Balanced: { b2d: 2, d2b: 2, calc1: 3, calc2: 2, find: 2, tcEnc: 1, tcDec: 1, tcCalc: 1 },
  'Conversion drill': { b2d: 4, d2b: 4, calc1: 0, calc2: 0, find: 0, tcEnc: 1, tcDec: 1, tcCalc: 0 },
  Arithmetic: { b2d: 0, d2b: 0, calc1: 4, calc2: 3, find: 3, tcEnc: 0, tcDec: 0, tcCalc: 0 },
  "Two's complement": { b2d: 1, d2b: 0, calc1: 0, calc2: 0, find: 0, tcEnc: 3, tcDec: 3, tcCalc: 3 },
};

export const SYM = { add: '+', sub: '−', mul: '×', div: '÷' };
const VERB = {
  add: 'Add these two numbers.',
  sub: 'Subtract the second number from the first.',
  mul: 'Multiply these two numbers.',
  div: 'Divide the first number by the second. It divides exactly.',
};

export const ROUND_OPTIONS = [5, 10, 15, 20, 30];
export const DEFAULT_SETTINGS = {
  bits: 8,
  rounds: 10,
  format: 'mixed',
  ops: { add: true, sub: true, mul: true, div: true },
  weights: { ...PRESETS.Balanced },
  profile: 'p:Balanced',
};

// ---------- Multiplayer scoring ----------
export const TIME_LIMIT_MS = 180_000; // 3 minutes per question
export const ORDER_BONUS = [300, 150, 50]; // 1st, 2nd, 3rd correct answer
// Speed points fall from 1000 to 100 across the time limit, plus an order bonus.
export function roundPoints(ms, order) {
  const speed = 100 + Math.round(900 * Math.max(0, 1 - ms / TIME_LIMIT_MS));
  return speed + (ORDER_BONUS[order] || 0);
}

// ---------- Helpers ----------
const rnd = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const uid = () => Math.random().toString(36).slice(2, 10);
export const group = (s) => s.replace(/\B(?=(\d{4})+(?!\d))/g, ' '); // 0101 1100
export const fmtDec = (v) => (v < 0 ? '−' + -v : String(v));
const paren = (v) => (v < 0 ? '(' + fmtDec(v) + ')' : fmtDec(v));
export const sup = (k) => String(k).split('').map((d) => '⁰¹²³⁴⁵⁶⁷⁸⁹'[d]).join('');
const art = (n) => (n === 8 || n === 11 ? 'an' : 'a');
export const enabledOps = (ops) => Object.keys(SYM).filter((k) => ops && ops[k]);

export function num(bits) {
  const MOD = 2 ** bits;
  const MAX = MOD - 1;
  const LO = -(MOD / 2);
  const HI = MOD / 2 - 1;
  const pat = (v) => ((v % MOD) + MOD) % MOD; // value -> n-bit pattern
  const signedOf = (p) => (p >= MOD / 2 ? p - MOD : p);
  const binStr = (v) => pat(v).toString(2).padStart(bits, '0');
  const grp = (v) => group(binStr(v));
  return { bits, MOD, MAX, LO, HI, pat, signedOf, binStr, grp };
}

// ---------- Settings ----------
export function sanitizeSettings(s) {
  s = s && typeof s === 'object' ? s : {};
  const out = { ...DEFAULT_SETTINGS };
  out.bits = Math.min(16, Math.max(4, Math.round(+s.bits) || 8));
  out.rounds = ROUND_OPTIONS.includes(+s.rounds) ? +s.rounds : 10;
  out.format = ['bin', 'dec', 'mixed'].includes(s.format) ? s.format : 'mixed';
  out.ops = {};
  for (const k in SYM) out.ops[k] = s.ops ? !!s.ops[k] : true;
  out.weights = {};
  for (const t of TYPES) {
    const w = s.weights ? Math.round(+s.weights[t.id]) : NaN;
    out.weights[t.id] = Number.isFinite(w) ? Math.min(5, Math.max(0, w)) : DEFAULT_SETTINGS.weights[t.id];
  }
  out.profile = typeof s.profile === 'string' ? s.profile.slice(0, 60) : 'custom';
  return out;
}

export function settingsError(s) {
  const pool = TYPES.filter((t) => s.weights[t.id] > 0);
  if (!pool.length) return 'Turn at least one round type above 0.';
  if (pool.some((t) => t.arith) && !enabledOps(s.ops).length)
    return 'Turn on at least one operation, or set the arithmetic rounds to 0.';
  return '';
}

export function pickType(weights) {
  const pool = TYPES.filter((t) => weights[t.id] > 0);
  let r = Math.random() * pool.reduce((s, t) => s + weights[t.id], 0);
  for (const t of pool) {
    r -= weights[t.id];
    if (r < 0) return t.id;
  }
  return pool[pool.length - 1].id;
}

// ---------- Questions ----------
const B = (v, op = '', signed = false, showDec = true) => ({ kind: 'bits', v, op, signed, showDec });
const Q = (op = '') => ({ kind: 'q', op });
const RULE = { kind: 'rule' };

// Returns a plain JSON question. `answer` and `explain` are stripped before
// the host sends a question to other players (see publicQuestion).
export function makeQuestion(type, s) {
  const n = s.bits;
  const { MAX, LO, HI, grp } = num(n);
  const ops = enabledOps(s.ops);
  const answerBase = () => (s.format === 'mixed' ? pick(['bin', 'dec']) : s.format);
  const smallCap = Math.max(2, Math.floor(Math.sqrt(MAX)) + 1);

  function startPair(op) {
    if (op === 'add') { const a = rnd(1, MAX - 1); return [a, rnd(1, MAX - a)]; }
    if (op === 'sub') { const a = rnd(2, MAX); return [a, rnd(1, a - 1)]; }
    const b = rnd(2, smallCap);
    const q = rnd(1, Math.floor(MAX / b));
    return op === 'mul' ? [q, b] : [b * q, b];
  }
  function nextOperand(op, x) {
    if (op === 'add') return x < MAX ? rnd(1, MAX - x) : 0;
    if (op === 'sub') return x > 0 ? rnd(1, x) : 0;
    if (op === 'mul') return x > 0 ? rnd(1, Math.max(1, Math.min(smallCap, Math.floor(MAX / x)))) : rnd(2, smallCap);
    const divs = [];
    for (let d = 2; d <= x; d++) if (x % d === 0) divs.push(d);
    return divs.length ? pick(divs) : 1;
  }
  function signedPair(op) {
    for (let i = 0; i < 80; i++) {
      let a = rnd(LO, HI), b;
      if (op === 'add') b = rnd(Math.max(LO, LO - a), Math.min(HI, HI - a));
      else if (op === 'sub') b = rnd(Math.max(LO, a - HI), Math.min(HI, a - LO));
      else {
        b = rnd(2, Math.max(2, Math.floor(Math.sqrt(HI)))) * (Math.random() < 0.5 ? -1 : 1);
        const x = LO / b, y = HI / b;
        a = rnd(Math.ceil(Math.min(x, y)), Math.floor(Math.max(x, y)));
      }
      const r = apply(op, a, b);
      if (r >= LO && r <= HI && a !== 0 && (a < 0 || b < 0 || r < 0)) return [a, b, r];
    }
    return [-1, 1, apply(op, -1, 1)];
  }
  const eqLine = (a, op, b, r) =>
    `${grp(a)} ${SYM[op]} ${grp(b)} = ${grp(r)}   (${fmtDec(a)} ${SYM[op]} ${paren(b)} = ${fmtDec(r)})`;
  const breakdown = (v, signed) => {
    const p = num(n).pat(v), terms = [];
    for (let k = n - 1; k >= 0; k--) {
      if ((p >> k) & 1) terms.push(signed && k === n - 1 ? fmtDec(-(2 ** k)) : String(2 ** k));
    }
    return [`${grp(v)} → ${terms.length ? terms.join(' + ') : '0'} = ${fmtDec(v)}`];
  };
  const base = { id: uid(), type, sub: '' };

  switch (type) {
    case 'b2d': {
      const v = rnd(1, MAX);
      return { ...base, prompt: 'Convert this unsigned binary number to decimal.', rows: [B(v, '', false, false)],
        answer: v, base: 'dec', signed: false, explain: breakdown(v, false) };
    }
    case 'd2b': {
      const v = rnd(1, MAX);
      return { ...base, prompt: `Write ${v} as ${art(n)} ${n}\u2011bit binary number.`, rows: [{ kind: 'dec', v }, Q('=')],
        answer: v, base: 'bin', signed: false, explain: breakdown(v, false) };
    }
    case 'calc1': {
      const op = pick(ops), [a, b] = startPair(op), r = apply(op, a, b);
      return { ...base, prompt: VERB[op], rows: [B(a), B(b, SYM[op]), RULE, Q('=')],
        answer: r, base: answerBase(), signed: false, explain: [eqLine(a, op, b, r)] };
    }
    case 'calc2': {
      let best;
      for (let i = 0; i < 30; i++) {
        const o1 = pick(ops), o2 = pick(ops), [a, b] = startPair(o1), r1 = apply(o1, a, b), c = nextOperand(o2, r1);
        best = { o1, o2, a, b, c, r1, r: apply(o2, r1, c) };
        if (c > 1 && r1 > 0 && best.r > 0) break;
      }
      const { o1, o2, a, b, c, r1, r } = best;
      return { ...base, prompt: 'Two steps. Work top to bottom.', sub: `(A ${SYM[o1]} B) ${SYM[o2]} C`,
        rows: [B(a), B(b, SYM[o1]), B(c, SYM[o2]), RULE, Q('=')], answer: r, base: answerBase(), signed: false,
        explain: [`Step 1: ${eqLine(a, o1, b, r1)}`, `Step 2: ${eqLine(r1, o2, c, r)}`] };
    }
    case 'find': {
      const op = pick(ops), [a, b] = startPair(op), r = apply(op, a, b), missFirst = Math.random() < 0.5;
      return { ...base, prompt: 'Find the missing number that makes this true.',
        rows: [missFirst ? Q() : B(a), missFirst ? B(b, SYM[op]) : Q(SYM[op]), RULE, B(r, '=')],
        answer: missFirst ? a : b, base: answerBase(), signed: false, explain: [eqLine(a, op, b, r)] };
    }
    case 'tcEnc': {
      const flip = (x) => [`${x} = ${grp(x)}`, `flip every bit → ${grp(~x)}`, `add 1 → ${grp(-x)}`];
      if (Math.random() < 0.5) {
        const v = rnd(LO, -1);
        return { ...base, prompt: `Write ${fmtDec(v)} as ${art(n)} ${n}\u2011bit two's complement number.`,
          rows: [{ kind: 'dec', v }, Q('=')], answer: v, base: 'bin', signed: true, explain: flip(-v) };
      }
      const x = rnd(1, HI);
      return { ...base, prompt: "Negate this number. Write the two's complement bits for its negative.",
        rows: [B(x, '', true), Q('−x')], answer: -x, base: 'bin', signed: true, explain: flip(x) };
    }
    case 'tcDec': {
      const v = Math.random() < 0.75 ? rnd(LO, -1) : rnd(0, HI);
      return { ...base, prompt: "What signed decimal value do these two's complement bits represent?",
        rows: [B(v, '', true, false)], answer: v, base: 'dec', signed: true, explain: breakdown(v, true) };
    }
    case 'tcCalc':
    default: {
      let sops = ops.filter((o) => o !== 'div');
      if (!sops.length) sops = ['add', 'sub'];
      const op = pick(sops), [a, b, r] = signedPair(op);
      const explain = [eqLine(a, op, b, r)];
      if (op !== 'mul') explain.push(`Same adder as unsigned: any carry out of bit ${n - 1} is dropped.`);
      return { ...base, type: 'tcCalc', prompt: `${VERB[op]} Both are signed two's complement.`,
        rows: [B(a, '', true), B(b, SYM[op], true), RULE, Q('=')], answer: r, base: answerBase(), signed: true, explain };
    }
  }
}

function apply(op, a, b) {
  return op === 'add' ? a + b : op === 'sub' ? a - b : op === 'mul' ? a * b : a / b;
}

export function publicQuestion(q) {
  const { answer, explain, ...rest } = q; // eslint-disable-line no-unused-vars
  return rest;
}

// ---------- Answers ----------
// Returns { err } for badly formed input, otherwise { value }.
// Binary answers give the bit pattern; decimal answers give the number.
export function parseAnswer(q, raw, bits) {
  raw = String(raw ?? '');
  if (q.base === 'bin') {
    const s = raw.replace(/[\s_]/g, '').replace(/^0b/i, '');
    if (!/^[01]+$/.test(s)) return { err: 'Use only 0s and 1s.' };
    if (s.length > bits) return { err: `That's ${s.length} bits. This round uses ${bits} bits.` };
    if (q.signed && s.length < bits) return { err: `Enter all ${bits} bits. In two's complement the leftmost bit is the sign.` };
    return { value: parseInt(s, 2) };
  }
  const s = raw.trim().replace(/[−–]/g, '-');
  if (!/^-?\d+$/.test(s)) return { err: `Enter a whole decimal number, like 42${q.signed ? ' or −42' : ''}.` };
  return { value: parseInt(s, 10) };
}

export function isCorrect(q, value, bits) {
  return q.base === 'bin' ? value === num(bits).pat(q.answer) : value === q.answer;
}

// Easy mode: show what the typed answer is in the other base.
export function previewText(q, raw, bits) {
  const N = num(bits);
  if (!raw || !raw.trim()) return '';
  if (q.base === 'bin') {
    const s = raw.replace(/[\s_]/g, '').replace(/^0b/i, '');
    if (!/^[01]+$/.test(s) || s.length > bits) return '';
    const p = parseInt(s, 2);
    const v = q.signed && s.length === bits ? N.signedOf(p) : p;
    return `${N.grp(p)} = ${fmtDec(v)}${q.signed && s.length < bits ? `  (type all ${bits} bits)` : ''}`;
  }
  const s = raw.trim().replace(/[−–]/g, '-');
  if (!/^-?\d+$/.test(s)) return '';
  const v = parseInt(s, 10), lo = q.signed ? N.LO : 0, hi = q.signed ? N.HI : N.MAX;
  return v < lo || v > hi ? `${fmtDec(v)} doesn't fit in ${bits} bits (${fmtDec(lo)} to ${hi})` : `${fmtDec(v)} = ${N.grp(v)}`;
}
