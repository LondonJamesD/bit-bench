'use client';
import { useEffect, useRef, useState } from 'react';
import { group, parseAnswer, previewText } from '../lib/binary';

// The options of a multiple-choice round, as a read-only list once you've picked:
// your pick is outlined, and after the reveal the right one turns green.
export function ChoiceList({ q, picked, answer }) {
  return (
    <div className={`choices done${answer ? ' revealed' : ''}`}>
      {q.choices.map((c, i) => {
        const cls = [c.mono && 'mono', c.id === picked && 'picked', answer && c.id === answer && 'right',
          answer && c.id === picked && c.id !== answer && 'wrong'].filter(Boolean).join(' ');
        return (
          <button key={c.id} type="button" className={`choice ${cls}`} disabled>
            <kbd>{i + 1}</kbd><span>{c.label}</span>
          </button>
        );
      })}
    </div>
  );
}

// Answer input. Checks the format locally; onSubmit(raw, value) gets valid input only.
// Multiple-choice rounds get one button per option (keys 1–4 work too).
// Remount it (with a key) for each new question.
export default function AnswerBox({ q, bits, easy, onSubmit, submitLabel = 'Check', children }) {
  const [raw, setRaw] = useState('');
  const [err, setErr] = useState('');
  const ref = useRef(null);
  const choices = q.choices;

  useEffect(() => {
    ref.current?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    if (!choices) return;
    const onKey = (e) => {
      if (e.target.closest?.('input, textarea, select') || e.metaKey || e.ctrlKey || e.altKey) return;
      const c = choices[+e.key - 1];
      if (c) onSubmit(c.id, c.id);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [choices, onSubmit]);

  if (choices) {
    return (
      <div className="ansForm">
        <span className="ansLbl">Pick one</span>
        <div className="choices">
          {choices.map((c, i) => (
            <button key={c.id} ref={i === 0 ? ref : undefined} type="button" className={`choice${c.mono ? ' mono' : ''}`}
              onClick={() => onSubmit(c.id, c.id)}>
              <kbd>{i + 1}</kbd><span>{c.label}</span>
            </button>
          ))}
        </div>
        {easy && q.range && <p className="preview">{q.range}</p>}
        {children && <div className="ansrow">{children}</div>}
      </div>
    );
  }

  const label =
    q.base === 'bin'
      ? `Answer in binary (${q.signed ? `all ${bits} bits, two's complement` : `up to ${bits} bits`})`
      : `Answer in decimal${q.signed ? ' (signed)' : ''}`;

  function submit(e) {
    e.preventDefault();
    if (!raw.trim()) return setErr('Type an answer first.');
    const res = parseAnswer(q, raw, bits);
    if (res.err) return setErr(res.err);
    onSubmit(raw.trim(), res.value);
  }

  const preview = easy ? previewText(q, raw, bits) : '';

  return (
    <form className="ansForm" onSubmit={submit} autoComplete="off">
      <label htmlFor="ans" className="ansLbl">{label}</label>
      <div className="ansrow">
        <input
          id="ans"
          ref={ref}
          value={raw}
          onChange={(e) => { setRaw(e.target.value); setErr(''); }}
          placeholder={q.base === 'bin' ? group('0'.repeat(bits)) : q.signed ? '−42' : '42'}
          inputMode={q.base === 'dec' && q.signed ? 'text' : 'numeric'}
          spellCheck={false}
          autoCapitalize="off"
        />
        <button type="submit" className="primary">{submitLabel}</button>
        {children}
      </div>
      {preview && <p className="preview">{preview}</p>}
      {err && <p className="err">{err}</p>}
    </form>
  );
}
