// The host's browser runs the match. Every player (the host included) sends
// small messages here; the host checks answers, keeps score and broadcasts the
// whole public state. Answers never leave the host until a round is revealed.
import {
  makeQuestion, pickType, publicQuestion, parseAnswer, isCorrect, roundPoints, streakMult,
  sanitizeSettings, settingsError, timeLimit, revealShown,
} from './binary';

export const MAX_PLAYERS = 10;
export const MIN_PLAYERS = 2;
export const REVEAL_MS = 10_000; // results stay up this long before the next round
const COLORS = ['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8', 'c9', 'c10'];

const uid = () => Math.random().toString(36).slice(2, 10);
export const cleanName = (raw) => String(raw ?? '').replace(/\s+/g, ' ').trim().slice(0, 16) || 'Player';
const blankRound = () => ({ answered: false, correct: false, gain: 0, mult: 1, raw: null, timeMs: null, skip: false });
const blankGame = () => ({ score: 0, history: [], streak: 0, best: 0 });

export class HostGame {
  constructor({ code, hostId, hostName, hostMode, settings, onState, onChat }) {
    this.code = code;
    this.hostId = hostId;
    this.settings = sanitizeSettings(settings);
    this.mode = hostMode === 'hard' ? 'hard' : 'easy'; // the host picks Easy or Hard for everyone
    this.onState = onState;
    this.onChat = onChat;
    this.players = [];
    this.conns = new Map();
    this.chat = [];
    this.phase = 'lobby'; // lobby | question | reveal | over
    this.q = null;
    this.index = 0;
    this.total = 0;
    this.startAt = 0;
    this.deadline = 0;
    this.limit = 0;
    this.nextAt = 0;
    this.correctCount = 0;
    this.winnerId = null;
    this.addPlayer(hostId, hostName);
    this.timer = setInterval(() => this.tick(), 500);
  }

  destroy() {
    clearInterval(this.timer);
    for (const c of this.conns.values()) try { c.close(); } catch { /* already closed */ }
  }

  // ---- connections ----
  attach(conn) {
    conn.on('data', (msg) => {
      if (msg && msg.type === 'hello') this.hello(conn, msg);
      else this.handle(conn.peer, msg);
    });
    const drop = () => this.dropPlayer(conn.peer);
    conn.on('close', drop);
    conn.on('error', drop);
  }

  hello(conn, msg) {
    if (this.player(conn.peer)) return;
    const reject = (reason) => {
      try { conn.send({ type: 'reject', reason }); } catch { /* ignore */ }
      setTimeout(() => conn.close(), 500);
    };
    if (this.phase !== 'lobby') return reject('This game has already started. Ask the host to go back to the lobby, then join again.');
    if (this.live().length >= MAX_PLAYERS) return reject(`This room is full (${MAX_PLAYERS} players).`);
    this.conns.set(conn.peer, conn);
    const p = this.addPlayer(conn.peer, msg.name);
    this.send(conn.peer, { type: 'chatlog', messages: this.chat });
    this.system(`${p.name} joined`);
    this.sync();
  }

  addPlayer(id, rawName) {
    const taken = new Set(this.players.map((p) => p.name));
    const base = cleanName(rawName);
    let name = base;
    for (let i = 2; taken.has(name); i++) name = `${base.slice(0, 13)} ${i}`;
    const used = new Set(this.live().map((p) => p.color));
    const color = COLORS.find((c) => !used.has(c)) || COLORS[0];
    const p = { id, name, color, connected: true, ...blankGame(), ...blankRound() };
    this.players.push(p);
    return p;
  }

  dropPlayer(id) {
    const p = this.player(id);
    if (!p || !p.connected) return;
    this.conns.delete(id);
    if (this.phase === 'lobby') this.players = this.players.filter((x) => x.id !== id);
    else p.connected = false;
    this.system(`${p.name} left`);
    if (this.phase === 'question' && this.checkRoundEnd()) return;
    this.sync();
  }

  player(id) { return this.players.find((p) => p.id === id); }
  live() { return this.players.filter((p) => p.connected); }

  // ---- messages from players (the host calls this too, with its own id) ----
  handle(id, msg) {
    const p = this.player(id);
    if (!p || !p.connected || !msg || typeof msg !== 'object') return;
    switch (msg.type) {
      case 'chat': {
        const text = String(msg.text ?? '').replace(/\s+/g, ' ').trim().slice(0, 300);
        if (text) this.pushChat({ id: uid(), from: id, name: p.name, color: p.color, text, at: Date.now() });
        return;
      }
      case 'answer': return this.submit(p, String(msg.raw ?? '').slice(0, 80));
      case 'skip': return this.voteSkip(p);
    }
    if (id !== this.hostId) return; // everything below is host-only
    switch (msg.type) {
      case 'settings':
        if (this.phase === 'lobby') { this.settings = sanitizeSettings(msg.settings); this.sync(); }
        return;
      case 'mode': this.mode = msg.mode === 'hard' ? 'hard' : 'easy'; return this.sync();
      case 'start': return this.start();
      case 'next': if (this.phase === 'reveal') this.advance(); return;
      case 'lobby': return this.toLobby();
    }
  }

