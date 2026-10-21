'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { HostGame, MAX_PLAYERS, MIN_PLAYERS } from '../lib/host';
import { hostRoom, joinRoom as joinRelayRoom } from '../lib/relay';
import {
  TYPES, TIME_LIMIT_MS, QUICK_TIME_MS, ORDER_BONUS, roundPoints, streakMult, fmtMult, choiceLabel, settingsError,
} from '../lib/binary';
import { load, save } from '../lib/storage';
import { sfx, playMusic, stopMusic } from '../lib/audio';
import { burstAt, confetti, fireworks, cssVar, playerColor } from '../lib/fx';
import SettingsPanel from './SettingsPanel';
import ModeToggle, { MODE_NAME } from './ModeToggle';
import Menu from './Menu';
import Scoreboard from './Scoreboard';
import Chat from './Chat';
import QuestionRows from './QuestionRows';
import AnswerBox, { ChoiceList } from './AnswerBox';
import Explain from './Explain';
import SoundToggles from './SoundToggles';

// Players connect through Ably (see lib/relay.js). The host's browser still runs the match.
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const makeCode = () => Array.from({ length: 5 }, () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]).join('');
const cleanCode = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5);
const typeName = (id) => TYPES.find((t) => t.id === id)?.name || '';
const fmtPts = (n) => n.toLocaleString('en-US');
const ordinal = (n) => ['1st', '2nd', '3rd', '4th'][n - 1] || `${n}th`;

function errorText(err) {
  switch (err?.type) {
    case 'not-configured': return "Multiplayer isn't set up on this site yet: the server is missing its ABLY_API_KEY.";
    case 'host-left': return 'The host closed the room or lost their connection.';
    case 'lost': return 'Lost the connection to the game server. Check your internet and join again.';
    default: return "Couldn't reach the game server. Check your internet and try again.";
  }
}

function useNow(active) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [active]);
  return now;
}

function Timer({ ms, limit }) {
  const s = Math.ceil(ms / 1000);
  return (
    <div className={`timer${s <= 30 ? ' low' : ''}`} aria-label={`${s} seconds left`}>
      <span className="mono">{Math.floor(s / 60)}:{String(s % 60).padStart(2, '0')}</span>
      <div className="timer-bar"><i style={{ width: `${Math.min(100, (ms / limit) * 100)}%` }} /></div>
    </div>
  );
}

