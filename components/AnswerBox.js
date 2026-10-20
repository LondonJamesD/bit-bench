'use client';
import { useEffect, useRef, useState } from 'react';
import { group, parseAnswer, previewText } from '../lib/binary';

// Answer input. Checks the format locally; onSubmit(raw, value) gets valid input only.
// Remount it (with a key) for each new question.
export default function AnswerBox({ q, bits, easy, onSubmit, submitLabel = 'Check', children }) {
  const [raw, setRaw] = useState('');
  const [err, setErr] = useState('');
  const ref = useRef(null);

  useEffect(() => {
    ref.current?.focus({ preventScroll: true });
  }, []);

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
