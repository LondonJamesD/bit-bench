// Side view of every player: avatar, name, total, a bar against the leader,
// this round's "+points" under the name, and one pip per finished round.
const fmtPts = (n) => n.toLocaleString('en-US');

function status(p, phase, winnerId) {
  if (!p.connected) return <span className="muted">Left the game</span>;
  if (phase === 'lobby') return <span className="muted">{p.mode === 'hard' ? 'Hard mode' : 'Easy mode'}</span>;
  if (phase === 'question') {
    return (
      <span className={p.answered ? 'locked' : 'muted'}>
        {p.answered ? 'Locked in' : 'Thinking…'}
        {p.skip ? ' · voted skip' : ''}
      </span>
    );
  }
  if (phase === 'over') {
    return <span className="muted">{p.history.filter((g) => g > 0).length}/{p.history.length} correct</span>;
  }
  // reveal: show what this round was worth
  if (p.correct) {
    return (
      <span className="gain">
        +{fmtPts(p.gain)}
        <small> {(p.timeMs / 1000).toFixed(1)}s{p.id === winnerId ? ' · first' : ''}</small>
      </span>
    );
  }
  return <span className="gain zero">+0 <small>{p.answered ? 'wrong' : 'no answer'}</small></span>;
}

export default function Scoreboard({ players, myId, hostId, phase, winnerId, title = 'Players' }) {
  const sorted = [...players].sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  const top = Math.max(0, ...players.map((p) => p.score));
  const inGame = phase !== 'lobby';

  return (
    <section className="panel board">
      <h2>{title}</h2>
      <ol className="players">
        {sorted.map((p) => {
          const rank = 1 + players.filter((o) => o.score > p.score).length;
          const leading = inGame && top > 0 && p.score === top;
          return (
            <li key={p.id} className={`pl ${p.color}${p.connected ? '' : ' gone'}${p.id === winnerId && phase === 'reveal' ? ' won' : ''}`}>
              <span className="rank">{inGame ? rank : ''}</span>
              <span className="avatar" aria-hidden="true">{p.name.slice(0, 1).toUpperCase()}</span>
              <div className="pl-main">
                <div className="pl-name">
                  <span className="nm">{p.name}</span>
                  {p.id === myId && <span className="tag">you</span>}
                  {p.id === hostId && <span className="tag">host</span>}
                  {leading && <span className="tag lead">leading</span>}
                </div>
                <div className="pl-status">{status(p, phase, winnerId)}</div>
                {inGame && (
                  <>
                    <div className="pl-bar"><i style={{ width: top ? `${(p.score / top) * 100}%` : '0%' }} /></div>
                    {p.history.length > 0 && (
                      <div className="pl-hist">
                        {p.history.map((g, i) => (
                          <span key={i} className={g ? 'on' : ''} title={`Round ${i + 1}: +${g}`} />
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
              <span className="pl-score">{inGame ? fmtPts(p.score) : ''}</span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
