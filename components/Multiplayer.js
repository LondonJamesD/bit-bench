'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { HostGame, MAX_PLAYERS, MIN_PLAYERS } from '../lib/host';
import { TYPES, TIME_LIMIT_MS, ORDER_BONUS, roundPoints, settingsError } from '../lib/binary';
import { load, save } from '../lib/storage';
import SettingsPanel from './SettingsPanel';
import ModeToggle from './ModeToggle';
import Scoreboard from './Scoreboard';
import Chat from './Chat';
import QuestionRows from './QuestionRows';
import AnswerBox from './AnswerBox';
import Explain from './Explain';

// Room codes map to a PeerJS id. PeerJS's free cloud server only introduces
// the browsers to each other; after that, game data flows peer to peer over WebRTC.
const PREFIX = 'bitbench-p2p-7k3-';
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const makeCode = () => Array.from({ length: 5 }, () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]).join('');
const cleanCode = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5);
const typeName = (id) => TYPES.find((t) => t.id === id)?.name || '';
const fmtPts = (n) => n.toLocaleString('en-US');
const ordinal = (n) => ['1st', '2nd', '3rd', '4th'][n - 1] || `${n}th`;

function errorText(err) {
  switch (err?.type) {
    case 'browser-incompatible': return "This browser doesn't support WebRTC. Try a recent Chrome, Edge, Firefox or Safari.";
    case 'network':
    case 'server-error':
    case 'socket-error':
    case 'socket-closed': return "Couldn't reach the connection server. Check your internet and try again.";
    default: return `Connection problem (${err?.type || 'unknown'}). Try again.`;
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

function Timer({ ms }) {
  const s = Math.ceil(ms / 1000);
  return (
    <div className={`timer${s <= 30 ? ' low' : ''}`} aria-label={`${s} seconds left`}>
      <span className="mono">{Math.floor(s / 60)}:{String(s % 60).padStart(2, '0')}</span>
      <div className="timer-bar"><i style={{ width: `${Math.min(100, (ms / TIME_LIMIT_MS) * 100)}%` }} /></div>
    </div>
  );
}

export default function Multiplayer({ settings, setSettings, mode, setMode, inviteCode }) {
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
  const net = useRef(null); // { peer, host?, conn?, leaving }
  const now = useNow(!!room && (room.phase === 'question' || room.phase === 'reveal'));
  const easy = mode === 'easy';

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
    try { n.peer.destroy(); } catch { /* already gone */ }
  }
  function reset(message = '') {
    teardown();
    setRoom(null);
    setChat([]);
    setScreen('entry');
    setError(message);
  }

  // Everything a player does goes through here. The host handles its own
  // messages directly; everyone else sends them over their data channel.
  function send(msg) {
    const n = net.current;
    if (!n) return;
    if (n.host) n.host.handle(n.host.hostId, msg);
    else if (n.conn?.open) n.conn.send(msg);
  }

  useEffect(() => {
    if (screen === 'room') send({ type: 'mode', mode });
  }, [mode, screen]); // eslint-disable-line react-hooks/exhaustive-deps

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
    const { Peer } = await import('peerjs');
    const open = (attempt) => {
      const c = makeCode();
      const peer = new Peer(PREFIX + c, { debug: 0 });
      const n = { peer, host: null, leaving: false };
      net.current = n;
      peer.on('open', (id) => {
        if (net.current !== n) return;
        setChat([]);
        n.host = new HostGame({ code: c, hostId: id, hostName: nm, hostMode: mode, settings, onState: applyState, onChat: addChat });
        setMyId(id);
        setScreen('room');
        n.host.system(`Room ${c} is open. Share the code to invite up to ${MAX_PLAYERS - 1} more players.`);
        n.host.sync();
      });
      peer.on('connection', (conn) => {
        if (n.host) n.host.attach(conn);
        else conn.close();
      });
      // Losing the introduction server doesn't break existing connections; reconnect quietly.
      peer.on('disconnected', () => { if (!n.leaving && !peer.destroyed) peer.reconnect(); });
      peer.on('error', (err) => {
        if (n.leaving) return;
        if (err.type === 'unavailable-id' && attempt < 4) {
          n.leaving = true;
          peer.destroy();
          open(attempt + 1);
          return;
        }
        if (n.host) return console.warn('Bit Bench host:', err.type); // one player's link failed; the room keeps going
        reset(errorText(err));
      });
    };
    open(0);
  }

  async function joinRoom(e) {
    e.preventDefault();
    const nm = checkName();
    if (!nm) return;
    const c = cleanCode(code);
    if (c.length !== 5) return setError('Room codes are 5 characters.');
    setScreen('connecting');
    const { Peer } = await import('peerjs');
    const peer = new Peer({ debug: 0 });
    const n = { peer, conn: null, leaving: false, gotState: false, rejected: '' };
    net.current = n;
    const notFound = `Couldn't find room ${c}. Check the code, and make sure the host still has the page open.`;
    const timeout = setTimeout(() => { if (net.current === n && !n.gotState) reset(n.rejected || notFound); }, 15000);
    peer.on('open', (id) => {
      if (net.current !== n) return;
      setMyId(id);
      const conn = peer.connect(PREFIX + c, { reliable: true, serialization: 'json' });
      n.conn = conn;
      conn.on('open', () => conn.send({ type: 'hello', name: nm, mode }));
      conn.on('data', (msg) => {
        if (!msg || typeof msg !== 'object' || net.current !== n) return;
        if (msg.type === 'state' && msg.state) {
          n.gotState = true;
          clearTimeout(timeout);
          applyState(msg.state);
          setScreen('room');
        } else if (msg.type === 'chat' && msg.message) addChat(msg.message);
        else if (msg.type === 'chatlog' && Array.isArray(msg.messages)) setChat(msg.messages.slice(-100));
        else if (msg.type === 'reject') n.rejected = String(msg.reason || 'The host could not let you in.');
      });
      conn.on('close', () => {
        if (n.leaving) return;
        clearTimeout(timeout);
        reset(n.rejected || (n.gotState ? 'The host closed the room or lost their connection.' : notFound));
      });
    });
    peer.on('error', (err) => {
      if (n.leaving) return;
      if (err.type === 'peer-unavailable') { clearTimeout(timeout); reset(notFound); }
      else if (!n.gotState) { clearTimeout(timeout); reset(errorText(err)); }
    });
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
              <p className="lead">2 to 4 players connect browser to browser. One person hosts, the others join with the room code.</p>
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
            <li>A correct answer is worth <b>1,000 points</b> at the start, falling to <b>100</b> as the clock runs down.</li>
            <li>First correct answer earns <b>+{ORDER_BONUS[0]}</b>, second <b>+{ORDER_BONUS[1]}</b>, third <b>+{ORDER_BONUS[2]}</b>. Wrong answers score 0.</li>
            <li>The round ends when everyone has answered, the time runs out, or a majority votes to skip.</li>
            <li>Easy and Hard are your own choice. Everyone can see who is playing on which.</li>
          </ul>
        </div>
      </section>
    );
  }

  // ---------- Room ----------
  const isHost = myId === room.hostId;
  const me = room.players.find((p) => p.id === myId) || {};
  const bits = room.settings.bits;
  const r = room.round;
  const q = r?.q;
  const live = room.players.filter((p) => p.connected);
  const winner = room.reveal?.winnerId ? room.players.find((p) => p.id === room.reveal.winnerId) : null;
  const lastRound = r && r.index + 1 >= r.total;
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
      <>
        <div className="card lobby-card">
          <h2>Lobby · {live.length} of {MAX_PLAYERS} players</h2>
          {isHost ? (
            <>
              <p className="hint">Share the room code or invite link. Set up the game below, then start when everyone is in.</p>
              <div className="row">
                <button type="button" className="primary big-btn" disabled={!room.canStart} onClick={() => send({ type: 'start' })}>Start game</button>
                {why && <span className="muted">{why}</span>}
              </div>
            </>
          ) : (
            <p className="hint">Waiting for the host to start. You can change your own difficulty while you wait.</p>
          )}
          <ModeToggle mode={mode} setMode={setMode} idPrefix="mp-mode" />
        </div>
        <SettingsPanel
          settings={isHost ? settings : room.settings}
          onChange={(s) => { setSettings(s); send({ type: 'settings', settings: s }); }}
          readOnly={!isHost}
          idPrefix="mp"
        />
      </>
    );
  } else if (room.phase === 'over') {
    const sorted = [...room.players].sort((a, b) => b.score - a.score);
    const top = sorted[0];
    const tie = sorted.filter((p) => p.score === top?.score).length > 1;
    main = (
      <div className="card">
        <h2>Final standings</h2>
        <p className="lead">{tie ? "It's a tie at the top!" : `${top?.name} wins with ${fmtPts(top?.score || 0)} points.`}</p>
        <ol className="podium">
          {sorted.map((p) => {
            const rank = 1 + room.players.filter((o) => o.score > p.score).length;
            return (
              <li key={p.id} className={`pl ${p.color}`}>
                <span className="place">{ordinal(rank)}</span>
                <span className="avatar" aria-hidden="true">{p.name.slice(0, 1).toUpperCase()}</span>
                <span className="nm">{p.name}{p.id === myId ? ' (you)' : ''}</span>
                <span className="muted small">{p.history.filter((g) => g > 0).length}/{p.history.length} correct</span>
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
    main = (
      <div className="card">
        <div className="round-top">
          <div className="meta">
            <span className="round-lbl">Round {r.index + 1} of {r.total}</span>
            <span className="chip">{typeName(q.type)}</span>
          </div>
          {!revealed && <Timer ms={remaining} />}
        </div>
        <h2>{q.prompt}</h2>
        {q.sub && <p className="sub">{q.sub}</p>}
        <QuestionRows q={q} bits={bits} easy={easy}
          answer={revealed ? room.reveal.answer : undefined}
          verdict={revealed ? (me.correct ? 'ok' : me.answered ? 'bad' : '') : undefined} />

        {!revealed && !locked && (
          <>
            <p className="worth">Worth {fmtPts(roundPoints(TIME_LIMIT_MS - remaining, 0))} points if you're first right now.</p>
            <AnswerBox key={q.id} q={q} bits={bits} easy={easy} submitLabel="Lock in"
              onSubmit={(raw) => { setPending({ q: q.id, raw }); send({ type: 'answer', raw }); }}>
              {skipBtn}
            </AnswerBox>
          </>
        )}
        {!revealed && locked && (
          <div className="locked-box">
            <p>Locked in: <code>{pending.q === q.id ? pending.raw : '…'}</code></p>
            <p className="hint">Waiting for the others. If someone is stuck, vote to skip.</p>
            <div className="row">{skipBtn}</div>
          </div>
        )}

        {revealed && (
          <div className="feedback">
            <div className={`verdict ${me.correct ? 'ok' : 'bad'}`}>
              {me.correct ? `Correct · +${fmtPts(me.gain)}` : me.answered ? 'Not quite · +0' : 'No answer · +0'}
            </div>
            {me.answered && !me.correct && <p>You entered <code>{me.raw}</code></p>}
            <Explain answer={room.reveal.answer} lines={room.reveal.explain} bits={bits} />
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
          {room.phase !== 'lobby' && (
            <button type="button" className="ghost" onClick={() => setMode(easy ? 'hard' : 'easy')}>{easy ? 'Easy mode' : 'Hard mode'}</button>
          )}
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
