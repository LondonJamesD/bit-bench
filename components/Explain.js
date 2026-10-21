import { fmtDec, num } from '../lib/binary';

// Correct answer in both bases plus the worked lines. label replaces the
// number for multiple-choice rounds.
export default function Explain({ answer, lines, bits, label }) {
  return (
    <>
      <p>
        {label != null ? <>Answer: <b>{label}</b></> : <>Answer: <code>{num(bits).grp(answer)}</code> = <b>{fmtDec(answer)}</b></>}
      </p>
      <div className="work">
        {(lines || []).map((l, i) => (
          <div key={i}>{l}</div>
        ))}
      </div>
    </>
  );
}
