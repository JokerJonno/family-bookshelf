const fs = require('fs');
const path = require('path');
const initSqlJs = require('sql.js');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'bookshelf.db');
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

let db;

async function init() {
  const SQL = await initSqlJs();
  if (fs.existsSync(DB_PATH)) {
    db = new SQL.Database(fs.readFileSync(DB_PATH));
  } else {
    db = new SQL.Database();
  }

  db.run(`
    CREATE TABLE IF NOT EXISTS books (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      author TEXT NOT NULL,
      isbn TEXT,
      cover_url TEXT,
      synopsis TEXT,
      genres TEXT DEFAULT '[]',
      trigger_warnings TEXT DEFAULT '[]',
      kindle_url TEXT,
      open_library_key TEXT,
      published_year INTEGER,
      page_count INTEGER,
      status TEXT DEFAULT 'finished',
      series_name TEXT,
      series_order REAL,
      recommended_by TEXT,
      added_at DATETIME DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS ratings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      book_id INTEGER NOT NULL,
      reader_name TEXT NOT NULL,
      stars INTEGER NOT NULL,
      blurb TEXT,
      rated_at DATETIME DEFAULT (datetime('now')),
      UNIQUE(book_id, reader_name)
    );
    CREATE TABLE IF NOT EXISTS activity (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      reader_name TEXT,
      book_id INTEGER,
      book_title TEXT,
      detail TEXT,
      created_at DATETIME DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  // Migrations — safe to run on existing DBs
  const migrations = [
    "ALTER TABLE books ADD COLUMN status TEXT DEFAULT 'finished'",
    "ALTER TABLE books ADD COLUMN series_name TEXT",
    "ALTER TABLE books ADD COLUMN series_order REAL",
    "ALTER TABLE books ADD COLUMN recommended_by TEXT",
  ];
  for (const sql of migrations) {
    try { db.run(sql); } catch (e) { /* column already exists */ }
  }

  persist();
  return db;
}

function persist() {
  fs.writeFileSync(DB_PATH, Buffer.from(db.export()));
}

function query(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

function run(sql, params = []) {
  db.run(sql, params);
  const [{ id }] = query('SELECT last_insert_rowid() as id');
  persist();
  return id;
}

function logActivity(type, reader_name, book_id, book_title, detail) {
  db.run(
    'INSERT INTO activity (type, reader_name, book_id, book_title, detail) VALUES (?, ?, ?, ?, ?)',
    [type, reader_name || null, book_id || null, book_title || null, detail || null]
  );
  persist();
}

function getDb() { return db; }

module.exports = { init, persist, query, run, logActivity, getDb };
