import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Hud, TimeBar, spring } from '../bits';
import { sfx } from '../sfx';
import { POWERS } from '../../shared/powers.js';

export default function Deal({ s }) {
  const [flipped, setFlipped] = useState(false);
  const [opened, setOpened] = useState(false);
  const you = s.you;
  const forger = you.role === 'forger';
  const pw = you.power && POWERS[you.power.id];

  useEffect(() => {
    const a = setTimeout(() => {
      setFlipped(true);
      sfx.pop();
    }, 1100);
    // Opens silently: only the forger has an envelope, so a sound would be a tell.
    const b = setTimeout(() => setOpened(true), 3300);
    return () => (clearTimeout(a), clearTimeout(b));
  }, []);

  return (
    <div className="deal">
      <Hud s={s}>
        <TimeBar endsAt={s.endsAt} total={9000} />
      </Hud>
      <motion.h2 initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        {you.sitting ? 'You are watching this round.' : 'Eyes on your own screen.'}
      </motion.h2>

      {!you.sitting && (
        <div className="deal-cards">
          <motion.div
            className="flipper"
            initial={{ y: -400, rotate: -25 }}
            animate={{ y: 0, rotate: -3 }}
            transition={{ ...spring, stiffness: 180, damping: 17 }}
          >
            <motion.div className="flip-inner" animate={{ rotateY: flipped ? 180 : 0 }} transition={{ duration: 0.7, ease: [0.3, 1.4, 0.5, 1] }}>
              <div className="card card-back">
                <span>?</span>
              </div>
              <div className={`card card-front ${forger ? 'card-forger' : ''}`}>
                <span className="label">{forger ? 'You are' : 'You are an'}</span>
                <h3>{forger ? 'The Forger' : 'Artist'}</h3>
                <span className="label">{forger ? 'Smuggle this into the picture' : 'The commission is'}</span>
                <strong className="subject">{you.subject}</strong>
                <p>
                  {forger
                    ? 'Everyone else is painting something different. Blend in, bend the picture, and work out what they were asked for. Only you get a secret power.'
                    : 'Paint it clearly enough that fellow artists trust you, and vaguely enough that the forger cannot guess it. Careful: the forger is holding a secret power.'}
                </p>
              </div>
            </motion.div>
          </motion.div>

          {pw && (
            <motion.div
              className={`envelope rarity-${pw.rarity} ${opened ? 'open' : ''}`}
              initial={{ y: 400, rotate: 20, opacity: 0 }}
              animate={{ y: 0, rotate: 4, opacity: 1 }}
              transition={{ ...spring, stiffness: 180, damping: 17, delay: 1.8 }}
            >
              <span className="label">Forger’s edge · for your eyes only</span>
              {opened ? (
                <motion.div initial={{ scale: 0.3, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={spring}>
                  <motion.span className="power-icon big" animate={{ rotate: [0, -12, 12, 0] }} transition={{ delay: 0.3, duration: 0.6 }}>
                    {pw.icon}
                  </motion.span>
                  <strong>{pw.name}</strong>
                  <span className="rarity">{pw.rarity}</span>
                  <p>{pw.desc}</p>
                </motion.div>
              ) : (
                <motion.div className="seal" animate={{ scale: [1, 1.12, 1], rotate: [0, -6, 6, 0] }} transition={{ repeat: Infinity, duration: 0.9 }}>
                  ✦
                </motion.div>
              )}
            </motion.div>
          )}
        </div>
      )}
    </div>
  );
}
