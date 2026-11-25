import { useEffect, useRef } from 'react';
import { socket, strokes } from './net';
import { INKS } from './bits';

export function paint(ctx, w, h, list, colorOf, { focus, live, mono, fat } = {}) {
  ctx.clearRect(0, 0, w, h);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = w * 0.0085 * (fat ? 2.8 : 1);
  for (const s of list) {
    const p = s.pts;
    if (!p.length) continue;
    ctx.globalAlpha = focus && s.pid !== focus ? 0.08 : s.hidden && live ? 0.4 : 1;
    ctx.strokeStyle = ctx.fillStyle = mono ? '#17130F' : colorOf(s.pid);
    if (p.length === 2) {
      ctx.beginPath();
      ctx.arc(p[0] * w, p[1] * h, ctx.lineWidth * 0.6, 0, 7);
      ctx.fill();
      continue;
    }
    ctx.beginPath();
    ctx.moveTo(p[0] * w, p[1] * h);
    for (let i = 2; i < p.length - 2; i += 2) {
      ctx.quadraticCurveTo(p[i] * w, p[i + 1] * h, ((p[i] + p[i + 2]) / 2) * w, ((p[i + 1] + p[i + 3]) / 2) * h);
    }
    ctx.lineTo(p[p.length - 2] * w, p[p.length - 1] * h);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

const r4 = (n) => Math.round(n * 1e4) / 1e4;

/**
 * The shared canvas. Reads the live stroke store; when `canDraw`, the local
 * player paints with a per-turn ink `budget` (measured in canvas widths).
 * House rules arrive as props: `mirror` flips input, `mono` paints everything
 * black, `fat` thickens the brush, `maxStrokes` caps brush lifts per turn.
 */
export default function Canvas({ players, me, canDraw, budget = 1, turnKey, onInk, tremor, hidden, focus, live, mirror, mono, fat, maxStrokes }) {
  const ref = useRef();
  const st = useRef({ used: 0, cur: null, pending: [], n: 0, count: 0 });
  const props = useRef({});
  props.current = { players, canDraw, budget, onInk, tremor, hidden, focus, live, mirror, mono, fat, maxStrokes };

  const redraw = () => {
    const c = ref.current;
    if (!c) return;
    const inks = Object.fromEntries(props.current.players.map((p) => [p.id, INKS[p.ink]]));
    paint(c.getContext('2d'), c.width, c.height, strokes.list, (id) => inks[id] || '#17130F', props.current);
  };

  useEffect(() => {
    const c = ref.current;
    const fit = () => {
      const b = c.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      c.width = Math.max(1, Math.round(b.width * dpr));
      c.height = Math.max(1, Math.round(b.height * dpr));
      redraw();
    };
    const ro = new ResizeObserver(fit);
    ro.observe(c);
    fit();
    const off = strokes.sub(redraw);
    const flush = setInterval(() => {
      const s = st.current;
      if (s.cur && s.pending.length) {
        socket.emit('stroke:pts', { pts: s.pending });
        s.pending = [];
      }
    }, 45);
    return () => {
      ro.disconnect();
      off();
      clearInterval(flush);
    };
  }, []);

  useEffect(redraw, [focus, live, players, mono, fat]);

  // New turn: fresh ink.
  useEffect(() => {
    Object.assign(st.current, { used: 0, cur: null, pending: [], count: 0 });
  }, [turnKey]);

  const at = (e) => {
    const b = ref.current.getBoundingClientRect();
    const p = props.current;
    const j = p.tremor ? 0.022 : 0;
    let x = (e.clientX - b.left) / b.width;
    if (p.mirror) x = 1 - x;
    return [
      r4(Math.max(0, Math.min(1, x + (Math.random() - 0.5) * j))),
      r4(Math.max(0, Math.min(1, (e.clientY - b.top) / b.height + (Math.random() - 0.5) * j))),
    ];
  };

  const down = (e) => {
    const s = st.current;
    const p = props.current;
    if (!p.canDraw || s.used >= p.budget || (p.maxStrokes && s.count >= p.maxStrokes)) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    const [x, y] = at(e);
    s.count++;
    s.cur = strokes.start({ id: `me-${Date.now()}-${s.n++}`, pid: me, pts: [x, y], hidden: !!p.hidden });
    s.pending = [];
    socket.emit('stroke:start', { x, y });
  };

  const move = (e) => {
    const s = st.current;
    const p = props.current;
    if (!s.cur || !p.canDraw) return;
    const batch = e.nativeEvent.getCoalescedEvents?.();
    for (const ev of batch?.length ? batch : [e]) {
      const [x, y] = at(ev);
      const n = s.cur.pts.length;
      const d = Math.hypot(x - s.cur.pts[n - 2], (y - s.cur.pts[n - 1]) * 0.75);
      if (d < 0.004) continue;
      if (s.used + d > p.budget) {
        s.used = p.budget;
        up();
        break;
      }
      s.used += d;
      s.cur.pts.push(x, y);
      s.pending.push(x, y);
    }
    strokes.emit();
    p.onInk?.(s.used);
  };

  const up = () => {
    const s = st.current;
    const p = props.current;
    if (!s.cur) return;
    if (s.pending.length) socket.emit('stroke:pts', { pts: s.pending });
    s.pending = [];
    s.cur = null;
    // Out of brush lifts: the turn's ink is spent.
    if (p.maxStrokes && s.count >= p.maxStrokes) {
      s.used = p.budget;
      p.onInk?.(s.used);
    }
  };

  return (
    <canvas
      ref={ref}
      className={`canvas ${canDraw ? 'can-draw' : ''}`}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
    />
  );
}

// A finished painting, e.g. in the end-of-night gallery.
export function Painting({ item }) {
  const ref = useRef();
  useEffect(() => {
    const c = ref.current;
    c.width = 640;
    c.height = 480;
    paint(c.getContext('2d'), 640, 480, item.strokes, (id) => INKS[item.inks[id]] || '#17130F', { fat: item.twist === 'fat' });
  }, [item]);
  return <canvas ref={ref} className="canvas" />;
}

export function savePng(item) {
  const c = document.createElement('canvas');
  c.width = 1600;
  c.height = 1200;
  const ctx = c.getContext('2d');
  paint(ctx, 1600, 1200, item.strokes, (id) => INKS[item.inks[id]] || '#17130F', { fat: item.twist === 'fat' });
  ctx.globalCompositeOperation = 'destination-over';
  ctx.fillStyle = '#FBF6EA';
  ctx.fillRect(0, 0, 1600, 1200);
  const a = document.createElement('a');
  a.download = `counterfeit-${item.real.toLowerCase().replace(/\W+/g, '-')}.png`;
  a.href = c.toDataURL('image/png');
  a.click();
}
