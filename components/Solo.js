'use client';
import { useEffect, useRef, useState } from 'react';
import { TYPES, makeQuestion, pickType, isCorrect, settingsError, revealShown, choiceLabel } from '../lib/binary';
import { sfx } from '../lib/audio';
import { burstAt, confetti, cssVar } from '../lib/fx';
import SettingsPanel from './SettingsPanel';
import ModeToggle, { MODE_NAME } from './ModeToggle';
import Menu from './Menu';
import QuestionRows from './QuestionRows';
import AnswerBox, { ChoiceList } from './AnswerBox';
import Explain from './Explain';
import SoundToggles from './SoundToggles';

const typeName = (id) => TYPES.find((t) => t.id === id)?.name;

export default function Solo({ settings, setSettings, mode, setMode }) {
  const [game, setGame] = useState(null); // null = setup screen
  const [err, setErr] = useState('');
  const nextRef = useRef(null);
  const verdictRef = useRef(null);
  const easy = mode === 'easy';
  const colors = () => [cssVar('--accent'), cssVar('--good'), cssVar('--p1')];

  const withQuestion = (g) => ({ ...g, q: makeQuestion(pickType(g.cfg.weights), g.cfg), answered: false, ok: false, raw: null });

  function start() {
    const e = settingsError(settings);
    setErr(e);
    if (e) return;
    setGame(withQuestion({ cfg: settings, i: 0, total: settings.rounds, results: [], done: false, streak: 0, best: 0 }));
    window.scrollTo(0, 0);
  }
  function finishRound(ok, raw) {
    setGame((g) => {
      const streak = ok ? g.streak + 1 : 0;
      return { ...g, answered: true, ok, raw, streak, best: Math.max(g.best, streak), results: [...g.results, { type: g.q.type, ok }] };
    });
  }
  function next() {
    setGame((g) => (g.i + 1 >= g.total ? { ...g, done: true } : withQuestion({ ...g, i: g.i + 1 })));
  }

  useEffect(() => {
    if (!game?.answered) return;
    nextRef.current?.focus({ preventScroll: true });
    if (game.ok) {
      sfx.correct(game.streak);
      burstAt(verdictRef.current, { colors: colors(), count: 30 + 6 * Math.min(game.streak, 5) });
    } else if (game.raw !== null) sfx.wrong();
  }, [game?.answered]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!game?.done) return;
    const ok = game.results.filter((r) => r.ok).length;
    if (ok / game.total >= 0.7) {
      sfx.first();
      confetti({ colors: colors(), duration: 3000 });
    }
  }, [game?.done]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- Setup ----
  if (!game) {
    return (
      <section className="card setup">
        <h2>Practice</h2>
        <SettingsPanel settings={settings} onChange={setSettings} idPrefix="solo">
          <Menu label="Difficulty" value={MODE_NAME[mode]}>
            <ModeToggle mode={mode} setMode={setMode} idPrefix="solo-mode" />
          </Menu>
        </SettingsPanel>
        <div className="row">
          <button type="button" className="primary big-btn" onClick={start}>Start practice</button>
          {err && <p className="err">{err}</p>}
        </div>
      </section>
    );
  }

  // ---- Summary ----
  if (game.done) {
    const ok = game.results.filter((r) => r.ok).length;
    return (
      <section className="card">
        <h2>Practice complete</h2>
        <div className="score">
          <span className="big">{ok} / {game.total}</span>
          <span className="binscore">{ok.toString(2)} / {game.total.toString(2)} · {Math.round((ok / game.total) * 100)}%</span>
        </div>
        {game.best >= 2 && <p className="lead">Best streak: 🔥 {game.best} in a row</p>}
        <div className="tablewrap">
          <table>
            <thead><tr><th>Round type</th><th className="num">Correct</th><th className="num">Played</th></tr></thead>
            <tbody>
              {TYPES.map((t) => {
                const rs = game.results.filter((r) => r.type === t.id);
                return rs.length ? (
                  <tr key={t.id}><td>{t.name}</td><td className="num">{rs.filter((r) => r.ok).length}</td><td className="num">{rs.length}</td></tr>
                ) : null;
              })}
            </tbody>
          </table>
        </div>
        <div className="row">
          <button type="button" className="primary" onClick={start}>Play again</button>
          <button type="button" onClick={() => setGame(null)}>Change settings</button>
        </div>
      </section>
    );
  }

  // ---- Play ----
  const { q, cfg } = game;
  const okCount = game.results.filter((r) => r.ok).length;
  return (
    <section>
      <div className="bar">
        <div className="meta">
          <span className="round-lbl">Round {game.i + 1} of {game.total}</span>
          <span className="chip">{typeName(q.type)}</span>
          <span className="muted mono">{okCount} correct</span>
          {game.streak >= 2 && <span className="chip streak">🔥 {game.streak} in a row</span>}
        </div>
        <div className="meta">
          <SoundToggles music={false} />
          <button type="button" className="ghost" onClick={() => setMode(easy ? 'hard' : 'easy')}>{easy ? 'Easy mode' : 'Hard mode'}</button>
          <button type="button" className="ghost" onClick={() => setGame(null)}>Quit</button>
        </div>
      </div>
      <div className="pips">
        {Array.from({ length: game.total }, (_, i) => {
          const r = game.results[i];
          return (
            <span key={i} className={`pip ${r ? (r.ok ? 'ok' : 'miss') : ''}${i === game.i ? ' cur' : ''}`}>
              {r ? (r.ok ? 1 : 0) : '·'}
            </span>
          );
        })}
      </div>
      <div className="card">
        <h2>{q.prompt}</h2>
        {q.sub && <p className="sub">{q.sub}</p>}
        <QuestionRows q={q} bits={cfg.bits} easy={easy}
          answer={game.answered ? revealShown(q) : undefined} verdict={game.ok ? 'ok' : 'bad'} />
        {!game.answered ? (
          <AnswerBox key={q.id} q={q} bits={cfg.bits} easy={easy}
            onSubmit={(raw, value) => finishRound(isCorrect(q, value, cfg.bits), raw)}>
            <button type="button" className="ghost" onClick={() => finishRound(false, null)}>Show answer</button>
          </AnswerBox>
        ) : (
          <div className="feedback">
            <div ref={verdictRef} className={`verdict ${game.ok ? 'ok' : 'bad'}`}>
              {game.ok ? 'Correct' : game.raw === null ? 'Answer shown' : 'Not quite'}
              {game.ok && game.streak >= 2 && <span className="mult"> 🔥 {game.streak}</span>}
            </div>
            {q.choices && <ChoiceList q={q} picked={game.raw} answer={q.answer} />}
            {!game.ok && game.raw !== null && !q.choices && <p>You entered <code>{game.raw}</code></p>}
            <Explain answer={q.answer} lines={q.explain} bits={cfg.bits} label={q.choices ? choiceLabel(q, q.answer) : undefined} />
            <button type="button" className="primary" ref={nextRef} onClick={next}>
              {game.i + 1 >= game.total ? 'See results' : 'Next round'}
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
