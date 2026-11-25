import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { socket } from '../net';
import { sfx } from '../sfx';
import { Btn, CountUp, Face, Hud, TimeBar, rankOf, spring, useNow } from '../bits';

// One line of post-mortem. Near-misses get called out because they sting, and stinging brings people back.
function epitaph(s, me) {
  const r = s.results;
  const mine = r.tally[r.forgerId] || 0;
  const rival = Math.max(0, ...Object.entries(r.tally).filter(([id]) => id !== r.forgerId).map(([, n]) => n));
  if (me.id === r.forgerId) {
    if (!mine) return 'Not one finger pointed at you. Flawless.';
    if (!r.caught && mine === rival) return 'A tied vote saved your skin. That close.';
    if (!r.caught) return 'They suspected. They just couldn’t agree.';
    if (mine - rival === 1) return 'One vote. That is all that sank you.';
    return r.steal?.correct ? 'Caught, and you still robbed them blind.' : 'Caught. The canvas remembers.';
  }
  if (s.you.sitting) return 'You watched. Next round you paint.';
  if (r.votes[me.id] === r.forgerId) return me.streak > 1 ? `${me.streak} forgers in a row. Nothing gets past you.` : 'You saw it. You called it.';
  if (!r.votes[me.id]) return 'You never voted. Silence helps the forger.';
  if (!r.caught && rival - mine <= 1) return 'One more vote and you’d have had them.';
  return 'You accused an innocent painter. Awkward.';
}

export default function Scores({ s, me, xp }) {
  const r = s.results;
  const host = s.hostId === me.id;
  const last = s.round >= s.settings.rounds;
  const lines = r.card?.[me.id] || [];
  const [settled, setSettled] = useState(false);
  const left = Math.ceil(Math.max(0, s.endsAt - useNow(250)) / 1000);
  const rank = rankOf(xp);

  useEffect(() => {
    const t = setTimeout(() => setSettled(true), 1500 + lines.length * 350);
    const coins = lines.map((_, i) => setTimeout(() => sfx.coin(), 500 + i * 350));
    return () => (clearTimeout(t), coins.forEach(clearTimeout));
  }, []);

  const board = [...s.players].sort((a, b) => (settled ? b.score - a.score : b.score - b.gain - (a.score - a.gain)));

  return (
    <div className="scores">
      <Hud s={s}>
        <TimeBar endsAt={s.endsAt} total={30000} />
      </Hud>

      <section className="receipt">
        <span className="tape" />
        <span className="label">Your take · lot {s.round}</span>
        <motion.h2 initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
          {epitaph(s, me)}
        </motion.h2>
        <ul>
          {lines.map(([label, pts], i) => (
            <motion.li key={label} initial={{ opacity: 0, x: -30 }} animate={{ opacity: 1, x: 0 }} transition={{ ...spring, delay: 0.5 + i * 0.35 }}>
              <span>{label}</span>
              <b>+{pts}</b>
            </motion.li>
          ))}
          {!lines.length && <li className="none"><span>Nothing this round</span><b>+0</b></li>}
        </ul>
        <div className="total">
          <span>Total</span>
          <b>
            +<CountUp to={me.gain} delay={500 + lines.length * 350} />
          </b>
        </div>
        <div className="xp">
          <motion.i initial={{ width: 0 }} animate={{ width: `${rank.pct * 100}%` }} transition={{ delay: 1.2, duration: 0.9, ease: 'easeOut' }} />
        </div>
        <span className="label xp-label">
          Lv.{rank.level} {rank.title}
          {rank.next ? ` · ${Math.round((1 - rank.pct) * 100)}% to ${rank.next}` : ''}
        </span>
      </section>

      <section className="board">
        <span className="tag">Standings</span>
        {board.map((p, i) => (
          <motion.div key={p.id} layout transition={spring} className={`board-row ${p.id === me.id ? 'me' : ''}`}>
            <span className="pos">{i + 1}</span>
            <Face ink={p.ink} face={p.face} size={38} off={!p.connected} />
            <span className="accuse-name">
              {p.name}
              {p.id === r.forgerId && <small>the forger</small>}
              {p.streak > 1 && <small className="flame">🔥 {p.streak} streak</small>}
            </span>
            {p.gain > 0 && (
              <motion.span className="gain" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.8 }}>
                +{p.gain}
              </motion.span>
            )}
            <b className="score">
              <CountUp from={p.score - p.gain} to={p.score} delay={900} />
            </b>
          </motion.div>
        ))}
        <div className="awards">
          {(r.awards || []).map((a, i) => {
            const p = s.players.find((x) => x.id === a.pid);
            return (
              <motion.div key={a.title} className="award" initial={{ scale: 0, rotate: -20 }} animate={{ scale: 1, rotate: [-3, 2, -2][i % 3] }} transition={{ ...spring, delay: 1.8 + i * 0.25 }}>
                <b>{a.title}</b>
                <span>
                  {p?.name} · {a.blurb}
                </span>
              </motion.div>
            );
          })}
        </div>
        <div className="next">
          {host ? (
            <Btn tone="red" className="btn-lg" onClick={() => socket.emit('next')}>
              {last ? 'Open the gallery' : 'Next commission'} · {left}
            </Btn>
          ) : (
            <p className="waiting">
              {last ? 'Gallery opens' : 'Next commission'} in {left}s<span className="dots" />
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
