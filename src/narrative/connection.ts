import type { NarrativeConnection } from './service';
const KEY = 'pennant-narrative-connection-v1';
let token = '';
export function loadNarrativeConnection(): NarrativeConnection {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    return {
      enabled: saved.enabled === true,
      url: typeof saved.url === 'string' ? saved.url : '',
      token,
    };
  } catch {
    return { enabled: false, url: '', token };
  }
}
export function saveNarrativeConnection(value: NarrativeConnection): void {
  token = value.token;
  // Only public connection preferences persist. Credentials never enter a save or bundle.
  try {
    localStorage.setItem(KEY, JSON.stringify({ enabled: value.enabled, url: value.url }));
  } catch {
    /* optional */
  }
}
