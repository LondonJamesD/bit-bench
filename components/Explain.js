import { fmtDec, num } from '../lib/binary';

// Correct answer in both bases plus the worked lines.
export default function Explain({ answer, lines, bits }) {
  return (
    <>
      <p>
        Answer: <code>{num(bits).grp(answer)}</code> = <b>{fmtDec(answer)}</b>
      </p>
      <div className="work">
        {(lines || []).map((l, i) => (
          <div key={i}>{l}</div>
        ))}
      </div>
    </>
  );
}
