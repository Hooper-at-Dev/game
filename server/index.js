import express from 'express';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PAIRS } from './words.js';
import { POWERS } from '../shared/powers.js';
import { TWISTS } from '../shared/twists.js';

const PORT = process.env.PORT || 4310;
const K = process.env.FAST ? 0.08 : 1; // timer scale, used by the bot test
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const http = createServer(app);
const io = new Server(http, { cors: { origin: true }, maxHttpBufferSize: 2e5 });

const dist = path.join(__dirname, '..', 'dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.use((_, res) => res.sendFile(path.join(dist, 'index.html')));
}

const MAXP = 8;
const MINP = 3;
const INK = 1.0; // ink per turn, in canvas widths
const T = { deal: 9000, twistVote: 9000, twistShow: 4200, verdict: 13000, steal: 30000, afterSteal: 5000, appraise: 16000, scores: 30000 };

const rooms = new Map();
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const shuffle = (a) => {
  a = [...a];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};
const clamp = (n) => Math.max(0, Math.min(1, n));

function mkRoom() {
  let code;
  do code = Array.from({ length: 4 }, () => pick('BCDFGHJKLMNPQRSTVWXZ')).join('');
  while (rooms.has(code));
  const room = {
    code,
    hostId: null,
    players: new Map(),
    settings: { rounds: 5, turnSecs: 12, laps: 2, voteSecs: 40, ink: 1, rules: 'vote' },
    twist: null,
    sus: new Map(),
    phase: 'lobby',
    round: 0,
    used: new Set(),
    strokes: [],
    history: [],
    votes: {},
    appraisal: {},
    tremor: new Set(),
    order: [],
    turn: null,
    turnIdx: -1,
    total: 0,
    results: null,
    timer: null,
    endsAt: 0,
  };
  rooms.set(code, room);
  return room;
}

const active = (room) => [...room.players.values()].filter((p) => !p.sitting);
const present = (room) => active(room).filter((p) => p.connected);
// Heat: how many players currently have an eyebrow raised at this one.
const heatOf = (room, id) => [...room.sus.values()].filter((set) => set.has(id)).length;

function after(room, ms, fn) {
  clearTimeout(room.timer);
  room.endsAt = Date.now() + ms * K;
  room.timer = setTimeout(fn, ms * K);
}

function snap(room, me) {
  const r = room.results;
  const iAmForger = me.id === room.forgerId;
  const showReal = ['appraise', 'scores', 'final'].includes(room.phase);
  const inRound = room.phase !== 'lobby' && room.phase !== 'final' && !me.sitting;
  return {
    code: room.code,
    phase: room.phase,
    round: room.round,
    hostId: room.hostId,
    settings: room.settings,
    now: Date.now(),
    endsAt: room.endsAt,
    order: room.order,
    players: [...room.players.values()].map((p) => ({
      id: p.id,
      name: p.name,
      ink: p.ink,
      face: p.face,
      connected: p.connected,
      score: p.score,
      streak: p.streak,
      gain: p.gain,
      sitting: p.sitting,
      heat: heatOf(room, p.id),
      voted: room.phase === 'vote' && p.id in room.votes,
      rated: room.phase === 'appraise' && p.id in room.appraisal,
    })),
    turn:
      room.phase === 'draw' && room.turn
        ? { pid: room.turn.pid, idx: room.turnIdx, total: room.total, budget: room.turn.budget, secs: room.turn.secs, tremor: room.turn.tremor }
        : null,
    rule: room.twist?.chosen || null,
    twist: room.twist && {
      options: room.twist.options,
      chosen: room.twist.chosen,
      counts: room.twist.counts,
      voted: Object.keys(room.twist.votes).length,
    },
    you: {
      id: me.id,
      twistVote: room.twist?.votes[me.id] ?? null,
      sus: [...(room.sus.get(me.id) || [])],
      sitting: me.sitting,
      role: inRound ? (iAmForger ? 'forger' : 'artist') : null,
      subject: inRound ? (iAmForger ? room.fake : room.real) : null,
      power: inRound ? me.power : null,
      intel: inRound ? me.intel : null,
      gavel: me.gavel,
      vote: room.votes[me.id] ?? null,
      rating: room.appraisal[me.id] ?? null,
    },
    results: r && {
      tally: r.tally,
      votes: r.votes,
      gavels: r.gavels,
      forgerId: r.forgerId,
      caught: r.caught,
      fake: r.fake,
      real: showReal || !iAmForger ? r.real : null,
      steal: r.steal,
      card: r.card,
      awards: r.awards,
      marks: r.marks,
    },
    stealOptions: room.phase === 'verdict' && r?.caught && iAmForger && !r.steal ? r.options : null,
  };
}

