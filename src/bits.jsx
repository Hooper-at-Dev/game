import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { serverNow, socket } from './net';
import { sfx } from './sfx';
import { POWERS } from '../shared/powers.js';

export const INKS = ['#E5391B', '#2440D6', '#1E7A4C', '#E39A00', '#8B2FC9', '#0B93A1', '#E0457B', '#6B4A2B'];
export const INK_NAMES = ['Vermilion', 'Cobalt', 'Viridian', 'Ochre', 'Violet', 'Teal', 'Rose', 'Umber'];

export const RANKS = [
  [0, 'Doodler'],
  [300, 'Apprentice'],
  [900, 'Copyist'],
  [2000, 'Con Artist'],
  [4000, 'Master Forger'],
  [8000, 'Legend of the Louvre'],
];
export function rankOf(xp) {
  let i = 0;
  while (i < RANKS.length - 1 && xp >= RANKS[i + 1][0]) i++;
  const next = RANKS[i + 1];
  return { title: RANKS[i][1], next: next?.[1], pct: next ? (xp - RANKS[i][0]) / (next[0] - RANKS[i][0]) : 1, level: i + 1 };
}

export const spring = { type: 'spring', stiffness: 420, damping: 26 };
export const page = {
  initial: { opacity: 0, y: 24, filter: 'blur(6px)' },
  animate: { opacity: 1, y: 0, filter: 'blur(0px)', transition: { duration: 0.45, ease: [0.2, 0.8, 0.2, 1] } },
  exit: { opacity: 0, y: -18, filter: 'blur(6px)', transition: { duration: 0.22 } },
};

export function useNow(ms = 100) {
  const [, tick] = useState(0);
  useEffect(() => {
    const i = setInterval(() => tick((n) => n + 1), ms);
    return () => clearInterval(i);
  }, [ms]);
  return serverNow();
}

const EYES = [
  <g key="0"><circle cx="17" cy="21" r="3.2" /><circle cx="31" cy="21" r="3.2" /></g>,
  <g key="1"><rect x="12" y="19" width="9" height="3.4" rx="1.7" /><rect x="27" y="19" width="9" height="3.4" rx="1.7" /></g>,
  <g key="2"><circle cx="17" cy="21" r="5" fill="#FBF6EA" /><circle cx="31" cy="21" r="5" fill="#FBF6EA" /><circle cx="18.5" cy="21.5" r="2.2" /><circle cx="32.5" cy="21.5" r="2.2" /></g>,
  <g key="3"><path d="M12 22q5-6 10 0" fill="none" strokeWidth="3" stroke="#17130F" strokeLinecap="round" /><path d="M26 22q5-6 10 0" fill="none" strokeWidth="3" stroke="#17130F" strokeLinecap="round" /></g>,
  <g key="4"><circle cx="17" cy="21" r="3.2" /><path d="M27 18l8 5" strokeWidth="3" stroke="#17130F" strokeLinecap="round" /></g>,
  <g key="5"><rect x="10" y="16" width="28" height="9" rx="4.5" /><circle cx="18" cy="20.5" r="2" fill="#FBF6EA" /><circle cx="31" cy="20.5" r="2" fill="#FBF6EA" /></g>,
  <g key="6"><path d="M13 18l7 3-7 3M35 18l-7 3 7 3" fill="none" strokeWidth="3" stroke="#17130F" strokeLinecap="round" strokeLinejoin="round" /></g>,
  <g key="7"><circle cx="24" cy="20" r="7.5" fill="#FBF6EA" /><circle cx="24" cy="21" r="3.4" /></g>,
];
const MOUTHS = [
  'M17 31q7 6 14 0',
  'M18 33h12',
  'M19 34q5-5 10 0',
  'M17 31q7 8 14 0z',
  'M18 32q3 3 6 0t6 0',
  'M20 32h10',
  'M21 33a3 3 0 106 0 3 3 0 10-6 0',
  'M17 33q7-2 14 2',
];

export function Face({ ink = 0, face = 0, size = 48, off }) {
  return (
    <svg className="face" viewBox="0 0 48 48" width={size} height={size} style={{ opacity: off ? 0.35 : 1 }}>
      <path
        d="M24 3c10 0 21 4 21 20 0 15-9 22-21 22S3 39 3 24C3 8 13 3 24 3z"
        fill={INKS[ink]}
        stroke="#17130F"
        strokeWidth="2.6"
      />
      <g fill="#17130F">{EYES[face % 8]}</g>
      <path d={MOUTHS[face % 8]} fill={face % 8 === 3 ? '#17130F' : 'none'} stroke="#17130F" strokeWidth="2.6" strokeLinecap="round" />
    </svg>
  );
}