// visible: false while the Solo tab is showing, which pauses the music and effects.
export default function Multiplayer({ settings, setSettings, mode, setMode, inviteCode, visible = true }) {
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [screen, setScreen] = useState('entry'); // entry | connecting | room
  const [error, setError] = useState('');
  const [room, setRoom] = useState(null);
  const [chat, setChat] = useState([]);
  const [myId, setMyId] = useState(null);
  const [clock, setClock] = useState({ deadline: 0, nextAt: 0 });
  const [pending, setPending] = useState({ q: null, raw: '' }); // my answer, before the host confirms it
  const [copied, setCopied] = useState('');
  const net = useRef(null); // { relay, host? (when hosting), leaving, ... }
  const now = useNow(!!room && (room.phase === 'question' || room.phase === 'reveal'));
  const verdictRef = useRef(null);
  const seen = useRef({ key: '', answered: 0 });

  useEffect(() => setName(load('bitbench.name', '')), []);
  useEffect(() => { if (inviteCode) setCode(cleanCode(inviteCode)); }, [inviteCode]);
  useEffect(() => () => teardown(), []); // eslint-disable-line react-hooks/exhaustive-deps

  const applyState = useCallback((s) => {
    const t = Date.now();
    setRoom(s);
    setClock({ deadline: s.round ? t + s.round.remaining : 0, nextAt: s.nextIn != null ? t + s.nextIn : 0 });
  }, []);
  const addChat = useCallback((m) => setChat((c) => [...c.slice(-99), m]), []);

  function teardown() {
    const n = net.current;
    net.current = null;
    if (!n) return;
    n.leaving = true;
    n.host?.destroy();
    n.relay?.close();
  }
  function reset(message = '') {
    teardown();
    setRoom(null);
    setChat([]);
    setScreen('entry');
    setError(message);
  }

  // Everything a player does goes through here. The host handles its own
  // messages directly; everyone else sends them through the relay.
  function send(msg) {
    const n = net.current;
    if (!n) return;
    if (n.host) n.host.handle(n.host.hostId, msg);
    else n.relay?.send(msg);
  }

  // The host's Easy/Hard choice applies to the whole room.
  useEffect(() => {
    if (screen === 'room' && net.current?.host) send({ type: 'mode', mode });
  }, [mode, screen]); // eslint-disable-line react-hooks/exhaustive-deps

  // Music follows the game: lobby tune, a round or trivia loop, then the ending theme.
  const phase = screen === 'room' ? room?.phase : null;
  const quick = !!room?.round?.q?.choices;
  useEffect(() => {
    if (!visible || !phase) return stopMusic();
    playMusic(phase === 'lobby' ? 'lobby' : phase === 'over' ? 'victory' : quick ? 'trivia' : 'round');
  }, [phase, quick, visible]);
  useEffect(() => stopMusic, []);

  // Sounds and particles for the big moments: game start, lock-ins, the reveal and the final standings.
  useEffect(() => {
    if (!room || screen !== 'room') return;
    const s = seen.current;
    const key = `${room.phase}:${room.round?.q?.id || ''}`;
    const answered = room.players.filter((p) => p.answered).length;
    if (key === s.key) {
      if (visible && room.phase === 'question' && answered > s.answered) sfx.lock();
      s.answered = answered;
      return;
    }
    Object.assign(s, { key, answered });
    const me = room.players.find((p) => p.id === myId);
    if (!me || !visible) return;
    const mine = [playerColor(me.color), cssVar('--accent'), cssVar('--good')];
    if (room.phase === 'question' && room.round?.index === 0) sfx.start();
    else if (room.phase === 'reveal') {
      if (me.correct) {
        const first = room.reveal?.winnerId === myId;
        if (first) sfx.first();
        else sfx.correct(me.streak);
        burstAt(verdictRef.current, { colors: mine, count: first ? 70 : 40, power: first ? 12 : 9 });
      } else if (me.answered) sfx.wrong();
    } else if (room.phase === 'over') {
      const top = Math.max(...room.players.map((p) => p.score));
      if (top <= 0) return;
      const winners = room.players.filter((p) => p.score === top);
      confetti({ colors: [...winners.map((p) => playerColor(p.color)), cssVar('--accent')], duration: me.score === top ? 5000 : 2500 });
      if (me.score === top) fireworks({ colors: mine });
    }
  }, [room, myId, screen, visible]);

  // Countdown ticks over the last five seconds.
  const secsLeft = phase === 'question' ? Math.ceil(Math.max(0, clock.deadline - now) / 1000) : 0;
  useEffect(() => {
    if (visible && secsLeft > 0 && secsLeft <= 5) sfx.tick();
  }, [secsLeft, visible]);

  function checkName() {
    const nm = name.trim().slice(0, 16);
    if (!nm) { setError('Enter your name first.'); return null; }
    save('bitbench.name', nm);
    setError('');
    return nm;
  }

  async function createRoom() {
    const nm = checkName();
    if (!nm) return;
    setScreen('connecting');
    const n = { relay: null, host: null, leaving: false };
    net.current = n;
    try {
      const relay = await hostRoom(makeCode);
      if (net.current !== n) return relay.close();
      n.relay = relay;
      setChat([]);
      n.host = new HostGame({
        code: relay.code, hostId: relay.id, hostName: nm, hostMode: mode, settings,
        onState: applyState, onChat: addChat, broadcast: (msg) => relay.publish(msg),
      });
      await relay.listen((conn) => n.host?.attach(conn), (err) => { if (!n.leaving) reset(errorText(err)); });
      setMyId(relay.id);
      setScreen('room');
      n.host.system(`Room ${relay.code} is open. Share the code to invite up to ${MAX_PLAYERS - 1} more players.`);
      n.host.sync();
    } catch (err) {
      if (net.current === n) reset(errorText(err));
    }
  }

  async function joinRoom(e) {
    e.preventDefault();
    const nm = checkName();
    if (!nm) return;
    const c = cleanCode(code);
    if (c.length !== 5) return setError('Room codes are 5 characters.');
    setScreen('connecting');
    // welcomed: the host let us in (it sends the chat log first). Until then,
    // room-wide messages are ignored, so a rejected player never sees the room.
    const n = { relay: null, leaving: false, welcomed: false, gotState: false, rejected: '' };
    net.current = n;
    const live = () => net.current === n && !n.leaving;
    const onMessage = (msg) => {
      if (!msg || typeof msg !== 'object' || !live()) return;
      if (msg.type === 'chatlog' && Array.isArray(msg.messages)) {
        n.welcomed = true;
        setChat(msg.messages.slice(-100));
      } else if (msg.type === 'reject') n.rejected = String(msg.reason || 'The host could not let you in.');
      else if (msg.type === 'bye') reset(n.rejected || 'The host removed you from the room.');
      else if (!n.welcomed) return;
      else if (msg.type === 'chat' && msg.message) addChat(msg.message);
      else if (msg.type === 'state' && msg.state) {
        const me = msg.state.players.find((p) => p.id === n.relay?.id);
        if (!me || !me.connected) {
          if (n.gotState) reset('You lost connection to the room. Join again to keep playing.');
          return;
        }
        n.gotState = true;
        applyState(msg.state);
        setScreen('room');
      }
    };
    try {
      const relay = await joinRelayRoom(c, { onMessage, onClose: (err) => { if (live()) reset(n.rejected || errorText(err)); } });
      if (net.current !== n) return relay?.close();
      if (!relay) return reset(`Couldn't find room ${c}. Check the code, and make sure the host still has the page open.`);
      n.relay = relay;
      setMyId(relay.id);
      relay.send({ type: 'hello', name: nm });
      setTimeout(() => { if (live() && !n.gotState) reset(n.rejected || "The host didn't answer. Try joining again."); }, 15000);
    } catch (err) {
      if (net.current === n) reset(errorText(err));
    }
  }

  async function copy(text, label) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(label);
    } catch {
      setCopied('Copy failed. Select the code instead.');
    }
    setTimeout(() => setCopied(''), 2500);
  }

  // ---------- Entry ----------
  if (screen !== 'room' || !room) {
    return (
      <section className="mp-entry">
        <div className="panel">
          <h2>Play with friends</h2>
          {screen === 'connecting' ? (
            <div className="connecting">
              <p className="big-line">Connecting…</p>
              <p className="hint">Finding the other browser. This usually takes a few seconds.</p>
              <button type="button" onClick={() => reset()}>Cancel</button>
            </div>
          ) : (
            <>
              <p className="lead">2 to 10 players connect browser to browser. One person hosts, the others join with the room code.</p>
              <div className="field">
                <label className="lbl" htmlFor="mp-name">Your name</label>
                <input id="mp-name" type="text" maxLength={16} placeholder="e.g. Ada" value={name}
                  onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="mp-actions">
                <div className="mp-col">
                  <h3>Host a room</h3>
                  <p className="hint">You pick the settings. Keep your tab open while you play: the game runs in your browser.</p>
                  <button type="button" className="primary" onClick={createRoom}>Create room</button>
                </div>
                <form className="mp-col" onSubmit={joinRoom}>
                  <h3>Join a room</h3>
                  <label className="hint" htmlFor="mp-code">Enter the 5-character code from the host.</label>
                  <div className="row">
                    <input id="mp-code" className="code-input" placeholder="ABCDE" value={code} autoCapitalize="characters"
                      spellCheck={false} onChange={(e) => setCode(cleanCode(e.target.value))} />
                    <button type="submit">Join</button>
                  </div>
                </form>
              </div>
              {error && <p className="err">{error}</p>}
            </>
          )}
        </div>
        <div className="panel rules">
          <h2>How a showdown works</h2>
          <ul>
            <li>Everyone gets the same question. You have <b>3 minutes</b> and one locked answer.</li>
            <li>Trivia rounds (overflow checks and multiple choice) are quick: pick one in <b>{QUICK_TIME_MS / 1000} seconds</b>.</li>
            <li>A correct answer is worth <b>1,000 points</b> at the start, falling to <b>100</b> as the clock runs down.</li>
            <li>First correct answer earns <b>+{ORDER_BONUS[0]}</b>, second <b>+{ORDER_BONUS[1]}</b>, third <b>+{ORDER_BONUS[2]}</b>. Wrong answers score 0.</li>
            <li>Get answers right in a row to build a streak: <b>×1.25</b>, <b>×1.5</b>, <b>×1.75</b>, up to <b>×2</b> points. A miss resets it.</li>
            <li>The round ends when everyone has answered, the time runs out, or a majority votes to skip.</li>
            <li>The host picks the settings and Easy or Hard for everyone.</li>
          </ul>
        </div>
      </section>
    );
  }

  // ---------- Room ----------
  const isHost = myId === room.hostId;
  const easy = room.mode === 'easy';
  const me = room.players.find((p) => p.id === myId) || {};
  const bits = room.settings.bits;
  const r = room.round;
  const q = r?.q;
  const live = room.players.filter((p) => p.connected);
  const winner = room.reveal?.winnerId ? room.players.find((p) => p.id === room.reveal.winnerId) : null;
  const lastRound = r && r.index + 1 >= r.total;
  const limit = r?.limit || TIME_LIMIT_MS;
  const remaining = Math.max(0, clock.deadline - now);
  const nextMs = Math.max(0, clock.nextAt - now);
  const locked = me.answered || (q && pending.q === q.id);

  const skipBtn = r && (
    <button type="button" className={`ghost${me.skip ? ' active' : ''}`} onClick={() => send({ type: 'skip' })}>
      {me.skip ? 'Cancel skip vote' : 'Vote to skip'} ({r.skipVotes}/{r.skipNeeded})
    </button>
  );

  let main;
  if (room.phase === 'lobby') {
    const why = live.length < MIN_PLAYERS ? `Waiting for at least ${MIN_PLAYERS} players.` : settingsError(room.settings);
    main = (
      <div className="card lobby-card">
        <h2>Lobby · {live.length} of {MAX_PLAYERS} players</h2>
        <p className="hint">
          {isHost
            ? 'Share the room code or invite link. Pick the settings, then start when everyone is in.'
            : 'The host picks the settings. Waiting for them to start.'}
        </p>
        <SettingsPanel
          settings={isHost ? settings : room.settings}
          onChange={(s) => { setSettings(s); send({ type: 'settings', settings: s }); }}
          readOnly={!isHost}
          idPrefix="mp"
        >
          <Menu label="Difficulty" value={MODE_NAME[room.mode]}>
            <ModeToggle mode={room.mode} setMode={setMode} idPrefix="mp-mode" disabled={!isHost}
              note={isHost ? 'You set this for everyone.' : 'The host sets this for everyone.'} />
          </Menu>
        </SettingsPanel>
        {isHost && (
          <div className="row">
            <button type="button" className="primary big-btn" disabled={!room.canStart} onClick={() => send({ type: 'start' })}>Start game</button>
            {why && <span className="muted">{why}</span>}
          </div>
        )}
      </div>
    );
  } else if (room.phase === 'over') {
    const sorted = [...room.players].sort((a, b) => b.score - a.score);
    const top = sorted[0];
    const tie = sorted.filter((p) => p.score === top?.score).length > 1;
    main = (
      <div className="card">
        <h2>Final standings</h2>
        <div className={`winner-banner ${tie ? '' : top?.color}`}>
          <span className="trophy" aria-hidden="true">🏆</span>
          <div>
            <p className="big-line">{tie ? "It's a tie at the top!" : top?.id === myId ? 'You win!' : `${top?.name} wins!`}</p>
            <p className="muted">{fmtPts(top?.score || 0)} points</p>
          </div>
        </div>
        <ol className="podium">
          {sorted.map((p, i) => {
            const rank = 1 + room.players.filter((o) => o.score > p.score).length;
            return (
              <li key={p.id} className={`pl ${p.color}`} style={{ '--i': i }}>
                <span className="place">{ordinal(rank)}</span>
                <span className="avatar" aria-hidden="true">{p.name.slice(0, 1).toUpperCase()}</span>
                <span className="nm">{p.name}{p.id === myId ? ' (you)' : ''}</span>
                <span className="muted small">
                  {p.history.filter((g) => g > 0).length}/{p.history.length} correct{p.best >= 2 ? ` · 🔥 ${p.best}` : ''}
                </span>
                <span className="pl-score">{fmtPts(p.score)}</span>
              </li>
            );
          })}
        </ol>
        <div className="row">
          {isHost ? (
            <button type="button" className="primary" onClick={() => send({ type: 'lobby' })}>Back to lobby</button>
          ) : (
            <span className="muted">Waiting for the host to set up another game.</span>
          )}
          <button type="button" onClick={() => reset()}>Leave room</button>
        </div>
      </div>
    );
  } else {
    const revealed = room.phase === 'reveal';
    const roundOrder = [...room.players].filter((p) => p.connected || p.answered)
      .sort((a, b) => (b.gain || 0) - (a.gain || 0));
    const nextMult = streakMult((me.streak || 0) + 1);
    main = (
      <div className="card">
        <div className="round-top">
          <div className="meta">
            <span className="round-lbl">Round {r.index + 1} of {r.total}</span>
            <span className="chip">{typeName(q.type)}</span>
            {q.choices && <span className="chip quick">⚡ {limit / 1000}s</span>}
          </div>
          {!revealed && <Timer ms={remaining} limit={limit} />}
        </div>
        <h2>{q.prompt}</h2>
        {q.sub && <p className="sub">{q.sub}</p>}
        <QuestionRows q={q} bits={bits} easy={easy}
          answer={revealed ? room.reveal.shown : undefined}
          verdict={revealed ? (me.correct ? 'ok' : me.answered ? 'bad' : '') : undefined} />

        {!revealed && !locked && (
          <>
            <p className="worth">
              Worth {fmtPts(Math.round(roundPoints(limit - remaining, 0, limit) * nextMult))} points if you're first right now
              {nextMult > 1 && <> · <b className="mult">🔥 {fmtMult(nextMult)} streak</b></>}
            </p>
            <AnswerBox key={q.id} q={q} bits={bits} easy={easy} submitLabel="Lock in"
              onSubmit={(raw) => { setPending({ q: q.id, raw }); send({ type: 'answer', raw }); }}>
              {skipBtn}
            </AnswerBox>
          </>
        )}
        {!revealed && locked && (
          <div className="locked-box">
            {q.choices
              ? <><p>Locked in:</p><ChoiceList q={q} picked={pending.q === q.id ? pending.raw : null} /></>
              : <p>Locked in: <code>{pending.q === q.id ? pending.raw : '…'}</code></p>}
            <p className="hint">Waiting for the others. If someone is stuck, vote to skip.</p>
            <div className="row">{skipBtn}</div>
          </div>
        )}

        {revealed && (
          <div className="feedback">
            <div ref={verdictRef} className={`verdict ${me.correct ? 'ok' : 'bad'}`}>
              {me.correct ? `Correct · +${fmtPts(me.gain)}` : me.answered ? 'Not quite · +0' : 'No answer · +0'}
              {me.correct && me.mult > 1 && <span className="mult"> 🔥 {fmtMult(me.mult)}</span>}
            </div>
            {me.correct && me.streak >= 2 && (
              <p className="hint">{me.streak} in a row. Next correct answer scores {fmtMult(streakMult(me.streak + 1))}.</p>
            )}
            {q.choices && <ChoiceList q={q} picked={me.raw} answer={room.reveal.answer} />}
            {me.answered && !me.correct && !q.choices && <p>You entered <code>{me.raw}</code></p>}
            <Explain answer={room.reveal.answer} lines={room.reveal.explain} bits={bits}
              label={q.choices ? choiceLabel(q, room.reveal.answer) : undefined} />
            <div className="round-results">
              <span className="lbl-sm">This round</span>
              <p>{winner ? `${winner.name} was first, in ${(winner.timeMs / 1000).toFixed(1)}s.` : 'Nobody got this one.'}</p>
              <ul>
                {roundOrder.map((p) => (
                  <li key={p.id} className={p.color}>
                    <span className="dot" aria-hidden="true" />
                    <span className="nm">{p.name}</span>
                    <span className={`gain${p.correct ? '' : ' zero'}`}>+{fmtPts(p.gain || 0)}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="row">
              <span className="muted">{lastRound ? 'Final standings' : 'Next round'} in {Math.ceil(nextMs / 1000)}s</span>
              {isHost && (
                <button type="button" className="primary" onClick={() => send({ type: 'next' })}>
                  {lastRound ? 'Show final standings' : 'Next round now'}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  const inviteLink = typeof window !== 'undefined' ? `${window.location.origin}${window.location.pathname}?room=${room.code}` : '';

  return (
    <section>
      <div className="bar room-bar">
        <div className="meta">
          <span className="lbl-sm">Room</span>
          <span className="room-code">{room.code}</span>
          <button type="button" className="ghost" onClick={() => copy(room.code, 'Code copied')}>Copy code</button>
          <button type="button" className="ghost" onClick={() => copy(inviteLink, 'Invite link copied')}>Copy invite link</button>
          {copied && <span className="note">{copied}</span>}
        </div>
        <div className="meta">
          {room.phase !== 'lobby' && (isHost
            ? <button type="button" className="ghost" onClick={() => setMode(easy ? 'hard' : 'easy')}>{easy ? 'Easy mode' : 'Hard mode'}</button>
            : <span className="chip">{easy ? 'Easy mode' : 'Hard mode'}</span>)}
          <SoundToggles />
          <button type="button" className="ghost" onClick={() => reset()}>Leave room</button>
        </div>
      </div>
      <div className="stage">
        <div className="stage-main">{main}</div>
        <aside className="stage-side">
          <Scoreboard players={room.players} myId={myId} hostId={room.hostId} phase={room.phase}
            winnerId={room.reveal?.winnerId} title={room.phase === 'lobby' ? 'Players' : 'Scoreboard'} />
          <Chat messages={chat} myId={myId} onSend={(text) => send({ type: 'chat', text })} />
        </aside>
      </div>
    </section>
  );
}
