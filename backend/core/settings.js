const { query, getDb, persist } = require('./db');

const DEFAULTS = {
  site_name: 'The Family Shelf',
  site_subtitle: 'Our shared library & reading log',
  accent_color: '#c0392b',
  gold_color: '#c9a84c',
  dark_romance_mode: 'true',   // enables trigger warning features
  readers: '[]',               // JSON array of reader names
};

function getAll() {
  const rows = query('SELECT key, value FROM settings');
  const result = { ...DEFAULTS };
  for (const row of rows) result[row.key] = row.value;
  return result;
}

function get(key) {
  const rows = query('SELECT value FROM settings WHERE key = ?', [key]);
  return rows.length ? rows[0].value : (DEFAULTS[key] ?? null);
}

function set(key, value) {
  const db = getDb();
  db.run(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    [key, String(value)]
  );
  persist();
}

function setMany(obj) {
  for (const [k, v] of Object.entries(obj)) set(k, v);
}

module.exports = { getAll, get, set, setMany, DEFAULTS };
