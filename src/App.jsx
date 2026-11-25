import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { clock, pid, socket } from './net';
import { sfx } from './sfx';
import { INKS, page } from './bits';
import Home from './screens/Home';
import Lobby from './screens/Lobby';
import Deal from './screens/Deal';
import Twist from './screens/Twist';
import Draw from './screens/Draw';
import Vote from './screens/Vote';
import Verdict from './screens/Verdict';
import Scores from './screens/Scores';
import Final from './screens/Final';

const urlRoom = () => (new URLSearchParams(location.search).get('room') || '').toUpperCase().slice(0, 4);

export default function App() {
  const [s, setS] = useState(null);
  const [err, setErr] = useState('');
  const [online, setOnline] = useState(true);
  const [toasts, setToasts] = useState([]);
  const [floats, setFloats] = useState([]);
  const [gallery, setGallery] = useState([]);
  const [muted, setMuted] = useState(sfx.muted);
  const [xp, setXp] = useState(+localStorage.cf_xp || 0);
  const joined = useRef(null);
  const prev = useRef({});

  const join = useCallback((d) => {
    sfx.unlock();
    localStorage.cf_name = d.name;
    localStorage.cf_face = d.face;
    socket.emit('join', { ...d, pid }, (r) => {
      if (r?.error) {
        setErr(r.error);
        joined.current = null;
        sessionStorage.removeItem('cf_room');
        return;
      }
      setErr('');
      joined.current = { name: d.name, face: d.face, code: r.code };
      sessionStorage.cf_room = r.code;
      history.replaceState(null, '', `?room=${r.code}`);
    });
  }, []);

  const leave = () => {
    socket.emit('leave');
    joined.current = null;
    sessionStorage.removeItem('cf_room');
    history.replaceState(null, '', location.pathname);
    setS(null);
  };

  useEffect(() => {
    const onState = (st) => {
      clock.offset = st.now - Date.now();
      setS(st);
    };
    const onToast = (t) => {
      const id = Math.random();
      if (t.kind === 'power') sfx.power();
      setToasts((a) => [...a.slice(-2), { ...t, id }]);
      setTimeout(() => setToasts((a) => a.filter((x) => x.id !== id)), 3600);
    };
    const onReact = (r) => {
      const id = Math.random();
      setFloats((a) => [...a.slice(-24), { ...r, id, x: 8 + Math.random() * 84, tilt: Math.random() * 40 - 20 }]);
      setTimeout(() => setFloats((a) => a.filter((x) => x.id !== id)), 2400);
    };
    const onConnect = () => {
      setOnline(true);
      if (joined.current) socket.emit('join', { ...joined.current, pid }, () => {});
    };
    const onDrop = () => setOnline(false);
    socket.on('state', onState);
    socket.on('toast', onToast);
    socket.on('react', onReact);
    socket.on('gallery', setGallery);
    socket.on('connect', onConnect);
    socket.on('disconnect', onDrop);
    // A reload mid-game drops you straight back into your seat.
    const code = urlRoom();
    if (code && sessionStorage.cf_room === code && localStorage.cf_name) {
      join({ code, name: localStorage.cf_name, face: +localStorage.cf_face || 0 });
    }
    return () => {
      socket.off('state', onState);
      socket.off('toast', onToast);
      socket.off('react', onReact);
      socket.off('gallery', setGallery);
      socket.off('connect', onConnect);
      socket.off('disconnect', onDrop);
    };
  }, [join]);

  // Sound cues and XP on transitions.
  useEffect(() => {
    if (!s) return;
    const p = prev.current;
    if (s.phase !== p.phase) {
      if (s.phase === 'deal') sfx.deal();
      if (s.phase === 'vote') sfx.vote();
      if (s.phase === 'final') sfx.win();
      if (s.phase === 'scores') {
        const key = `${s.code}:${s.round}`;
        const gain = s.players.find((x) => x.id === s.you.id)?.gain || 0;
        if (localStorage.cf_xp_last !== key) {
          localStorage.cf_xp_last = key;
          localStorage.cf_xp = (+localStorage.cf_xp || 0) + gain;
          setXp(+localStorage.cf_xp);
        }
      }
    }
    if (s.turn && s.turn.idx !== p.turn && s.turn.pid === s.you.id) {
      sfx.turn();
      navigator.vibrate?.(60);
    }
    if (s.players.length > (p.count || 0) && s.phase === 'lobby') sfx.pop();
    prev.current = { phase: s.phase, turn: s.turn?.idx, count: s.players.length };
  }, [s]);

  const me = s?.players.find((p) => p.id === s.you.id);
  let screen;
  let key = s?.phase || 'home';
  if (!s || !me) screen = <Home onJoin={join} error={err} initialCode={urlRoom()} xp={xp} />;
  else if (s.phase === 'lobby') screen = <Lobby s={s} me={me} onLeave={leave} xp={xp} />;
  else if (s.phase === 'deal') (screen = <Deal s={s} me={me} />), (key = `deal${s.round}`);
  else if (s.phase === 'twist') (screen = <Twist s={s} me={me} />), (key = `twist${s.round}`);
  else if (s.phase === 'draw') screen = <Draw s={s} me={me} />;
  else if (s.phase === 'vote') screen = <Vote s={s} me={me} />;
  else if (s.phase === 'verdict' || s.phase === 'appraise') (screen = <Verdict s={s} me={me} />), (key = 'verdict');
  else if (s.phase === 'scores') screen = <Scores s={s} me={me} xp={xp} />;
  else screen = <Final s={s} me={me} gallery={gallery} onLeave={leave} />;

  return (
    <>
      <div className="grain" />
      <button
        className="mute"
        title={muted ? 'Sound on' : 'Sound off'}
        onClick={() => {
          sfx.unlock();
          setMuted(sfx.toggle());
        }}
      >
        {muted ? '🔇' : '🔊'}
      </button>
      <AnimatePresence mode="wait">
        <motion.main key={key} className="screen" {...page}>
          {screen}
        </motion.main>
      </AnimatePresence>

      <div className="toasts">
        <AnimatePresence>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              layout
              className={`toast toast-${t.kind}`}
              initial={{ opacity: 0, y: -30, rotate: -3, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, rotate: 0, scale: 1 }}
              exit={{ opacity: 0, x: 60 }}
              transition={{ type: 'spring', stiffness: 400, damping: 24 }}
            >
              {t.text}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      <div className="floats">
        {floats.map((f) => {
          const who = s?.players.find((p) => p.id === f.pid);
          return (
            <motion.span
              key={f.id}
              style={{ left: `${f.x}%` }}
              initial={{ y: 0, opacity: 0, scale: 0.4, rotate: 0 }}
              animate={{ y: '-62vh', opacity: [0, 1, 1, 0], scale: [0.4, 1.5, 1.2, 1], rotate: f.tilt }}
              transition={{ duration: 2.3, ease: 'easeOut' }}
            >
              {f.emoji}
              {who && <i style={{ background: INKS[who.ink] }}>{who.name}</i>}
            </motion.span>
          );
        })}
      </div>

      <AnimatePresence>
        {!online && (
          <motion.div className="offline" initial={{ y: 60 }} animate={{ y: 0 }} exit={{ y: 60 }}>
            Connection lost. Reconnecting…
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