function sync(room) {
  for (const p of room.players.values()) if (p.sid) io.to(p.sid).emit('state', snap(room, p));
}
const visible = (room, p) => room.strokes.filter((s) => !s.hidden || s.pid === p.id || room.phase !== 'draw');
function syncStrokes(room) {
  for (const p of room.players.values()) if (p.sid) io.to(p.sid).emit('strokes', visible(room, p));
}
const toast = (room, text, kind = 'info') => io.to(room.code).emit('toast', { text, kind });

function dealPower() {
  const ids = Object.keys(POWERS);
  let roll = Math.random() * ids.reduce((s, id) => s + POWERS[id].w, 0);
  for (const id of ids) if ((roll -= POWERS[id].w) <= 0) return { id, used: false };
  return { id: ids[0], used: false };
}

function startRound(room) {
  room.round++;
  for (const p of room.players.values()) {
    p.sitting = !p.connected;
    p.intel = null;
    p.gavel = false;
    p.gain = 0;
    p.power = null;
  }
  const act = active(room);
  let pool = PAIRS.map((_, i) => i).filter((i) => !room.used.has(i));
  if (!pool.length) {
    room.used.clear();
    pool = PAIRS.map((_, i) => i);
  }
  const pi = pick(pool);
  room.used.add(pi);
  const flip = Math.random() < 0.5;
  room.real = PAIRS[pi][flip ? 1 : 0];
  room.fake = PAIRS[pi][flip ? 0 : 1];
  room.forgerId = pick(act).id;
  // Only the forger gets a secret power.
  room.players.get(room.forgerId).power = dealPower();
  room.strokes = [];
  room.votes = {};
  room.appraisal = {};
  room.results = null;
  room.tremor = new Set();
  room.twist = null;
  room.sus = new Map();
  room.order = shuffle(act.map((p) => p.id));
  room.total = room.order.length * room.settings.laps;
  room.turnIdx = -1;
  room.turn = null;
  room.phase = 'deal';
  syncStrokes(room);
  after(room, T.deal, () => startTwist(room));
  sync(room);
}

function beginDraw(room) {
  room.phase = 'draw';
  nextTurn(room);
}

function startTwist(room) {
  if (room.phase !== 'deal') return;
  const mode = room.settings.rules;
  if (mode === 'off') return beginDraw(room);
  room.twist = { options: shuffle(Object.keys(TWISTS)).slice(0, 3), votes: {}, chosen: null, counts: null };
  room.phase = 'twist';
  if (mode === 'random') return resolveTwist(room);
  after(room, T.twistVote, () => resolveTwist(room));
  sync(room);
}

// Raffle: every vote is one ticket, so the popular rule usually wins but a lone vote can.
function resolveTwist(room) {
  const tw = room.twist;
  if (room.phase !== 'twist' || tw.chosen) return;
  const tickets = Object.values(tw.votes);
  tw.counts = Object.fromEntries(tw.options.map((o) => [o, tickets.filter((v) => v === o).length]));
  tw.chosen = pick(tickets.length ? tickets : tw.options);
  after(room, T.twistShow, () => beginDraw(room));
  sync(room);
}

function nextTurn(room) {
  if (room.phase !== 'draw') return;
  const rule = room.twist?.chosen;
  const secs = rule === 'speed' ? Math.max(4, Math.round(room.settings.turnSecs / 2)) : room.settings.turnSecs;
  for (;;) {
    room.turnIdx++;
    if (room.turnIdx >= room.total) return startVote(room);
    const p = room.players.get(room.order[room.turnIdx % room.order.length]);
    if (p?.connected) {
      room.turn = { pid: p.id, budget: INK * room.settings.ink * (rule === 'tiny' ? 0.5 : 1), secs, max: rule === 'oneline' ? 1 : 80, used: 0, n: 0, tremor: room.tremor.delete(p.id), invisible: false, cur: null };
      break;
    }
  }
  after(room, secs * 1000 + 500, () => nextTurn(room));
  sync(room);
}

