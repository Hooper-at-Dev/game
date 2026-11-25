import { useState } from 'react';
import { motion } from 'framer-motion';
import { socket } from '../net';
import { sfx } from '../sfx';
import Canvas from '../Canvas';
import { Brief, Face, Hud, PowerCard, Reactions, Stamp, TimeBar, spring } from '../bits';

export default function Vote({ s, me }) {
  const [focus, setFocus] = useState(null);
  const suspects = s.players.filter((p) => !p.sitting);
  const can = !s.you.sitting;

  return (
    <div className="table">
      <Hud s={s}>
        <TimeBar endsAt={s.endsAt} total={s.settings.voteSecs * 1000} />
      </Hud>

      <div className="easel">
        <div className="frame">
          <Canvas players={s.players} me={me.id} focus={focus} fat={s.rule === 'fat'} />
          <span className="tape tape-l" />
          <span className="tape tape-r" />
        </div>
        <p className="under hint-line">Hover a suspect to isolate their strokes. Anything new on the canvas? Invisible ink surfaces now.</p>
      </div>

      <aside className="side">
        <motion.h2 className="accuse-title" initial={{ scale: 0.6, rotate: -8, opacity: 0 }} animate={{ scale: 1, rotate: -2, opacity: 1 }} transition={spring}>
          Who’s the <em>forger?</em>
        </motion.h2>
        <div className="suspects">
          {suspects.map((p, i) => {
            const self = p.id === me.id;
            const picked = s.you.vote === p.id;
            return (
              <motion.button
                key={p.id}
                className={`accuse ${picked ? 'picked' : ''}`}
                disabled={self || !can}
                initial={{ opacity: 0, x: 40 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ ...spring, delay: i * 0.06 }}
                whileHover={self ? {} : { x: -4, rotate: -1 }}
                whileTap={self ? {} : { scale: 0.96 }}
                onPointerEnter={() => setFocus(p.id)}
                onPointerLeave={() => setFocus(null)}
                onClick={() => {
                  sfx.vote();
                  socket.emit('vote', { target: p.id });
                }}
              >
                <Face ink={p.ink} face={p.face} size={44} off={!p.connected} />
                <span className="accuse-name">
                  {p.name}
                  {self && <small>that’s you</small>}
                </span>
                {p.heat > 0 && <span className="heat-tag" title="Eyebrows raised during painting">🤨{p.heat}</span>}
                {p.voted && <span className="voted">voted</span>}
                {picked && (
                  <Stamp tone="red" rotate={-8} className="accuse-stamp">
                    accused
                  </Stamp>
                )}
              </motion.button>
            );
          })}
        </div>
        <Brief you={s.you} />
        <PowerCard s={s} mine={false} />
        <Reactions />
      </aside>
    </div>
  );
}