  // ---- game flow ----
  canStart() {
    return this.phase === 'lobby' && this.live().length >= MIN_PLAYERS && !settingsError(this.settings);
  }

  start() {
    if (!this.canStart()) return;
    for (const p of this.players) Object.assign(p, blankGame());
    this.index = 0;
    this.total = this.settings.rounds;
    this.system('Game started. Good luck!');
    this.newRound();
  }

  newRound() {
    this.q = makeQuestion(pickType(this.settings.weights), this.settings);
    this.phase = 'question';
    this.startAt = Date.now();
    this.limit = timeLimit(this.q);
    this.deadline = this.startAt + this.limit;
    this.correctCount = 0;
    this.winnerId = null;
    for (const p of this.players) Object.assign(p, blankRound());
    this.sync();
  }

  submit(p, raw) {
    if (this.phase !== 'question' || p.answered) return;
    const parsed = parseAnswer(this.q, raw, this.settings.bits);
    if (parsed.err) return; // the player's own page already explains format errors
    p.answered = true;
    p.raw = raw.trim();
    p.timeMs = Date.now() - this.startAt;
    p.correct = isCorrect(this.q, parsed.value, this.settings.bits);
    if (p.correct) {
      // The streak only moves when the round ends, so it can't leak who is right.
      p.mult = streakMult(p.streak + 1);
      p.gain = Math.round(roundPoints(p.timeMs, this.correctCount, this.limit) * p.mult);
      if (this.correctCount === 0) this.winnerId = p.id;
      this.correctCount++;
    }
    if (!this.checkRoundEnd()) this.sync();
  }

  voteSkip(p) {
    if (this.phase !== 'question') return;
    p.skip = !p.skip;
    if (!this.checkRoundEnd()) this.sync();
  }

  skipNeeded() { return Math.floor(this.live().length / 2) + 1; } // a strict majority

  checkRoundEnd() {
    const live = this.live();
    if (live.length && live.every((p) => p.answered)) { this.endRound(); return true; }
    if (live.filter((p) => p.skip).length >= this.skipNeeded()) { this.endRound(true); return true; }
    return false;
  }

  endRound(skipped = false) {
    if (this.phase !== 'question') return;
    this.phase = 'reveal';
    for (const p of this.players) {
      p.score += p.correct ? p.gain : 0;
      p.history.push(p.correct ? p.gain : 0);
      p.streak = p.correct ? p.streak + 1 : 0;
      p.best = Math.max(p.best, p.streak);
    }
    if (skipped) this.system('Majority voted to skip.');
    this.nextAt = Date.now() + REVEAL_MS;
    this.sync();
  }

  advance() {
    this.index++;
    if (this.index >= this.total) {
      this.phase = 'over';
      this.sync();
    } else this.newRound();
  }

  toLobby() {
    this.phase = 'lobby';
    this.q = null;
    this.players = this.players.filter((p) => p.connected);
    for (const p of this.players) Object.assign(p, blankGame(), blankRound());
    this.sync();
  }

  tick() {
    const now = Date.now();
    if (this.phase === 'question' && now >= this.deadline) {
      this.system("Time's up.");
      this.endRound();
    } else if (this.phase === 'reveal' && now >= this.nextAt) this.advance();
  }

  // ---- broadcasting ----
  publicState() {
    const shown = this.phase === 'reveal' || this.phase === 'over';
    const now = Date.now();
    const live = this.live();
    return {
      code: this.code,
      hostId: this.hostId,
      phase: this.phase,
      mode: this.mode,
      settings: this.settings,
      canStart: this.canStart(),
      players: this.players.map((p) => ({
        id: p.id, name: p.name, color: p.color, score: p.score, connected: p.connected,
        history: p.history, answered: p.answered, skip: p.skip, streak: p.streak, best: p.best,
        // Correctness and points stay hidden until the round is revealed.
        correct: shown ? p.correct : null,
        gain: shown ? (p.correct ? p.gain : 0) : null,
        mult: shown && p.correct ? p.mult : null,
        raw: shown ? p.raw : null,
        timeMs: shown ? p.timeMs : null,
      })),
      round: this.q && this.phase !== 'lobby'
        ? {
            index: this.index, total: this.total, q: publicQuestion(this.q),
            remaining: Math.max(0, this.deadline - now), limit: this.limit,
            skipVotes: live.filter((p) => p.skip).length, skipNeeded: this.skipNeeded(),
          }
        : null,
      reveal: shown && this.q
        ? { answer: this.q.answer, shown: revealShown(this.q), explain: this.q.explain, winnerId: this.winnerId }
        : null,
      nextIn: this.phase === 'reveal' ? Math.max(0, this.nextAt - now) : null,
    };
  }

  sync() {
    const state = this.publicState();
    for (const id of this.conns.keys()) this.send(id, { type: 'state', state });
    this.onState(state);
  }

  send(id, msg) {
    const c = this.conns.get(id);
    if (c && c.open) try { c.send(msg); } catch { /* dropped */ }
  }

  pushChat(m) {
    this.chat.push(m);
    if (this.chat.length > 100) this.chat.shift();
    for (const id of this.conns.keys()) this.send(id, { type: 'chat', message: m });
    this.onChat(m);
  }

  system(text) {
    this.pushChat({ id: uid(), system: true, text, at: Date.now() });
  }
}
