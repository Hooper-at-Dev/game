import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { socket } from '../net';
import { Btn, Face, INK_NAMES, rankOf, spring } from '../bits';

const OPTS = [
  ['rounds', 'Rounds', [3, 5, 7], (v) => v],
  ['laps', 'Laps per round', [2, 3], (v) => v],
  ['turnSecs', 'Time per turn', [8, 12, 16, 20], (v) => `${v}s`],
  ['voteSecs', 'Accusation time', [20, 40, 60], (v) => `${v}s`],
  ['ink', 'Ink per turn', [0.6, 1, 1.5], (v) => ({ 0.6: 'Scarce', 1: 'Normal', 1.5: 'Lavish' })[v]],
  ['rules', 'House rule', ['vote', 'random', 'off'], (v) => ({ vote: 'Vote', random: 'Random', off: 'Off' })[v]],
];

export default function Lobby({ s, me, onLeave, xp }) {
  const [copied, setCopied] = useState(false);
  const host = s.hostId === me.id;
  const link = `${location.origin}/?room=${s.code}`;
  const need = Math.max(0, 3 - s.players.length);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
    } catch {
      window.prompt('Copy this link and send it to your friends:', link);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div className="lobby">
      <header className="lobby-head">
        <div>
          <span className="tag">The line-up</span>
          <h2>
            Round up the <em>usual suspects.</em>
          </h2>
        </div>
        <div className="invite">
          <span className="label">Studio code</span>
          <div className="code">
            {s.code.split('').map((c, i) => (
              <motion.b key={i} initial={{ y: -40, rotate: -20, opacity: 0 }} animate={{ y: 0, rotate: [-3, 2, -2, 3][i], opacity: 1 }} transition={{ ...spring, delay: i * 0.07 }}>
                {c}
              </motion.b>
            ))}
          </div>
          <Btn tone={copied ? 'green' : 'yellow'} onClick={copy} className="btn-sm">
            {copied ? 'Link copied ✓' : 'Copy invite link'}
          </Btn>
        </div>
      </header>

      <div className="wall">
        {[6, 5, 4, 3].map((n) => (
          <span key={n} className="height" style={{ bottom: `${(n - 3) * 25 + 12}%` }}>
            {n}′0″
          </span>
        ))}
        <div className="lineup">
          <AnimatePresence>
            {s.players.map((p, i) => (
              <motion.div
                key={p.id}
                layout
                className="suspect"
                initial={{ y: 120, opacity: 0, rotate: -12 }}
                animate={{ y: 0, opacity: 1, rotate: 0 }}
                exit={{ y: 120, opacity: 0, rotate: 12 }}
                transition={spring}
              >
                <motion.div animate={{ y: [0, -5, 0] }} transition={{ repeat: Infinity, duration: 2.4 + (i % 3) * 0.5, ease: 'easeInOut' }}>
                  <Face ink={p.ink} face={p.face} size={92} />
                </motion.div>
                <div className="placard">
                  <strong>{p.name}</strong>
                  <span>
                    {INK_NAMES[p.ink]}
                    {p.id === s.hostId ? ' · host' : ''}
                    {p.id === me.id ? ' · you' : ''}
                  </span>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
          {Array.from({ length: need }, (_, i) => (
            <div key={i} className="suspect empty">
              <div className="silhouette">?</div>
              <div className="placard">
                <strong>Wanted</strong>
                <span>send the link</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <footer className="lobby-foot">
        <div className="opts">
          {OPTS.map(([key, label, vals, fmt]) => (
            <div key={key} className="opt">
              <span className="label">{label}</span>
              <div className="seg">
                {vals.map((v) => (
                  <button key={v} disabled={!host} className={s.settings[key] === v ? 'on' : ''} onClick={() => socket.emit('settings', { [key]: v })}>
                    {fmt(v)}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="lobby-go">
          {host ? (
            <Btn tone="red" className="btn-lg" disabled={need > 0} onClick={() => socket.emit('start')}>
              {need > 0 ? `Need ${need} more painter${need > 1 ? 's' : ''}` : 'Deal the commissions'}
            </Btn>
          ) : (
            <p className="waiting">
              Waiting for the host to deal<span className="dots" />
            </p>
          )}
          <button className="link" onClick={onLeave}>
            Leave studio · you are a Lv.{rankOf(xp).level} {rankOf(xp).title}
          </button>
        </div>
      </footer>
    </div>
  );
}
