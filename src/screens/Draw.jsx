import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { socket } from '../net';
import { sfx } from '../sfx';
import Canvas from '../Canvas';
import { Brief, Btn, Face, Hud, INKS, PowerCard, Reactions, TimeBar, spring } from '../bits';
import { TWISTS } from '../../shared/twists.js';

export default function Draw({ s, me }) {
  const t = s.turn;
  const mine = t?.pid === me.id;
  const [used, setUsed] = useState(0);
  const [banner, setBanner] = useState(false);
  useEffect(() => {
    setUsed(0);
    if (!mine) return;
    setBanner(true);
    const x = setTimeout(() => setBanner(false), 1100);
    return () => clearTimeout(x);
  }, [t?.idx, mine]);

  if (!t) return null;
  const drawer = s.players.find((p) => p.id === t.pid);
  const n = s.order.length;
  const lap = Math.floor(t.idx / n) + 1;
  const left = Math.max(0, 1 - used / t.budget);
  const invisible = mine && s.you.power?.id === 'invisible' && s.you.power.used;
  const rule = s.rule && TWISTS[s.rule];
  const canSus = !s.you.sitting;

  return (
    <div className="table">
      <Hud s={s}>
        <TimeBar key={t.idx} endsAt={s.endsAt} total={t.secs * 1000} />
      </Hud>

      <div className="rail">
        <span className="label">
          Lap {lap}/{s.settings.laps}
        </span>
        {s.order.map((id, i) => {
          const p = s.players.find((x) => x.id === id);
          if (!p) return null;
          const on = id === t.pid;
          const self = id === me.id;
          const flagged = s.you.sus.includes(id);
          return (
            <motion.button
              key={id}
              className={`rail-item ${on ? 'on' : ''} ${flagged ? 'flagged' : ''}`}
              disabled={self || !canSus}
              whileTap={self ? {} : { scale: 0.88, rotate: -6 }}
              title={self ? 'That’s you' : flagged ? 'Drop your suspicion' : 'Raise an eyebrow'}
              onClick={() => {
                sfx.vote();
                socket.emit('sus', { target: id });
              }}
            >
              {on && <motion.span layoutId="rail-ring" className="rail-ring" style={{ borderColor: INKS[p.ink] }} transition={spring} />}
              <Face ink={p.ink} face={p.face} size={on ? 46 : 34} off={!p.connected} />
              <span className="rail-name">{self ? 'you' : p.name}</span>
              <span className="heat" title={`${p.heat} raised eyebrow${p.heat === 1 ? '' : 's'}`}>
                <i style={{ transform: `scaleX(${n > 1 ? p.heat / (n - 1) : 0})` }} />
              </span>
              <AnimatePresence>
                {p.heat > 0 && (
                  <motion.b
                    key={p.heat}
                    className="heat-n"
                    initial={{ scale: 2.2, rotate: -20 }}
                    animate={{ scale: 1, rotate: 0 }}
                    exit={{ scale: 0 }}
                    transition={spring}
                  >
                    🤨{p.heat}
                  </motion.b>
                )}
              </AnimatePresence>
              {i === (t.idx + 1) % n && !on && <em>next</em>}
            </motion.button>
          );
        })}
        <span className="label rail-hint">tap a painter to raise an eyebrow · everyone sees the heat, nobody sees who</span>
      </div>

      <div className="easel">
        <motion.div
          className="frame"
          animate={{ boxShadow: `8px 8px 0 ${INKS[drawer?.ink ?? 0]}`, rotate: mine ? 0 : -0.4 }}
          transition={spring}
        >
          <Canvas
            players={s.players}
            me={me.id}
            canDraw={mine}
            budget={t.budget}
            turnKey={t.idx}
            onInk={setUsed}
            tremor={mine && t.tremor}
            hidden={invisible}
            mirror={s.rule === 'mirror'}
            mono={s.rule === 'blackout'}
            fat={s.rule === 'fat'}
            maxStrokes={s.rule === 'oneline' ? 1 : 0}
            live
          />
          <AnimatePresence>
            {banner && (
              <motion.div
                className="your-turn"
                initial={{ x: '-110%', skewX: -12 }}
                animate={{ x: 0, skewX: -6 }}
                exit={{ x: '110%', skewX: -12 }}
                transition={{ type: 'spring', stiffness: 260, damping: 24 }}
                style={{ background: INKS[me.ink] }}
              >
                Your brush!
              </motion.div>
            )}
          </AnimatePresence>
          <span className="tape tape-l" />
          <span className="tape tape-r" />
          {rule && (
            <span className="rule-chip" title={rule.desc}>
              {rule.icon} {rule.name}
            </span>
          )}
        </motion.div>

        <div className="under">
          <AnimatePresence mode="wait">
            <motion.div key={t.idx} className="now" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
              <i style={{ background: INKS[drawer?.ink ?? 0] }} />
              {mine ? 'You are painting' : `${drawer?.name || 'Someone'} is painting`}
              {t.tremor && <b className="shaky"> · shaky hands!</b>}
              {invisible && <b> · invisible ink</b>}
            </motion.div>
          </AnimatePresence>
          {mine && (
            <>
              <div className={`tube ${left < 0.2 ? 'low' : ''}`} title="Ink left this turn">
                <i style={{ transform: `scaleX(${left})`, background: INKS[me.ink] }} />
                <span>{left <= 0 ? (s.rule === 'oneline' ? 'brush lifted' : 'out of ink') : 'ink'}</span>
              </div>
              <Btn tone="ink" className="btn-sm" onClick={() => socket.emit('turn:end')}>
                Done
              </Btn>
            </>
          )}
        </div>
      </div>

      <aside className="side">
        <Brief you={s.you} />
        <PowerCard s={s} mine={mine} />
        <Reactions />
      </aside>
    </div>
  );
}
