// Plays full games with bots against a FAST server. Run: npm test
import { spawn } from 'node:child_process';
import { io } from 'socket.io-client';

const PORT = 4399;
const N = +process.argv[2] || 4;
const server = spawn(process.execPath, ['server/index.js'], { env: { ...process.env, PORT, FAST: '1' }, stdio: 'inherit' });
const fail = (m) => {
  console.error('FAIL:', m);
  server.kill();
  process.exit(1);
};
const watchdog = setTimeout(() => fail('timed out'), 90000);
await new Promise((r) => setTimeout(r, 900));

const seen = new Set();
const powersUsed = new Set();
let code;
let finals = 0;
let strokesSeen = 0;
let heatSeen = false;
const twists = new Set();

function bot(i) {
  const s = io(`http://localhost:${PORT}`, { transports: ['websocket'] });
  const pid = `bot-${i}`;
  let last = '';
  s.on('strokes', (a) => (strokesSeen = Math.max(strokesSeen, a.length)));
  s.on('state', (st) => {
    seen.add(st.phase);
    const me = st.you;
    const key = `${st.phase}:${st.round}:${st.turn?.idx}:${!!st.stealOptions}:${st.players.length}`;
    const fresh = key !== last;
    last = key;
    if (st.results && me.role === 'forger' && st.phase === 'verdict' && st.results.caught && st.results.real) fail('real subject leaked to forger');
    if (me.power && me.role !== 'forger') fail('an artist was dealt a power');
    if (st.phase === 'lobby' && i === 0 && st.players.length === N && fresh) s.emit('start');
    if (st.phase === 'twist' && !st.twist.chosen && fresh) s.emit('twist', { id: st.twist.options[i % 3] });
    if (st.twist?.chosen) {
      twists.add(st.twist.chosen);
      const total = Object.values(st.twist.counts).reduce((a, b) => a + b, 0);
      if (!st.twist.counts[st.twist.chosen] || total > N) fail('raffle picked a rule with no ticket');
    }
    if (st.phase === 'draw' && fresh && i === 1 && st.turn.idx === 0) s.emit('sus', { target: 'bot-0' });
    if (st.phase === 'draw' && st.players.find((p) => p.id === 'bot-0').heat) heatSeen = true;
    if (st.phase === 'draw' && st.turn.pid === pid && fresh) {
      if (me.power && !me.power.used) s.emit('power', null, (r) => r?.ok && powersUsed.add(me.power.id));
      s.emit('stroke:start', { x: 0.1 + i * 0.1, y: 0.2 });
      s.emit('stroke:pts', { pts: [0.3, 0.4, 0.5, 0.45, 0.6, 0.7] });
      s.emit('stroke:pts', { pts: [0.9, 0.9, 0.1, 0.1, 0.9, 0.9, 0.1, 0.1] }); // blows the ink budget; server must clip
      setTimeout(() => s.emit('turn:end'), 30);
    }
    if (st.phase === 'vote' && fresh) {
      if (me.power && !me.power.used) s.emit('power', null, (r) => r?.ok && powersUsed.add(me.power.id));
      const others = st.players.filter((p) => p.id !== pid);
      s.emit('vote', { target: others[(i + st.round) % others.length].id });
    }
    if (st.stealOptions && fresh) s.emit('steal', { word: st.stealOptions[0] });
    if (st.phase === 'appraise' && me.role === 'artist' && fresh) s.emit('appraise', { marks: i % 4 });
    if (st.phase === 'scores' && i === 0 && fresh) {
      const sum = st.players.reduce((a, p) => a + p.gain, 0);
      console.log(`round ${st.round}: caught=${st.results.caught} steal=${JSON.stringify(st.results.steal)} gains=${st.players.map((p) => p.gain)} sum=${sum}`);
      if (!st.results.real || !st.results.card) fail('scores missing data');
      s.emit('next');
    }
    if (st.phase === 'final' && i === 0 && fresh) {
      finals++;
      if (finals === 1) return s.emit('again'); // rematch path
    }
    if (st.phase === 'lobby' && finals === 1 && i === 0 && fresh) {
      if (st.players.some((p) => p.score)) fail('scores not reset on rematch');
      done();
    }
  });
  return new Promise((res) => s.emit('join', { pid, name: `Bot${i}`, face: i, code }, (r) => (r.error ? fail(r.error) : ((code = r.code), res(s)))));
}

const socks = [await bot(0)];
for (let i = 1; i < N; i++) socks.push(await bot(i));

// A 9th player must be turned away from a full room only; here just check a bad code.
const stray = io(`http://localhost:${PORT}`, { transports: ['websocket'] });
stray.emit('join', { pid: 'stray', name: 'x', code: 'QQQQ' }, (r) => !r.error && fail('joined a room that does not exist'));

function done() {
  for (const ph of ['lobby', 'deal', 'draw', 'vote', 'verdict', 'appraise', 'scores', 'final']) if (!seen.has(ph)) fail(`never saw phase ${ph}`);
  if (!strokesSeen) fail('no strokes synced');
  if (!seen.has('twist') || !twists.size) fail('house rule never chosen');
  if (!heatSeen) fail('suspicion tap never registered');
  console.log(`house rules seen: ${[...twists].join(', ')}`);
  console.log(`PASS · ${N} bots · phases ${[...seen].join(' → ')} · powers used: ${[...powersUsed].join(', ') || 'none'} · max strokes ${strokesSeen}`);
  clearTimeout(watchdog);
  socks.forEach((s) => s.close());
  stray.close();
  server.kill();
  process.exit(0);
}
