import { io } from 'socket.io-client';

export const socket = io({ transports: ['websocket', 'polling'] });

const fresh = () => Math.random().toString(36).slice(2) + Date.now().toString(36);
// Per-tab identity: survives a reload, but two tabs are two different painters.
export const pid = (sessionStorage.cf_pid ||= fresh());

// Server clock minus local clock, refreshed on every state snapshot.
export const clock = { offset: 0 };
export const serverNow = () => Date.now() + clock.offset;

// Strokes live outside React so a 60fps brush doesn't re-render the app.
export const strokes = {
  list: [],
  map: new Map(),
  subs: new Set(),
  set(arr) {
    this.list = arr.map((s) => ({ ...s, pts: [...s.pts] }));
    this.map = new Map(this.list.map((s) => [s.id, s]));
    this.emit();
  },
  start(s) {
    const copy = { ...s, pts: [...s.pts] };
    this.list.push(copy);
    this.map.set(copy.id, copy);
    this.emit();
    return copy;
  },
  add(id, pts) {
    const s = this.map.get(id);
    if (!s) return;
    s.pts.push(...pts);
    this.emit();
  },
  emit() {
    this.subs.forEach((f) => f());
  },
  sub(f) {
    this.subs.add(f);
    return () => this.subs.delete(f);
  },
};

socket.on('strokes', (arr) => strokes.set(arr));
socket.on('stroke:start', (s) => strokes.start(s));
socket.on('stroke:pts', (d) => strokes.add(d.id, d.pts));
