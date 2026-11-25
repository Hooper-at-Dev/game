const store = () => new Proxy({}, { get: (t, k) => (k === 'removeItem' ? (x) => delete t[x] : t[k]), set: (t, k, v) => ((t[k] = String(v)), true) });
globalThis.localStorage = store();
globalThis.sessionStorage = store();
globalThis.location = { protocol: 'http:', host: 'localhost:1', hostname: 'localhost', port: '1', origin: 'http://localhost:1', search: '', pathname: '/' };
