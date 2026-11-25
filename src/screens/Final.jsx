import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { socket } from '../net';
import { Painting, savePng } from '../Canvas';
import { Btn, CountUp, Face, INKS, spring } from '../bits';

function Confetti() {
  const bits = useMemo(
    () =>
      Array.from({ length: 70 }, (_, i) => ({
        x: Math.random() * 100,
        d: 2.4 + Math.random() * 2.6,
        delay: Math.random() * 1.6,
        c: INKS[i % 8],
        r: Math.random() * 720 - 360,
        w: 6 + Math.random() * 10,
      })),
    [],
  );
  return (
    <div className="confetti">
      {bits.map((b, i) => (
        <motion.i
          key={i}
          style={{ left: `${b.x}%`, background: b.c, width: b.w, height: b.w * 0.45 }}
          initial={{ y: '-10vh', rotate: 0, opacity: 1 }}
          animate={{ y: '110vh', rotate: b.r, opacity: [1, 1, 0.6] }}
          transition={{ duration: b.d, delay: b.delay, ease: 'easeIn', repeat: 2 }}
        />
      ))}
    </div>
  );
}

export default function Final({ s, me, gallery, onLeave }) {
  const board = [...s.players].sort((a, b) => b.score - a.score);
  const top = board.slice(0, 3);
  const host = s.hostId === me.id;
  const place = board.findIndex((p) => p.id === me.id) + 1;
  const gap = place > 1 ? board[place - 2].score - me.score : 0;
  // Podium order: 2nd, 1st, 3rd.
  const podium = [top[1], top[0], top[2]].filter(Boolean);

  return (
    <div className="final">
      <Confetti />
      <span className="tag">Auction closed</span>
      <h2>
        {place === 1 ? (
          <>You are the <em>master forger.</em></>
        ) : (
          <>
            {top[0]?.name} takes it. <em>You were {gap} short of #{place - 1}.</em>
          </>
        )}
      </h2>

      <div className="podium">
        {podium.map((p) => {
          const rank = top.indexOf(p);
          return (
            <div key={p.id} className={`pod pod-${rank + 1}`}>
              <motion.div initial={{ y: -200, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ ...spring, delay: 1.1 - rank * 0.3 }}>
                <Face ink={p.ink} face={p.face} size={rank === 0 ? 96 : 70} />
                <strong>{p.name}</strong>
              </motion.div>
              <motion.div
                className="block"
                style={{ background: INKS[p.ink] }}
                initial={{ scaleY: 0 }}
                animate={{ scaleY: 1 }}
                transition={{ duration: 0.7, delay: 0.9 - rank * 0.3, ease: [0.2, 1.3, 0.4, 1] }}
              >
                <b>{rank + 1}</b>
                <span>
                  <CountUp to={p.score} delay={1200} />
                </span>
              </motion.div>
            </div>
          );
        })}
      </div>

      {board.length > 3 && (
        <div className="rest">
          {board.slice(3).map((p, i) => (
            <span key={p.id}>
              {i + 4}. {p.name} · {p.score}
            </span>
          ))}
        </div>
      )}

      <div className="final-actions">
        {host ? (
          <Btn tone="red" className="btn-lg" onClick={() => socket.emit('again')}>
            Same crew, new night
          </Btn>
        ) : (
          <p className="waiting">
            Waiting for the host to call a rematch<span className="dots" />
          </p>
        )}
        <button className="link" onClick={onLeave}>
          Leave studio
        </button>
      </div>

      <span className="tag">Tonight’s collection</span>
      <div className="gallery">
        {gallery.map((g, i) => (
          <motion.figure
            key={g.round}
            initial={{ opacity: 0, y: 50, rotate: 0 }}
            whileInView={{ opacity: 1, y: 0, rotate: [-1.6, 1.2, -0.8][i % 3] }}
            viewport={{ once: true }}
            whileHover={{ rotate: 0, scale: 1.03 }}
            transition={spring}
          >
            <div className="frame">
              <Painting item={g} />
            </div>
            <figcaption>
              <strong>
                No. {g.round} — “{g.real}”
              </strong>
              <span>
                Forged into “{g.fake}” by {g.forger}, who {g.caught ? 'got caught' : 'got away with it'}. Mixed media, {g.crew} hands.
              </span>
              <button className="link" onClick={() => savePng(g)}>
                Save as PNG ↓
              </button>
            </figcaption>
          </motion.figure>
        ))}
      </div>
    </div>
  );
}
