import './shims.js';
import { renderToString } from 'react-dom/server';
import { createElement as h } from 'react';
import Home from '../src/screens/Home.jsx';
import Lobby from '../src/screens/Lobby.jsx';
import Deal from '../src/screens/Deal.jsx';
import Twist from '../src/screens/Twist.jsx';
import Draw from '../src/screens/Draw.jsx';
import Vote from '../src/screens/Vote.jsx';
import Verdict from '../src/screens/Verdict.jsx';
import Scores from '../src/screens/Scores.jsx';
import Final from '../src/screens/Final.jsx';
const SCREENS = { Home, Lobby, Deal, Twist, Draw, Vote, Verdict, Scores, Final };

const players = ['Ada', 'Bo', 'Cy', 'Di'].map((name, i) => ({ id: `p${i}`, name, ink: i, face: i, connected: true, score: 100 * i, streak: i, gain: 50 * i, sitting: false, heat: i, voted: i < 2, rated: false }));
const results = {
  tally: { p1: 3, p2: 1 },
  votes: { p0: 'p1', p1: 'p2', p2: 'p1', p3: 'p1' },
  gavels: ['p3'],
  forgerId: 'p1',
  caught: true,
  fake: 'Rocket',
  real: 'Lighthouse',
  steal: { guess: 'Whale', correct: false },
  card: { p0: [['Spotted the forger', 100], ['2× sleuth streak', 20]] },
  awards: [{ pid: 'p2', title: 'Scapegoat', blurb: 'innocent' }],
  marks: 4,
};
const base = (phase, you = {}, extra = {}) => ({
  code: 'BCDF', phase, round: 2, hostId: 'p0', settings: { rounds: 5, turnSecs: 12, laps: 2, voteSecs: 40, ink: 1, rules: 'vote' }, rule: 'fat', twist: null, now: Date.now(), endsAt: Date.now() + 9000,
  order: ['p2', 'p0', 'p3', 'p1'], players, turn: null, results: null, stealOptions: null,
  you: { id: 'p0', twistVote: 'tiny', sus: ['p2'], sitting: false, role: 'artist', subject: 'Lighthouse', power: { id: 'alibi', used: false }, intel: 'Bo is clean.', gavel: false, vote: 'p1', rating: null, ...you },
  ...extra,
});
const me = players[0];
const gallery = [{ round: 1, real: 'Lighthouse', fake: 'Rocket', forger: 'Bo', caught: true, strokes: [], inks: {}, crew: 4 }];

const cases = [
  ['Home', { onJoin() {}, error: 'nope', initialCode: 'BCDF', xp: 950 }],
  ['Lobby', { s: base('lobby', { role: null }), me, xp: 10, onLeave() {} }],
  ['Deal', { s: base('deal'), me }],
  ['Deal', { s: base('deal', { role: 'forger', subject: 'Rocket', power: { id: 'gavel', used: false } }), me }],
  ['Draw', { s: base('draw', {}, { turn: { pid: 'p0', idx: 5, total: 8, budget: 1, secs: 6, tremor: true } }), me }],
  ['Draw', { s: base('draw', { power: { id: 'invisible', used: true } }, { turn: { pid: 'p2', idx: 4, total: 8, budget: 2, secs: 12, tremor: false } }), me }],
  ['Draw', { s: base('draw', { role: null, sitting: true, power: null }, { turn: { pid: 'p2', idx: 0, total: 8, budget: 1, secs: 12 } }), me }],
  ['Twist', { s: base('twist', {}, { twist: { options: ['tiny', 'fat', 'speed'], chosen: null, counts: null, voted: 2 } }), me }],
  ['Twist', { s: base('twist', {}, { twist: { options: ['tiny', 'fat', 'speed'], chosen: 'fat', counts: { tiny: 1, fat: 3, speed: 0 }, voted: 4 } }), me }],
  ['Vote', { s: base('vote'), me }],
  ['Verdict', { s: base('verdict', {}, { results: { ...results, steal: null } }), me }],
  ['Verdict', { s: base('verdict', { id: 'p1', role: 'forger' }, { results: { ...results, steal: null, real: null }, stealOptions: ['Lighthouse', 'Whale', 'Moon'] }), me: players[1] }],
  ['Verdict', { s: base('appraise', {}, { results }), me }],
  ['Verdict', { s: base('appraise', { rating: 2 }, { results: { ...results, caught: false, steal: null } }), me }],
  ['Scores', { s: base('scores', {}, { results }), me, xp: 400 }],
  ['Scores', { s: base('scores', { id: 'p1' }, { results }), me: players[1], xp: 9000 }],
  ['Final', { s: base('final', { role: null }), me, gallery, onLeave() {} }],
  ['Final', { s: base('final', { role: null }), me: players[3], gallery, onLeave() {} }],
];

let bad = 0;
for (const [name, props] of cases) {
  try {
    const html = renderToString(h(SCREENS[name], props));
    console.log(`ok   ${name.padEnd(8)} ${html.length} chars`);
  } catch (e) {
    bad++;
    console.error(`FAIL ${name}: ${e.stack.split('\n').slice(0, 4).join('\n')}`);
  }
}
process.exit(bad ? 1 : 0);
