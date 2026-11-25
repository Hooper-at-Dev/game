import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Btn, Face, INKS, rankOf, spring } from '../bits';

// The "o" in the wordmark is an eye that follows you around. Someone is always watching.
function Eye() {
  const ref = useRef();
  const [o, setO] = useState({ x: 0, y: 0 });
  useEffect(() => {
    const f = (e) => {
      const b = ref.current.getBoundingClientRect();
      const dx = e.clientX - (b.left + b.width / 2);
      const dy = e.clientY - (b.top + b.height / 2);
      const a = Math.atan2(dy, dx);
      const m = Math.min(1, Math.hypot(dx, dy) / 240);
      setO({ x: Math.cos(a) * m * 62, y: Math.sin(a) * m * 62 });
    };
    window.addEventListener('pointermove', f);
    return () => window.removeEventListener('pointermove', f);
  }, []);
  return (
    <span className="eye" ref={ref}>
      <motion.i animate={{ x: `${o.x}%`, y: `${o.y}%` }} transition={{ type: 'spring', stiffness: 300, damping: 20 }} />
    </span>
  );
}

const SCRIBBLES = [
  { d: 'M10 80 Q 60 10 110 70 T 210 60 T 300 90', c: 0, s: { top: '9%', left: '-2%', width: 340 } },
  { d: 'M20 20 C 80 120 140 -40 200 60 S 300 100 330 30', c: 1, s: { bottom: '8%', right: '-3%', width: 380 } },
  { d: 'M40 60 a30 30 0 1 0 60 0 a30 30 0 1 0 -60 0 M130 60 l60 -40 M130 60 l60 40', c: 3, s: { top: '14%', right: '6%', width: 220 } },
  { d: 'M10 50 l30 -30 l30 30 l30 -30 l30 30 l30 -30 l30 30', c: 2, s: { bottom: '14%', left: '5%', width: 240 } },
];

const STEPS = [
  ['01', 'Everyone gets the same secret subject', 'and takes turns adding strokes to one shared canvas.'],
  ['02', 'Except one of you', 'The forger was handed something else, and is quietly bending the picture toward it.'],
  ['03', 'Then you point fingers', 'Unmask the forger, or be the forger and walk out clean.'],
];

export default function Home({ onJoin, error, initialCode, xp }) {
  const [name, setName] = useState(localStorage.cf_name || '');
  const [face, setFace] = useState(+localStorage.cf_face || 0);
  const [code, setCode] = useState(initialCode || '');
  const [joining, setJoining] = useState(!!initialCode);
  const rank = rankOf(xp);
  const ok = name.trim().length > 0 && (!joining || code.length === 4);
  const go = () => ok && onJoin({ name: name.trim(), face, code: joining ? code : '' });

  return (
    <div className="home">
      {SCRIBBLES.map((sc, i) => (
        <svg key={i} className="scribble" viewBox="0 0 340 120" style={sc.s}>
          <motion.path
            d={sc.d}
            stroke={INKS[sc.c]}
            initial={{ pathLength: 0 }}
            animate={{ pathLength: [0, 1, 1, 0] }}
            transition={{ duration: 7, times: [0, 0.4, 0.8, 1], repeat: Infinity, delay: i * 1.3, ease: 'easeInOut' }}
          />
        </svg>
      ))}

      <section className="hero">
        <motion.span className="tag" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.5 }}>
          A drawing game for 3–8 liars
        </motion.span>
        <h1 className="wordmark" aria-label="Counterfeit">
          {'Counterfeit'.split('').map((ch, i) => (
            <motion.span
              key={i}
              className={i === 7 ? 'flip' : ''}
              initial={{ y: 90, opacity: 0, rotate: i % 2 ? 14 : -14 }}
              animate={{ y: 0, opacity: 1, rotate: 0 }}
              transition={{ ...spring, delay: 0.05 * i }}
            >
              {i === 1 ? <Eye /> : ch}
            </motion.span>
          ))}
        </h1>
        <motion.p className="lede" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.7 }}>
          Everyone paints the same thing. <em>One of you is lying.</em>
        </motion.p>
        <div className="steps">
          {STEPS.map(([n, t, d], i) => (
            <motion.div
              key={n}
              className="step"
              initial={{ opacity: 0, y: 30, rotate: 0 }}
              animate={{ opacity: 1, y: 0, rotate: [-1.5, 1, -0.5][i] }}
              transition={{ ...spring, delay: 0.85 + i * 0.12 }}
            >
              <b>{n}</b>
              <strong>{t}</strong>
              <p>{d}</p>
            </motion.div>
          ))}
        </div>
      </section>

      <motion.section
        className="dossier"
        initial={{ opacity: 0, y: 60, rotate: 6 }}
        animate={{ opacity: 1, y: 0, rotate: 1.4 }}
        transition={{ ...spring, delay: 0.35 }}
      >
        <span className="tape" />
        <div className="dossier-head">
          <span className="label">Suspect file</span>
          <span className="label">
            Lv.{rank.level} {rank.title}
          </span>
        </div>
        <div className="mug">
          <motion.div key={face} initial={{ scale: 0.6, rotate: -20 }} animate={{ scale: 1, rotate: 0 }} transition={spring}>
            <Face ink={face % 8} face={face} size={104} />
          </motion.div>
          <div className="faces">
            {Array.from({ length: 8 }, (_, i) => (
              <button key={i} className={i === face ? 'on' : ''} onClick={() => setFace(i)} aria-label={`Face ${i + 1}`}>
                <Face ink={i} face={i} size={30} />
              </button>
            ))}
          </div>
        </div>
        <label className="field">
          <span className="label">Alias</span>
          <input
            value={name}
            maxLength={14}
            placeholder="who are you tonight?"
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && go()}
            autoFocus
          />
        </label>
        {joining && (
          <motion.label className="field" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}>
            <span className="label">Studio code</span>
            <input
              className="code-input"
              value={code}
              maxLength={4}
              placeholder="ABCD"
              onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z]/g, ''))}
              onKeyDown={(e) => e.key === 'Enter' && go()}
            />
          </motion.label>
        )}
        {error && (
          <motion.p className="error" initial={{ x: -8 }} animate={{ x: [8, -6, 4, 0] }}>
            {error}
          </motion.p>
        )}
        <Btn tone="red" disabled={!ok} onClick={go} className="btn-lg">
          {joining ? 'Enter the studio' : 'Open a studio'}
        </Btn>
        <button className="link" onClick={() => setJoining((j) => !j)}>
          {joining ? '← or start your own studio' : 'Got a code from a friend? Join instead →'}
        </button>
        <div className="xp">
          <i style={{ width: `${rank.pct * 100}%` }} />
        </div>
        <span className="label xp-label">{rank.next ? `${xp} xp · next rank: ${rank.next}` : `${xp} xp · top rank`}</span>
      </motion.section>
    </div>
  );
}
