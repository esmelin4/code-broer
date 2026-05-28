/**
 * state.js — Guarda el estado del autopublisher para no repetir temas.
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';

const STATE_FILE = './autopublisher/state.json';

export function loadState() {
  if (!existsSync(STATE_FILE)) return {};
  try { return JSON.parse(readFileSync(STATE_FILE, 'utf8')); }
  catch { return {}; }
}

export function saveState(state) {
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}
