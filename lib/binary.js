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
  { id: 'ovf', name: 'Overflow or underflow?', group: 'Trivia', desc: 'Does the result fit?' },
  { id: 'mc', name: 'Multiple choice', group: 'Trivia', desc: 'Pick one of four answers' },
];

export const PRESETS = {
  Balanced: { b2d: 2, d2b: 2, calc1: 3, calc2: 2, find: 2, tcEnc: 1, tcDec: 1, tcCalc: 1, ovf: 2, mc: 2 },
  'Conversion drill': { b2d: 4, d2b: 4, calc1: 0, calc2: 0, find: 0, tcEnc: 1, tcDec: 1, tcCalc: 0, ovf: 0, mc: 2 },
  Arithmetic: { b2d: 0, d2b: 0, calc1: 4, calc2: 3, find: 3, tcEnc: 0, tcDec: 0, tcCalc: 0, ovf: 1, mc: 0 },
  "Two's complement": { b2d: 1, d2b: 0, calc1: 0, calc2: 0, find: 0, tcEnc: 3, tcDec: 3, tcCalc: 3, ovf: 2, mc: 1 },
  'Trivia blitz': { b2d: 0, d2b: 0, calc1: 0, calc2: 0, find: 0, tcEnc: 0, tcDec: 0, tcCalc: 0, ovf: 5, mc: 5 },
};

export const SYM = { add: '+', sub: '−', mul: '×', div: '÷' };
const VERB = {
  add: 'Add these two numbers.',
  sub: 'Subtract the second number from the first.',
  mul: 'Multiply these two numbers.',
  div: 'Divide the first number by the second. It divides exactly.',
};
const OP_NAME = { add: 'addition', sub: 'subtraction', mul: 'multiplication' };
const OVF_CHOICES = [{ id: 'over', label: 'Overflow' }, { id: 'under', label: 'Underflow' }, { id: 'none', label: 'Neither, it fits' }];

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
export const QUICK_TIME_MS = 30_000; // trivia rounds are pick-one, so they get a short clock
export const timeLimit = (q) => (q?.choices ? QUICK_TIME_MS : TIME_LIMIT_MS);
export const ORDER_BONUS = [300, 150, 50]; // 1st, 2nd, 3rd correct answer
// Speed points fall from 1000 to 100 across the time limit, plus an order bonus.
export function roundPoints(ms, order, limit = TIME_LIMIT_MS) {
  const speed = 100 + Math.round(900 * Math.max(0, 1 - ms / limit));
  return speed + (ORDER_BONUS[order] || 0);
}
// streak counts this answer: 1 in a row is ×1, then +0.25 each, capped at ×2.
export const streakMult = (streak) => Math.min(2, 1 + 0.25 * Math.max(0, streak - 1));
export const fmtMult = (m) => '×' + String(m);