export function Btn({ children, tone = 'ink', className = '', onClick, ...rest }) {
  return (
    <motion.button
      className={`btn btn-${tone} ${className}`}
      whileHover={{ y: -2 }}
      whileTap={{ x: 4, y: 4, boxShadow: '0px 0px 0 #17130F' }}
      transition={{ type: 'spring', stiffness: 600, damping: 22 }}
      onClick={(e) => {
        sfx.click();
        onClick?.(e);
      }}
      {...rest}
    >
      {children}
    </motion.button>
  );
}

// Draining bar that turns red and shivers in the last few seconds.
export function TimeBar({ endsAt, total }) {
  const left = Math.max(0, endsAt - useNow(80));
  const pct = Math.min(1, left / total);
  const hot = left < 5000;
  return (
    <div className={`timebar ${hot ? 'hot' : ''}`}>
      <i style={{ transform: `scaleX(${pct})` }} />
      <b>{Math.ceil(left / 1000)}</b>
    </div>
  );
}

export function CountUp({ to, from = 0, dur = 900, delay = 0 }) {
  const [v, setV] = useState(from);
  useEffect(() => {
    let raf;
    const t0 = performance.now() + delay;
    const step = (t) => {
      const k = Math.max(0, Math.min(1, (t - t0) / dur));
      setV(Math.round(from + (to - from) * (1 - (1 - k) ** 3)));
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [to, from, dur, delay]);
  return <>{v}</>;
}

export function Stamp({ children, tone = 'red', rotate = -9, delay = 0, className = '' }) {
  return (
    <motion.span
      className={`stamp stamp-${tone} ${className}`}
      initial={{ scale: 3.2, opacity: 0, rotate: rotate - 14 }}
      animate={{ scale: 1, opacity: 1, rotate }}
      transition={{ type: 'spring', stiffness: 500, damping: 17, delay }}
    >
      {children}
    </motion.span>
  );
}

export function Hud({ s, children }) {
  return (
    <header className="hud">
      <span className="tag">
        Lot {String(s.round).padStart(2, '0')}
        <em> / {String(s.settings.rounds).padStart(2, '0')}</em>
      </span>
      <div className="hud-mid">{children}</div>
      <span className="tag tag-ghost">Studio {s.code}</span>
    </header>
  );
}

// The private brief: what you are (secretly) painting. Tap to cover it from wandering eyes.
export function Brief({ you }) {
  const [open, setOpen] = useState(true);
  if (!you.role) return <div className="brief brief-wait">You joined mid-round. Watch this one — you paint in the next.</div>;
  const forger = you.role === 'forger';
  return (
    <button className={`brief ${forger ? 'brief-forger' : ''}`} onClick={() => setOpen((o) => !o)}>
      <span className="label">{forger ? 'You are the forger · sneak in' : 'Your commission'}</span>
      <motion.strong animate={{ filter: open ? 'blur(0px)' : 'blur(14px)' }}>{you.subject}</motion.strong>
      <span className="hint">{open ? 'tap to hide' : 'tap to peek'}</span>
    </button>
  );
}

export function PowerCard({ s, mine }) {
  const pw = s.you.power;
  const [err, setErr] = useState('');
  const t = useRef();
  if (!pw) return null;
  const info = POWERS[pw.id];
  const ready =
    !pw.used &&
    ({ overflow: mine, invisible: mine, turps: s.phase === 'draw', tremor: s.phase === 'draw', alibi: true, gavel: s.phase === 'vote' }[pw.id] ?? false);
  const use = () => {
    socket.emit('power', null, (r) => {
      if (r?.error) {
        setErr(r.error);
        clearTimeout(t.current);
        t.current = setTimeout(() => setErr(''), 2200);
      }
      // No sound here: a chime from one phone would give the forger away.
    });
  };
  return (
    <div className={`power rarity-${info.rarity} ${pw.used ? 'spent' : ''} ${ready ? 'ready' : ''}`}>
      <span className="label">Forger’s power · {info.rarity}</span>
      <div className="power-row">
        <span className="power-icon">{info.icon}</span>
        <div>
          <strong>{info.name}</strong>
          <p>{info.desc}</p>
        </div>
      </div>
      {s.you.intel && (
        <motion.p className="intel" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
          {s.you.intel}
        </motion.p>
      )}
      {pw.used ? (
        <Stamp tone="ink" rotate={-6} className="power-spent">
          spent
        </Stamp>
      ) : (
        <Btn tone={ready ? 'yellow' : 'ghost'} disabled={!ready} onClick={use} className="btn-sm">
          {err || (ready ? 'Use it' : info.when)}
        </Btn>
      )}
    </div>
  );
}

const EMOJI = ['😂', '🤨', '😱', '👏', '🔥', '🤥'];
export function Reactions() {
  return (
    <div className="reactions">
      {EMOJI.map((e) => (
        <motion.button key={e} whileTap={{ scale: 1.5, rotate: -12 }} onClick={() => socket.emit('react', { emoji: e })}>
          {e}
        </motion.button>
      ))}
    </div>
  );
}
