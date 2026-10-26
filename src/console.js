// Shared log bus used by the editor console, the runtime and script errors.

const listeners = new Set();
export const logs = [];

export function log(message, level = 'info') {
  const entry = { message: String(message), level, t: new Date() };
  logs.push(entry);
  if (logs.length > 300) logs.shift();
  for (const fn of listeners) {
    try {
      fn(entry);
    } catch { /* a broken listener must not break logging */ }
  }
  return entry;
}

export const logInfo = (m) => log(m, 'info');
export const logWarn = (m) => log(m, 'warn');
export const logError = (m) => log(m, 'error');
export const logGame = (m) => log(m, 'game');

export function clearLogs() {
  logs.length = 0;
  for (const fn of listeners) {
    try {
      fn(null);
    } catch { /* ignore */ }
  }
}

export function subscribeLogs(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function formatTime(date) {
  const d = date instanceof Date ? date : new Date(date);
  const pad = (n, l = 2) => String(n).padStart(l, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}