function startVote(room) {
  room.phase = 'vote';
  room.turn = null;
  syncStrokes(room); // invisible ink surfaces here
  after(room, room.settings.voteSecs * 1000, () => endVote(room));
  sync(room);
}

function endVote(room) {
  if (room.phase !== 'vote') return;
  const tally = {};
  const gavels = [];
  for (const [voter, target] of Object.entries(room.votes)) {
    const v = room.players.get(voter);
    if (v?.gavel) gavels.push(voter);
    tally[target] = (tally[target] || 0) + (v?.gavel ? 2 : 1);
  }
  const mine = tally[room.forgerId] || 0;
  const caught = mine > 0 && Object.entries(tally).every(([id, n]) => id === room.forgerId || n < mine);
  const decoys = shuffle(PAIRS.flat().filter((w) => w !== room.real && w !== room.fake)).slice(0, 5);
  room.results = {
    tally,
    votes: { ...room.votes },
    gavels,
    forgerId: room.forgerId,
    caught,
    fake: room.fake,
    real: room.real,
    steal: null,
    options: shuffle([room.real, ...decoys]),
  };
  room.phase = 'verdict';
  after(room, caught ? T.steal : T.verdict, () => toAppraise(room));
  sync(room);
}

function toAppraise(room) {
  if (room.phase !== 'verdict') return;
  room.phase = 'appraise';
  room.appraisal = {};
  after(room, T.appraise, () => toScores(room));
  sync(room);
}

function toScores(room) {
  if (room.phase !== 'appraise') return;
  const r = room.results;
  const act = active(room);
  const artists = act.filter((p) => p.id !== r.forgerId);
  const forger = room.players.get(r.forgerId);
  const card = {};
  const awards = [];
  let fooled = 0;
  const kept = r.caught && !r.steal?.correct;
  for (const a of artists) {
    const lines = [];
    if (r.votes[a.id] === r.forgerId) {
      a.streak++;
      lines.push(['Spotted the forger', 100]);
      if (a.streak > 1) lines.push([`${a.streak}× sleuth streak`, Math.min(60, (a.streak - 1) * 20)]);
      if (a.streak === 3) awards.push({ pid: a.id, title: 'Bloodhound', blurb: 'three forgers sniffed out in a row' });
    } else {
      a.streak = 0;
      fooled++;
    }
    if (kept) lines.push(['Subject stayed secret', 50]);
    card[a.id] = lines;
  }
  const marks = artists.reduce((s, a) => s + (room.appraisal[a.id] || 0), 0);
  r.marks = marks;
  if (forger) {
    const lines = [];
    if (fooled) lines.push([`Fooled ${fooled} artist${fooled > 1 ? 's' : ''}`, 40 * fooled]);
    if (!r.caught) lines.push(['Walked free', 80]);
    if (r.steal?.correct) lines.push(['Stole the real subject', 100]);
    if (marks) lines.push(['Forgery showed through', 15 * marks]);
    card[forger.id] = lines;
    if (!r.tally[forger.id]) awards.push({ pid: forger.id, title: 'Ghost', blurb: 'not a single accusation' });
  }
  const scapegoat = artists
    .filter((a) => (r.tally[a.id] || 0) >= 2)
    .sort((a, b) => r.tally[b.id] - r.tally[a.id])[0];
  if (scapegoat) awards.push({ pid: scapegoat.id, title: 'Scapegoat', blurb: 'innocent, and nobody believed it' });
  for (const p of act) {
    p.gain = (card[p.id] || []).reduce((s, l) => s + l[1], 0);
    p.score += p.gain;
  }
  r.card = card;
  r.awards = awards;
  room.history.push({
    round: room.round,
    real: r.real,
    fake: r.fake,
    forger: forger?.name || '???',
    caught: r.caught,
    strokes: room.strokes,
    inks: Object.fromEntries([...room.players.values()].map((p) => [p.id, p.ink])),
    crew: act.length,
    twist: room.twist?.chosen || null,
  });
  room.phase = 'scores';
  after(room, T.scores, () => advance(room));
  sync(room);
}

