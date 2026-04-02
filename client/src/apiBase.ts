/**
 * Backend origin for API, wiki proxy, and WebSocket.
 * Controlled via BACKEND_API_URL (no trailing slash).
 * Dev always uses same-origin so Vite proxy can forward to localhost.
 */
function backendOrigin(): string {
  const configured = (import.meta.env.BACKEND_API_URL ?? '').replace(/\/$/, '');
  return import.meta.env.DEV ? '' : configured;
}

/** Absolute or same-origin path for fetch() and iframe src. */
export function apiUrl(path: string): string {
  const base = backendOrigin();
  const p = path.startsWith('/') ? path : `/${path}`;
  return base ? `${base}${p}` : p;
}

export function lobbyWebSocketUrl(
  lobbyId: string,
  playerName: string,
  playerId: string
): string {
  const base = backendOrigin();
  const q = `lobbyId=${lobbyId}&playerName=${encodeURIComponent(
    playerName
  )}&playerId=${encodeURIComponent(playerId)}`;
  if (!base) {
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${proto}//${window.location.host}/ws?${q}`;
  }
  const u = new URL(base);
  const wsProto = u.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${wsProto}//${u.host}/ws?${q}`;
}
