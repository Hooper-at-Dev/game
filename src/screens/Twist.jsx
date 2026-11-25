import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { socket } from '../net';
import { sfx } from '../sfx';
import { Hud, Stamp, TimeBar, spring } from '../bits';
import { TWISTS } from '../../shared/twists.js';

// House-rule pick. While `chosen` is empty everyone votes anonymously; once the
// server draws a winner (a raffle: one ticket per vote), a spotlight spins and lands on it.
export default function Twist({ s }) {
  const tw = s.twist;
  const voting = !tw.chosen;
  const byVote = s.settings.rules === 'vote';
  const [spot, setSpot] = useState(null);
  const [landed, setLanded] = useState(false);

  useEffect(() => {
    if (!tw.chosen) return;
    const end = Date.now() + 1500;
    let i = 0;
    let d = 80;
    let timer;
    const tick = () => {
      if (Date.now() > end && tw.options[i % 3] === tw.chosen) {
        setLanded(true);
        sfx.stamp();
        return;
      }
      i++;
      setSpot(tw.options[i % 3]);
      sfx.tick();
      d = Math.min(d * 1.16, 300);
      timer = setTimeout(tick, d);
    };
    tick();
    return () => clearTimeout(timer);
  }, [tw.chosen]);

  const voters = s.players.filter((p) => !p.sitting && p.connected).length;

  return (
    <div className="deal twist">
      <Hud s={s}>
        <TimeBar key={voting} endsAt={s.endsAt} total={voting ? 9000 : 4200} />
      </Hud>
      <span className="tag">House rule</span>
      <motion.h2 key={voting ? 'v' : landed ? 'l' : 's'} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
        {voting ? (
          <>Pick tonight’s <em>house rule.</em></>
        ) : landed ? (
          <>{TWISTS[tw.chosen].name}. <em>Deal with it.</em></>
        ) : byVote ? (
          'Drawing a ticket…'
        ) : (
          'The house decides…'
        )}
      </motion.h2>
      <p className="hint-line">
        {voting
          ? `Anonymous. Every vote is a raffle ticket, so even one vote can win. ${tw.voted}/${voters} in.`
          : byVote
            ? 'Nobody knows who voted for what. Somebody wanted this.'
            : 'Picked at random by the house.'}
      </p>

      <div className="twists">
        {tw.options.map((id, i) => {
          const t = TWISTS[id];
          const mine = s.you.twistVote === id;
          const won = landed && tw.chosen === id;
          const n = tw.counts?.[id] || 0;
          return (
            <motion.button
              key={id}
              className={`twist-card ${mine ? 'mine' : ''} ${!voting && spot === id && !landed ? 'lit' : ''} ${won ? 'won' : ''} ${landed && !won ? 'lost' : ''}`}
              disabled={!voting || s.you.sitting}
              initial={{ y: 200, opacity: 0, rotate: 0 }}
              animate={{ y: won ? -14 : 0, opacity: landed && !won ? 0.4 : 1, rotate: won ? 0 : [-3, 1.5, 3][i], scale: won ? 1.08 : 1 }}
              transition={{ ...spring, delay: voting && !s.you.twistVote ? i * 0.1 : 0 }}
              whileHover={voting ? { y: -8, rotate: 0 } : {}}
              whileTap={voting ? { scale: 0.95 } : {}}
              onClick={() => {
                sfx.click();
                socket.emit('twist', { id });
              }}
            >
              <span className="twist-icon">{t.icon}</span>
              <strong>{t.name}</strong>
              <p>{t.desc}</p>
              {byVote && tw.counts && (
                <span className="tickets">
                  {n ? Array.from({ length: n }, (_, k) => <i key={k} />) : <small>no votes</small>}
                </span>
              )}
              {mine && voting && (
                <Stamp tone="ink" rotate={-8} className="twist-stamp">
                  your pick
                </Stamp>
              )}
              {won && (
                <Stamp tone="red" rotate={-8} className="twist-stamp">
                  in force
                </Stamp>
              )}
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}