function advance(room) {
  if (room.phase !== 'scores') return;
  if (room.round >= room.settings.rounds || present(room).length < 2) {
    clearTimeout(room.timer);
    room.phase = 'final';
    io.to(room.code).emit('gallery', room.history);
    sync(room);
  } else startRound(room);
}

function usePower(room, p) {
  const pw = p.power;
  if (!pw || pw.used || p.sitting || p.id !== room.forgerId) return 'No power to use.';
  const t = room.turn;
  const myTurn = room.phase === 'draw' && t?.pid === p.id;
  let note;
  switch (pw.id) {
    case 'overflow':
      if (!myTurn) return 'Save it for your turn.';
      t.budget *= 2;
      break;
    case 'invisible':
      if (!myTurn) return 'Save it for your turn.';
      t.invisible = true; // silent: a toast during the forger's own turn would unmask them
      break;
    case 'turps': {
      if (room.phase !== 'draw') return 'Only while painting.';
      const others = room.strokes.filter((s) => s.pid !== p.id && !s.hidden);
      if (!others.length) return 'Nothing to dissolve yet.';
      const last = others[others.length - 1];
      room.strokes = room.strokes.filter((s) => !(s.pid === last.pid && s.turn === last.turn));
      syncStrokes(room);
      note = `The forger poured turpentine on ${room.players.get(last.pid)?.name || 'a painter'}'s work.`;
      break;
    }
    case 'tremor': {
      if (room.phase !== 'draw') return 'Only while painting.';
      let target;
      for (let i = room.turnIdx + 1; i < room.total; i++) {
        const q = room.players.get(room.order[i % room.order.length]);
        if (q?.connected && q.id !== p.id) {
          target = q;
          break;
        }
      }
      if (!target) return 'Nobody left to rattle.';
      room.tremor.add(target.id);
      note = `The forger slipped ${target.name} a double espresso.`;
      break;
    }
    case 'alibi': {
      if (room.phase !== 'draw' && room.phase !== 'vote') return 'Too late for that.';
      p.intel = `The real commission starts with “${room.real[0]}” and is ${room.real.length} characters long.`;
      note = 'The forger got an inside tip about your commission.';
      break;
    }
    case 'gavel':
      if (room.phase !== 'vote') return 'Wait for the vote.';
      p.gavel = true;
      note = 'The forger loaded their gavel. One vote counts twice.';
      break;
    default:
      return 'Unknown power.';
  }
  pw.used = true;
  if (note) toast(room, note, 'power');
  sync(room);
  return null;
}

function drop(room, p) {
  p.connected = false;
  p.sid = null;
  if (room.phase === 'lobby') room.players.delete(p.id);
  const here = [...room.players.values()].filter((q) => q.connected);
  if (!here.length) {
    clearTimeout(room.timer);
    room.gc = setTimeout(() => rooms.delete(room.code), 5 * 60 * 1000);
    return;
  }
  if (!room.players.get(room.hostId)?.connected) room.hostId = here[0].id;
  if (room.phase === 'draw' && room.turn?.pid === p.id) return nextTurn(room);
  if (room.phase === 'vote' && present(room).every((q) => q.id in room.votes)) return endVote(room);
  sync(room);
}

