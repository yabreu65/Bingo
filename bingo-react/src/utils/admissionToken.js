// This is a guest recovery secret, never an organizer credential or URL parameter.
// A room-scoped persistent token survives lost responses, retries and page reloads.
export async function getAdmissionToken(roomCode) {
  if (!/^[A-Z0-9]{6}$/.test(roomCode)) throw new Error('Código de sala inválido');
  const storageKey = `bingo-admission:${roomCode}`;
  const isValid = token => typeof token === 'string' && new RegExp(`^${roomCode}\\.[A-Za-z0-9_-]{43}$`).test(token);
  const loadOrCreate = () => {
    const stored = localStorage.getItem(storageKey);
    if (isValid(stored)) return stored;
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    const random = btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const token = `${roomCode}.${random}`;
    localStorage.setItem(storageKey, token);
    if (localStorage.getItem(storageKey) !== token) throw new Error('No se pudo guardar la admisión');
    return token;
  };
  if (navigator.locks?.request) return navigator.locks.request(storageKey, loadOrCreate);
  // Without cross-tab locks, new identities fail closed rather than orphaning
  // a concurrent tab's secret. An already persisted guest may still recover.
  const stored = localStorage.getItem(storageKey);
  if (isValid(stored)) return stored;
  throw Object.assign(new Error('Este navegador requiere Web Locks y un contexto seguro para crear una admisión'), { code: 'ADMISSION_LOCK_REQUIRED' });
}
