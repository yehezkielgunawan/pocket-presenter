const key = 'pp.presenter.v1';
export function validSessionId(id: string): boolean {
  return /^[A-HJ-NP-Z2-9]{12}$/.test(id);
}

export function readRememberedSession(): string | null {
  try {
    const id = localStorage.getItem(key);
    return id && validSessionId(id) ? id : null;
  } catch {
    return null;
  }
}

export function rememberSession(id: string): void {
  if (!validSessionId(id)) return;
  try {
    localStorage.setItem(key, id);
  } catch {
    // The current remote still works when browser storage is blocked.
  }
}

export function forgetSession(id: string): void {
  try {
    if (readRememberedSession() === id) localStorage.removeItem(key);
  } catch {
    // Recovery is optional when browser storage is blocked.
  }
}