io.on('connection', (socket) => {
  const ctx = () => {
    const room = rooms.get(socket.data.code);
    const p = room?.players.get(socket.data.pid);
    return room && p ? { room, p } : null;
  };

  socket.on('join', (d, ack) => {
    ack = typeof ack === 'function' ? ack : () => {};
    const pid = String(d?.pid || '').slice(0, 40);
    if (!pid) return ack({ error: 'Something went wrong. Refresh and try again.' });
    const name = String(d?.name || '').trim().slice(0, 14) || 'Anon';
    const face = Math.max(0, Math.min(7, d?.face | 0));
    const code = String(d?.code || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);
    let room = code ? rooms.get(code) : null;
    if (code && !room) return ack({ error: `No studio with the code ${code}.` });
    if (!room) room = mkRoom();
    clearTimeout(room.gc);
    let p = room.players.get(pid);
    if (!p) {
      if (room.players.size >= MAXP) return ack({ error: 'That studio is full (8 painters).' });
      const taken = new Set([...room.players.values()].map((q) => q.ink));
      const ink = [0, 1, 2, 3, 4, 5, 6, 7].find((i) => !taken.has(i));
      p = { id: pid, ink, score: 0, streak: 0, gain: 0, power: null, intel: null, gavel: false, sitting: room.phase !== 'lobby' && room.phase !== 'final' };
      room.players.set(pid, p);
    }
    Object.assign(p, { sid: socket.id, connected: true, name, face });
    socket.data.code = room.code;
    socket.data.pid = pid;
    socket.join(room.code);
    if (!room.players.get(room.hostId)?.connected) room.hostId = pid;
    ack({ ok: true, code: room.code });
    socket.emit('strokes', visible(room, p));
    if (room.phase === 'final') socket.emit('gallery', room.history);
    sync(room);
  });

  socket.on('settings', (d) => {
    const c = ctx();
    if (!c || c.room.hostId !== c.p.id || c.room.phase !== 'lobby') return;
    const s = c.room.settings;
    if ([3, 5, 7].includes(d?.rounds)) s.rounds = d.rounds;
    if ([8, 12, 16, 20].includes(d?.turnSecs)) s.turnSecs = d.turnSecs;
    if ([20, 40, 60].includes(d?.voteSecs)) s.voteSecs = d.voteSecs;
    if ([0.6, 1, 1.5].includes(d?.ink)) s.ink = d.ink;
    if (['vote', 'random', 'off'].includes(d?.rules)) s.rules = d.rules;
    if ([2, 3].includes(d?.laps)) s.laps = d.laps;
    sync(c.room);
  });

  socket.on('start', () => {
    const c = ctx();
    if (!c || c.room.hostId !== c.p.id || c.room.phase !== 'lobby') return;
    if ([...c.room.players.values()].filter((p) => p.connected).length < MINP) return;
    c.room.round = 0;
    c.room.history = [];
    for (const p of c.room.players.values()) Object.assign(p, { score: 0, streak: 0, gain: 0 });
    startRound(c.room);
  });

  socket.on('stroke:start', (d) => {
    const c = ctx();
    const t = c?.room.turn;
    if (!c || c.room.phase !== 'draw' || t?.pid !== c.p.id || t.n >= t.max) return;
    const x = clamp(+d?.x);
    const y = clamp(+d?.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    const s = { id: `${c.room.round}.${c.room.turnIdx}.${t.n++}`, pid: c.p.id, turn: c.room.turnIdx, pts: [x, y], hidden: t.invisible };
    t.cur = s;
    c.room.strokes.push(s);
    if (!s.hidden) socket.to(c.room.code).emit('stroke:start', s);
  });

  socket.on('stroke:pts', (d) => {
    const c = ctx();
    const t = c?.room.turn;
    const s = t?.cur;
    if (!c || c.room.phase !== 'draw' || t.pid !== c.p.id || !s) return;
    if (!Array.isArray(d?.pts) || d.pts.length > 600 || d.pts.length % 2) return;
    const out = [];
    for (let i = 0; i < d.pts.length; i += 2) {
      const x = clamp(+d.pts[i]);
      const y = clamp(+d.pts[i + 1]);
      if (!Number.isFinite(x) || !Number.isFinite(y)) return;
      const n = s.pts.length;
      const len = Math.hypot(x - s.pts[n - 2], (y - s.pts[n - 1]) * 0.75);
      if (t.used + len > t.budget * 1.08) break;
      t.used += len;
      s.pts.push(x, y);
      out.push(x, y);
    }
    if (out.length && !s.hidden) socket.to(c.room.code).emit('stroke:pts', { id: s.id, pts: out });
  });

  socket.on('twist', (d) => {
    const c = ctx();
    const tw = c?.room.twist;
    if (!c || c.room.phase !== 'twist' || !tw || tw.chosen || c.p.sitting || !tw.options.includes(d?.id)) return;
    tw.votes[c.p.id] = d.id;
    if (present(c.room).every((q) => q.id in tw.votes)) return resolveTwist(c.room);
    sync(c.room);
  });

  // Suspicion tap: toggle a raised eyebrow at another painter. The heat is public, the tapper is not.
  socket.on('sus', (d) => {
    const c = ctx();
    if (!c || c.room.phase !== 'draw' || c.p.sitting) return;
    const target = c.room.players.get(String(d?.target));
    if (!target || target.sitting || target.id === c.p.id) return;
    const set = c.room.sus.get(c.p.id) || new Set();
    set.has(target.id) ? set.delete(target.id) : set.add(target.id);
    c.room.sus.set(c.p.id, set);
    sync(c.room);
  });

  socket.on('turn:end', () => {
    const c = ctx();
    if (c && c.room.phase === 'draw' && c.room.turn?.pid === c.p.id) nextTurn(c.room);
  });

  socket.on('power', (_, ack) => {
    const c = ctx();
    if (!c) return;
    const error = usePower(c.room, c.p);
    if (typeof ack === 'function') ack(error ? { error } : { ok: true });
  });

  socket.on('vote', (d) => {
    const c = ctx();
    if (!c || c.room.phase !== 'vote' || c.p.sitting) return;
    const target = c.room.players.get(String(d?.target));
    if (!target || target.sitting || target.id === c.p.id) return;
    c.room.votes[c.p.id] = target.id;
    if (present(c.room).every((q) => q.id in c.room.votes)) return endVote(c.room);
    sync(c.room);
  });

  socket.on('steal', (d) => {
    const c = ctx();
    const r = c?.room.results;
    if (!c || c.room.phase !== 'verdict' || !r?.caught || r.steal || c.p.id !== r.forgerId) return;
    const guess = String(d?.word || '');
    if (!r.options.includes(guess)) return;
    r.steal = { guess, correct: guess === r.real };
    after(c.room, T.afterSteal, () => toAppraise(c.room));
    sync(c.room);
  });

  socket.on('appraise', (d) => {
    const c = ctx();
    if (!c || c.room.phase !== 'appraise' || c.p.sitting || c.p.id === c.room.forgerId) return;
    const marks = d?.marks | 0;
    if (marks < 0 || marks > 3) return;
    c.room.appraisal[c.p.id] = marks;
    const artists = present(c.room).filter((q) => q.id !== c.room.forgerId);
    if (artists.every((q) => q.id in c.room.appraisal)) return after(c.room, 900, () => toScores(c.room)), sync(c.room);
    sync(c.room);
  });

  socket.on('next', () => {
    const c = ctx();
    if (c && c.room.hostId === c.p.id) advance(c.room);
  });

  socket.on('again', () => {
    const c = ctx();
    if (!c || c.room.hostId !== c.p.id || c.room.phase !== 'final') return;
    c.room.phase = 'lobby';
    c.room.round = 0;
    c.room.strokes = [];
    c.room.results = null;
    c.room.twist = null;
    c.room.sus = new Map();
    for (const p of [...c.room.players.values()]) {
      if (!p.connected) c.room.players.delete(p.id);
      else Object.assign(p, { score: 0, streak: 0, gain: 0, sitting: false, power: null, intel: null });
    }
    syncStrokes(c.room);
    sync(c.room);
  });

  socket.on('react', (d) => {
    const c = ctx();
    const emoji = String(d?.emoji || '');
    if (!c || !['😂', '🤨', '😱', '👏', '🔥', '🤥'].includes(emoji)) return;
    const now = Date.now();
    if (now - (socket.data.lastReact || 0) < 250) return;
    socket.data.lastReact = now;
    io.to(c.room.code).emit('react', { pid: c.p.id, emoji });
  });

  const leave = () => {
    const c = ctx();
    if (!c || c.p.sid !== socket.id) return;
    socket.leave(c.room.code);
    socket.data.code = null;
    drop(c.room, c.p);
  };
  socket.on('leave', leave);
  socket.on('disconnect', leave);
});

http.listen(PORT, () => console.log(`Counterfeit server on http://localhost:${PORT}`));
