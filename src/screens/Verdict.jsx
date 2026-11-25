import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { socket } from '../net';
import { sfx } from '../sfx';
import Canvas from '../Canvas';
import { Btn, Face, Hud, Stamp, TimeBar, spring } from '../bits';

const MARKS = ['Not a trace', 'A hint of it', 'Plenty', 'Blatant'];

export default function Verdict({ s, me }) {
  const r = s.results;
  const late = s.phase === 'appraise';
  // 0 hush · 1 votes land · 2 spotlight roulette · 3 unmasked · 4 aftermath
  const [step, setStep] = useState(late ? 4 : 0);
  const [spot, setSpot] = useState(late ? r.forgerId : null);
  const suspects = s.players.filter((p) => !p.sitting);
  const forger = s.players.find((p) => p.id === r.forgerId);
  const iAmForger = me.id === r.forgerId;

  useEffect(() => {
    if (late) return;
    const a = setTimeout(() => setStep(1), 900);
    const b = setTimeout(() => setStep(2), 3300);
    return () => (clearTimeout(a), clearTimeout(b));
  }, []);

  useEffect(() => {
    if (late) (setStep(4), setSpot(r.forgerId));
  }, [late]);

  useEffect(() => {
    if (step !== 2) return;
    const ids = suspects.map((p) => p.id);
    const end = Date.now() + 2400;
    let i = 0;
    let d = 70;
    let timer;
    const tick = () => {
      if (Date.now() > end && ids[i % ids.length] === r.forgerId) {
        setStep(3);
        sfx.stamp();
        navigator.vibrate?.([40, 30, 120]);
        timer = setTimeout(() => {
          setStep(4);
          (r.caught ? !iAmForger : iAmForger) ? sfx.win() : sfx.lose();
        }, 1700);
        return;
      }
      i++;
      setSpot(ids[i % ids.length]);
      sfx.tick();
      d = Math.min(d * 1.14, 360);
      timer = setTimeout(tick, d);
    };
    tick();
    return () => clearTimeout(timer);
  }, [step]);

  const unmasked = step >= 3;
  const rate = (marks) => {
    sfx.coin();
    socket.emit('appraise', { marks });
  };

  return (
    <div className="table verdict">
      <Hud s={s}>
        <TimeBar key={s.phase + !!r.steal} endsAt={s.endsAt} total={late ? 16000 : r.caught ? 30000 : 13000} />
      </Hud>

      <div className="easel">
        <div className="frame">
          <Canvas players={s.players} me={me.id} focus={unmasked ? r.forgerId : null} fat={s.rule === 'fat'} />
          <span className="tape tape-l" />
          <span className="tape tape-r" />
        </div>
        <AnimatePresence>
          {step >= 4 && (
            <motion.div className="placards" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
              <div className="plaque">
                <span className="label">The commission</span>
                <strong>{r.real || '? ? ?'}</strong>
              </div>
              <div className="plaque plaque-fake">
                <span className="label">The forgery</span>
                <strong>{r.fake}</strong>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <aside className="side">
        <AnimatePresence mode="wait">
          <motion.h2
            key={unmasked ? 'out' : step}
            className="verdict-title"
            initial={{ opacity: 0, y: 18, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -18 }}
            transition={spring}
          >
            {unmasked ? (
              r.caught ? (
                <>Caught <em>red-handed.</em></>
              ) : (
                <>The forger <em>walks.</em></>
              )
            ) : step === 2 ? (
              'And the forger is…'
            ) : (
              'The votes are in.'
            )}
          </motion.h2>
        </AnimatePresence>

        <div className="tally">
          {suspects.map((p) => {
            const voters = Object.entries(r.votes).filter(([, target]) => target === p.id);
            const isForger = unmasked && p.id === r.forgerId;
            return (
              <motion.div
                key={p.id}
                className={`tally-row ${spot === p.id && step >= 2 ? 'lit' : ''} ${isForger ? 'is-forger' : ''}`}
                animate={isForger ? { scale: [1, 1.08, 1.03], rotate: [0, -2, 1, 0] } : { scale: 1 }}
              >
                <Face ink={p.ink} face={p.face} size={40} />
                <span className="accuse-name">{p.name}</span>
                <div className="tokens">
                  {step >= 1 &&
                    voters.map(([voter], i) => {
                      const v = s.players.find((x) => x.id === voter);
                      return (
                        <motion.span
                          key={voter}
                          className={r.gavels.includes(voter) ? 'heavy' : ''}
                          initial={{ y: -90, opacity: 0, rotate: -90 }}
                          animate={{ y: 0, opacity: 1, rotate: 0 }}
                          transition={{ ...spring, delay: 0.25 + i * 0.22 }}
                          title={v?.name}
                        >
                          <Face ink={v?.ink} face={v?.face} size={24} />
                          {r.gavels.includes(voter) && <b>×2</b>}
                        </motion.span>
                      );
                    })}
                </div>
                {isForger && (
                  <Stamp tone="red" rotate={-10} className="tally-stamp">
                    forger
                  </Stamp>
                )}
              </motion.div>
            );
          })}
        </div>

        <AnimatePresence>
          {step >= 4 && (
            <motion.div className="aftermath" initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={spring}>
              <p className="was">
                <b>{iAmForger ? 'You were' : `${forger?.name} was`}</b> secretly painting <mark>{r.fake}</mark>
              </p>

              {s.phase === 'verdict' && r.caught && !r.steal && (
                s.stealOptions ? (
                  <div className="steal">
                    <span className="label">Last chance · name the real commission to steal the round</span>
                    <div className="steal-grid">
                      {s.stealOptions.map((w, i) => (
                        <motion.div key={w} initial={{ opacity: 0, scale: 0.7 }} animate={{ opacity: 1, scale: 1 }} transition={{ ...spring, delay: i * 0.06 }}>
                          <Btn tone="paper" className="btn-sm" onClick={() => socket.emit('steal', { word: w })}>
                            {w}
                          </Btn>
                        </motion.div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="waiting">
                    {forger?.name} gets one guess at your commission<span className="dots" />
                  </p>
                )
              )}

              {r.steal && (
                <motion.div className={`steal-result ${r.steal.correct ? 'bad' : 'good'}`} initial={{ scale: 0.6, rotate: -6 }} animate={{ scale: 1, rotate: -1.5 }} transition={spring}>
                  {r.steal.correct ? (
                    <>They guessed <b>{r.steal.guess}</b>. The round is stolen.</>
                  ) : (
                    <>They guessed <b>{r.steal.guess}</b>. Wrong. The commission stays secret.</>
                  )}
                </motion.div>
              )}

              {late &&
                (iAmForger || s.you.sitting ? (
                  <p className="waiting">
                    The artists are appraising the damage<span className="dots" />
                  </p>
                ) : s.you.rating != null ? (
                  <Stamp tone="green" rotate={-4}>
                    appraisal filed
                  </Stamp>
                ) : (
                  <div className="appraise">
                    <span className="label">Be honest · how much {r.fake} made it onto the canvas?</span>
                    <div className="appraise-grid">
                      {MARKS.map((m, i) => (
                        <Btn key={m} tone={['paper', 'yellow', 'yellow', 'red'][i]} className="btn-sm" onClick={() => rate(i)}>
                          {m}
                        </Btn>
                      ))}
                    </div>
                  </div>
                ))}
            </motion.div>
          )}
        </AnimatePresence>
      </aside>
    </div>
  );
}
