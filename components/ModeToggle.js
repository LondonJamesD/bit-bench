// Easy / Hard is a per-player display choice: Easy shows decimals, place values
// and live conversion of what you type. Hard shows binary only.
export const MODE_HINT = {
  easy: 'Numbers show their decimal value, place values are labelled, and what you type is converted as you go.',
  hard: 'Binary only. No place values and no conversions. You work it all out.',
};

export default function ModeToggle({ mode, setMode, idPrefix = 'mode' }) {
  return (
    <div className="field">
      <span className="lbl">Difficulty</span>
      <div className="seg">
        {['easy', 'hard'].map((m) => (
          <span key={m}>
            <input type="radio" name={idPrefix} id={`${idPrefix}-${m}`} checked={mode === m} onChange={() => setMode(m)} />
            <label htmlFor={`${idPrefix}-${m}`}>{m === 'easy' ? 'Easy' : 'Hard'}</label>
          </span>
        ))}
      </div>
      <p className="hint">{MODE_HINT[mode]}</p>
    </div>
  );
}
