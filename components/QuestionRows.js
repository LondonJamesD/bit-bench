import { Fragment } from 'react';
import { num, fmtDec, sup } from '../lib/binary';

// One register: a row of bit cells, grouped in nibbles. p === null shows "?" cells.
function Reg({ bits, p, cls = '' }) {
  const cells = [];
  for (let i = 0; i < bits; i++) {
    const k = bits - 1 - i;
    const g = i > 0 && k % 4 === 3 ? ' g' : '';
    if (p === null) cells.push(<span key={i} className={'bit q' + g}>?</span>);
    else {
      const on = (p >> k) & 1;
      cells.push(<span key={i} className={'bit' + (on ? ' on' : '') + g}>{on}</span>);
    }
  }
  return <div className={'reg ' + cls}>{cells}</div>;
}

// Place-value labels shown above the registers in Easy mode.
function Weights({ bits, signed }) {
  const cells = [];
  for (let i = 0; i < bits; i++) {
    const k = bits - 1 - i;
    const g = i > 0 && k % 4 === 3 ? ' g' : '';
    const neg = signed && k === bits - 1;
    const label = bits <= 8 ? (neg ? '−' : '') + 2 ** k : (neg ? '−' : '') + '2' + sup(k);
    cells.push(<span key={i} className={'w' + g + (neg ? ' neg' : '')}>{label}</span>);
  }
  return <div className="reg">{cells}</div>;
}

// answer: shown in the "?" row once revealed. verdict: 'ok' | 'bad' | undefined.
export default function QuestionRows({ q, bits, easy, answer, verdict }) {
  if (!q.rows.length) return null;
  const N = num(bits);
  const revealed = answer !== undefined && answer !== null;
  const out = [];
  let key = 0;
  const row = (op, middle, right) => {
    out.push(<span key={key++} className="op">{op}</span>);
    out.push(<Fragment key={key++}>{middle}</Fragment>);
    out.push(<span key={key++} className="dec">{right}</span>);
  };

  if (easy && q.rows.some((r) => r.kind === 'bits' || r.kind === 'q')) row('', <Weights bits={bits} signed={q.signed} />, '');
  for (const r of q.rows) {
    if (r.kind === 'rule') row('', <div className="rule" />, '');
    else if (r.kind === 'dec') row(r.op || '', <div className="decbig">{fmtDec(r.v)}</div>, '');
    else if (r.kind === 'q') {
      if (revealed) row(r.op, <Reg bits={bits} p={N.pat(answer)} cls={'rev ' + (verdict || '')} />, '= ' + fmtDec(answer));
      else row(r.op, <Reg bits={bits} p={null} />, easy ? '= ?' : '');
    } else row(r.op, <Reg bits={bits} p={N.pat(r.v)} />, easy && r.showDec ? '= ' + fmtDec(r.v) : '');
  }

  const cwb = bits <= 8 ? '2.1rem' : bits <= 12 ? '1.7rem' : '1.35rem';
  return <div className="sum" style={{ '--cwb': cwb }}>{out}</div>;
}