// ---------- Helpers ----------
const rnd = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const uid = () => Math.random().toString(36).slice(2, 10);
const shuffle = (arr) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};
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
  out.profile = typeof s.profile === 'string' ? s.profile.slice(0, 60) : s.weights ? 'custom' : DEFAULT_SETTINGS.profile;
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
  const N = num(n);
  const { MOD, MAX, LO, HI, grp } = N;
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
    case 'ovf': {
      let tops = ops.filter((o) => o !== 'div');
      if (!tops.length) tops = ['add', 'sub'];
      const target = pick(['over', 'under', 'none']);
      let c = null;
      for (let i = 0; i < 400 && !c; i++) {
        // Unsigned values only drop below 0 by subtracting.
        const signed = target === 'under' && !tops.includes('sub') ? true : Math.random() < 0.5;
        const op = pick(!signed && target === 'under' ? ['sub'] : tops);
        const lo = signed ? LO : 0, hi = signed ? HI : MAX;
        const a = rnd(lo, hi);
        const b = op === 'mul' ? rnd(2, smallCap) * (signed && Math.random() < 0.5 ? -1 : 1) : rnd(signed ? lo : 1, hi);
        const r = apply(op, a, b);
        if (a !== 0 && b !== 0 && fitOf(r, lo, hi) === target) c = { signed, op, a, b, r, lo, hi };
      }
      c ||= { signed: false, op: 'add', a: MAX, b: 1, r: MAX + 1, lo: 0, hi: MAX };
      const { signed, op, a, b, r, lo, hi } = c;
      const answer = fitOf(r, lo, hi);
      const shown = signed ? N.signedOf(N.pat(r)) : N.pat(r);
      const range = `${signed ? 'Signed' : 'Unsigned'} ${n}-bit range: ${fmtDec(lo)} to ${hi}`;
      const explain = [`${fmtDec(a)} ${SYM[op]} ${paren(b)} = ${fmtDec(r)}`, range];
      if (answer === 'none') explain.push(`${fmtDec(r)} fits, so neither.`);
      else {
        explain.push(answer === 'over'
          ? `${fmtDec(r)} is above ${hi}, so it overflows. The register wraps to ${grp(r)} = ${fmtDec(shown)}.`
          : `${fmtDec(r)} is below ${fmtDec(lo)}, so it underflows. The register wraps to ${grp(r)} = ${fmtDec(shown)}.`);
        if (!signed && op === 'add') explain.push(`Giveaway: a carry out of bit ${n - 1}.`);
        else if (!signed && op === 'sub') explain.push(`Giveaway: you'd need to borrow past bit ${n - 1}.`);
        else if (signed && op !== 'mul') explain.push('Giveaway: the wrapped result has the wrong sign.');
        if (signed && answer === 'under') explain.push('Some textbooks call this negative overflow.');
      }
      return { ...base, prompt: `Does this ${signed ? "signed (two's complement)" : 'unsigned'} ${n}\u2011bit ${OP_NAME[op]} overflow, underflow, or fit?`,
        rows: [B(a, '', signed), B(b, SYM[op], signed), RULE, Q('=')], base: 'choice', signed, range,
        choices: OVF_CHOICES, answer, shown, explain };
    }
    case 'mc': {
      const decs = (right, wrong) => choicesFrom(right, wrong, fmtDec, () => right + rnd(-9, 9));
      const pats = (right, wrong) => choicesFrom(right, wrong, grp, () => rnd(0, MAX));
      const rev = (v) => parseInt(N.binStr(v).split('').reverse().join(''), 2);
      const flip = (v) => v ^ (1 << rnd(0, n - 1));
      const kind = pick(['b2d', 'd2b', 'tcDec', 'fact', 'fact']);
      if (kind === 'b2d') {
        const v = rnd(3, MAX - 1);
        return { ...base, prompt: 'Which decimal value is this unsigned binary number?', rows: [B(v, '', false, false)],
          signed: false, ...decs(v, [flip(v), flip(v), rev(v), v + 1, v - 1]), explain: breakdown(v, false) };
      }
      if (kind === 'd2b') {
        const v = rnd(3, MAX - 1);
        return { ...base, prompt: `Which is ${v} in ${n}\u2011bit binary?`, rows: [{ kind: 'dec', v }],
          signed: false, ...pats(v, [flip(v), flip(v), rev(v), v + 1, v - 1]), explain: breakdown(v, false) };
      }
      if (kind === 'tcDec') {
        const v = rnd(LO, -2), p = N.pat(v);
        // Wrong answers are the classic misreadings: unsigned, sign-magnitude, ones' complement.
        return { ...base, prompt: "What signed value do these two's complement bits represent?", rows: [B(v, '', true, false)],
          signed: true, ...decs(v, [p, -(p - MOD / 2), v + 1, -v, v - 1]), explain: breakdown(v, true) };
      }
      const f = pick([
        () => ({ prompt: `What is the largest value ${art(n)} ${n}\u2011bit unsigned register can hold?`, right: MAX,
          wrong: [MOD, HI, MAX - 1, n * n], explain: [`All ${n} bits on: ${grp(MAX)} = 2${sup(n)} − 1 = ${MAX}`] }),
        () => ({ prompt: `What is the largest value in ${n}\u2011bit two's complement?`, right: HI,
          wrong: [MAX, HI + 1, HI - 1, MOD / 4], explain: [`0 then all 1s: ${grp(HI)} = 2${sup(n - 1)} − 1 = ${HI}`] }),
        () => ({ prompt: `What is the most negative value in ${n}\u2011bit two's complement?`, right: LO,
          wrong: [-HI, LO - 1, -MAX, -MOD], explain: [`1 then all 0s: ${grp(LO)} = −2${sup(n - 1)} = ${fmtDec(LO)}`,
            'There is one more negative value than positive, because 0 takes a slot on the positive side.'] }),
        () => ({ prompt: `How many different values can ${n} bits represent?`, right: MOD,
          wrong: [MAX, 2 * n, n * n, MOD * 2], explain: [`Each bit doubles the count: 2${sup(n)} = ${MOD}`] }),
        () => ({ prompt: `In ${n}\u2011bit two's complement, what is ${HI} + 1?`, right: LO,
          wrong: [HI + 1, 0, -1, -HI], explain: [`${grp(HI)} + 1 = ${grp(LO)}`,
            `The carry lands in the sign bit, so it reads as ${fmtDec(LO)}. That's signed overflow.`] }),
        () => ({ prompt: `How is −1 written in ${n}\u2011bit two's complement?`, bits: true, right: -1,
          wrong: [MOD / 2 + 1, MAX - 1, MOD / 2, 1], explain: [`1 = ${grp(1)}`, `flip every bit → ${grp(~1)}`, `add 1 → ${grp(-1)}`] }),
      ])();
      return { ...base, prompt: f.prompt, rows: [], signed: false,
        ...(f.bits ? pats(f.right, f.wrong) : decs(f.right, f.wrong)), explain: f.explain };
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
const fitOf = (r, lo, hi) => (r > hi ? 'over' : r < lo ? 'under' : 'none');

// Four shuffled options: the right value plus distinct wrong ones. fill() tops
// up the list when the hand-picked wrong answers collide.
function choicesFrom(right, wrong, label, fill) {
  const labels = [label(right)];
  const add = (v) => { const l = label(v); if (labels.length < 4 && !labels.includes(l)) labels.push(l); };
  shuffle(wrong).forEach(add);
  for (let i = 0; labels.length < 4 && i < 100; i++) add(fill());
  const choices = shuffle(labels).map((l, i) => ({ id: 'abcd'[i], label: l, mono: true }));
  return { base: 'choice', choices, answer: choices.find((c) => c.label === labels[0]).id };
}

export function publicQuestion(q) {
  const { answer, explain, shown, ...rest } = q; // eslint-disable-line no-unused-vars
  return rest;
}

// The number drawn in the "?" row once a round is revealed. For overflow rounds
// it's what the register actually ends up holding.
export const revealShown = (q) => (q.choices ? q.shown ?? null : q.answer);
export const choiceLabel = (q, id) => q.choices?.find((c) => c.id === id)?.label ?? id;

// ---------- Answers ----------
// Returns { err } for badly formed input, otherwise { value }.
// Binary answers give the bit pattern; decimal answers give the number.
export function parseAnswer(q, raw, bits) {
  raw = String(raw ?? '');
  if (q.choices) return q.choices.some((c) => c.id === raw) ? { value: raw } : { err: 'Pick one of the options.' };
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
  if (q.choices) return value === q.answer;
  return q.base === 'bin' ? value === num(bits).pat(q.answer) : value === q.answer;
}

// Easy mode: show what the typed answer is in the other base.
export function previewText(q, raw, bits) {
  const N = num(bits);
  if (!raw || !raw.trim() || q.choices) return '';
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
