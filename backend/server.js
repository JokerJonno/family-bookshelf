const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const path = require('path');
const fs = require('fs');
const initSqlJs = require('sql.js');

const app = express();
const PORT = process.env.PORT || 3000;
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data', 'bookshelf.db');

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

let db;

async function initDB() {
  const SQL = await initSqlJs();
  if (fs.existsSync(DB_PATH)) {
    const fileBuffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(fileBuffer);
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
  `);
  persist();
}

function persist() {
  const data = db.export();
  fs.writeFileSync(DB_PATH, Buffer.from(data));
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

async function lookupBook(title, author) {
  const q = encodeURIComponent(`${title} ${author}`);
  try {
    const searchRes = await fetch(
      `https://openlibrary.org/search.json?q=${q}&limit=3&fields=key,title,author_name,isbn,cover_i,first_publish_year,number_of_pages_median,subject`,
      { timeout: 8000 }
    );
    const searchData = await searchRes.json();
    if (searchData.docs && searchData.docs.length > 0) {
      const book = searchData.docs[0];
      const olKey = book.key;
      let synopsis = '', genres = [], triggerWarnings = [];

      if (olKey) {
        try {
          const workRes = await fetch(`https://openlibrary.org${olKey}.json`, { timeout: 6000 });
          const workData = await workRes.json();
          if (workData.description) {
            synopsis = typeof workData.description === 'string' ? workData.description : workData.description.value || '';
          }
          if (workData.subjects) { genres = extractGenres(workData.subjects); triggerWarnings = extractTriggerWarnings(workData.subjects); }
        } catch (e) {}
      }
      if (genres.length === 0 && book.subject) { genres = extractGenres(book.subject); triggerWarnings = extractTriggerWarnings(book.subject); }

      const isbn = book.isbn ? book.isbn[0] : null;
      return {
        title: book.title || title, author: book.author_name ? book.author_name[0] : author,
        isbn, cover_url: book.cover_i ? `https://covers.openlibrary.org/b/id/${book.cover_i}-L.jpg` : null,
        synopsis, genres, trigger_warnings: triggerWarnings,
        kindle_url: `https://www.amazon.com/s?k=${encodeURIComponent(title + ' ' + author)}&i=digital-text`,
        open_library_key: olKey, published_year: book.first_publish_year || null, page_count: book.number_of_pages_median || null,
      };
    }
  } catch (e) { console.error('Open Library lookup failed:', e.message); }
  return {
    title, author, isbn: null, cover_url: null, synopsis: '', genres: [], trigger_warnings: [],
    kindle_url: `https://www.amazon.com/s?k=${encodeURIComponent(title + ' ' + author)}&i=digital-text`,
    open_library_key: null, published_year: null, page_count: null,
  };
}

const GENRE_MAP = {
  'dark romance':'Dark Romance','romance':'Romance','fantasy':'Fantasy','science fiction':'Sci-Fi',
  'mystery':'Mystery','thriller':'Thriller','horror':'Horror','historical fiction':'Historical Fiction',
  'contemporary':'Contemporary','young adult':'Young Adult','paranormal':'Paranormal','erotica':'Erotica',
  'suspense':'Suspense','adventure':'Adventure','dystopian':'Dystopian','urban fantasy':'Urban Fantasy',
  'new adult':'New Adult','mafia':'Mafia Romance','bully':'Bully Romance','omegaverse':'Omegaverse',
};
const TRIGGER_MAP = [
  'dubious consent','dub-con','dubcon','non-con','non-consent','noncon','abuse','domestic violence',
  'sexual assault','rape','violence','graphic violence','murder','torture','death','suicide',
  'self-harm','addiction','drug use','kidnapping','captive','stalking','age gap','dark themes',
  'explicit content','manipulation','possessive',
];
function extractGenres(subjects) {
  const genres = new Set();
  const s = subjects.map(x => x.toLowerCase()).join(' ');
  for (const [key, label] of Object.entries(GENRE_MAP)) { if (s.includes(key)) genres.add(label); }
  return [...genres].slice(0, 8);
}
function extractTriggerWarnings(subjects) {
  const found = new Set();
  const s = subjects.map(x => x.toLowerCase()).join(' ');
  for (const t of TRIGGER_MAP) { if (s.includes(t)) found.add(t.replace(/\b\w/g, c => c.toUpperCase())); }
  return [...found];
}

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'frontend', 'public')));

app.get('/api/lookup', async (req, res) => {
  const { title, author } = req.query;
  if (!title) return res.status(400).json({ error: 'title required' });
  try { res.json(await lookupBook(title, author || '')); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/books', (req, res) => {
  const { genre, trigger, search, sort } = req.query;
  let books = query(`
    SELECT b.*, ROUND(AVG(r.stars), 1) as avg_rating, COUNT(r.id) as rating_count
    FROM books b LEFT JOIN ratings r ON r.book_id = b.id
    GROUP BY b.id ORDER BY b.added_at DESC
  `).map(b => ({ ...b, genres: JSON.parse(b.genres || '[]'), trigger_warnings: JSON.parse(b.trigger_warnings || '[]') }));

  if (genre) books = books.filter(b => b.genres.some(g => g.toLowerCase() === genre.toLowerCase()));
  if (trigger) books = books.filter(b => b.trigger_warnings.some(t => t.toLowerCase().includes(trigger.toLowerCase())));
  if (search) { const s = search.toLowerCase(); books = books.filter(b => b.title.toLowerCase().includes(s) || b.author.toLowerCase().includes(s)); }
  if (sort === 'rating') books.sort((a, b) => (b.avg_rating || 0) - (a.avg_rating || 0));
  else if (sort === 'title') books.sort((a, b) => a.title.localeCompare(b.title));
  res.json(books);
});

app.get('/api/books/:id', (req, res) => {
  const rows = query('SELECT * FROM books WHERE id = ?', [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: 'Not found' });
  const book = rows[0];
  book.genres = JSON.parse(book.genres || '[]');
  book.trigger_warnings = JSON.parse(book.trigger_warnings || '[]');
  book.ratings = query('SELECT * FROM ratings WHERE book_id = ? ORDER BY rated_at DESC', [req.params.id]);
  res.json(book);
});

app.post('/api/books', (req, res) => {
  const { title, author, cover_url, synopsis, genres, trigger_warnings, kindle_url, isbn, open_library_key, published_year, page_count } = req.body;
  if (!title) return res.status(400).json({ error: 'title required' });
  const existing = query('SELECT id FROM books WHERE LOWER(title) = LOWER(?) AND LOWER(author) = LOWER(?)', [title, author || '']);
  if (existing.length) return res.status(409).json({ error: 'Book already in library', book_id: existing[0].id });
  const id = run(
    `INSERT INTO books (title, author, isbn, cover_url, synopsis, genres, trigger_warnings, kindle_url, open_library_key, published_year, page_count)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [title, author || '', isbn || null, cover_url || null, synopsis || '',
     JSON.stringify(genres || []), JSON.stringify(trigger_warnings || []),
     kindle_url || null, open_library_key || null, published_year || null, page_count || null]
  );
  const book = query('SELECT * FROM books WHERE id = ?', [id])[0];
  book.genres = JSON.parse(book.genres);
  book.trigger_warnings = JSON.parse(book.trigger_warnings);
  res.status(201).json(book);
});

app.patch('/api/books/:id', (req, res) => {
  const { genres, trigger_warnings, synopsis, cover_url } = req.body;
  if (!query('SELECT id FROM books WHERE id = ?', [req.params.id]).length) return res.status(404).json({ error: 'Not found' });
  if (genres !== undefined) db.run('UPDATE books SET genres = ? WHERE id = ?', [JSON.stringify(genres), req.params.id]);
  if (trigger_warnings !== undefined) db.run('UPDATE books SET trigger_warnings = ? WHERE id = ?', [JSON.stringify(trigger_warnings), req.params.id]);
  if (synopsis !== undefined) db.run('UPDATE books SET synopsis = ? WHERE id = ?', [synopsis, req.params.id]);
  if (cover_url !== undefined) db.run('UPDATE books SET cover_url = ? WHERE id = ?', [cover_url, req.params.id]);
  persist();
  const book = query('SELECT * FROM books WHERE id = ?', [req.params.id])[0];
  book.genres = JSON.parse(book.genres); book.trigger_warnings = JSON.parse(book.trigger_warnings);
  res.json(book);
});

app.delete('/api/books/:id', (req, res) => {
  db.run('DELETE FROM ratings WHERE book_id = ?', [req.params.id]);
  db.run('DELETE FROM books WHERE id = ?', [req.params.id]);
  persist(); res.json({ ok: true });
});

app.post('/api/books/:id/ratings', (req, res) => {
  const { reader_name, stars, blurb } = req.body;
  if (!reader_name || !stars) return res.status(400).json({ error: 'reader_name and stars required' });
  if (!query('SELECT id FROM books WHERE id = ?', [req.params.id]).length) return res.status(404).json({ error: 'Book not found' });
  const existing = query('SELECT id FROM ratings WHERE book_id = ? AND reader_name = ?', [req.params.id, reader_name]);
  if (existing.length) {
    db.run("UPDATE ratings SET stars = ?, blurb = ?, rated_at = datetime('now') WHERE id = ?", [stars, blurb || null, existing[0].id]);
  } else {
    db.run('INSERT INTO ratings (book_id, reader_name, stars, blurb) VALUES (?, ?, ?, ?)', [req.params.id, reader_name, stars, blurb || null]);
  }
  persist(); res.json({ ok: true });
});

app.delete('/api/ratings/:id', (req, res) => {
  db.run('DELETE FROM ratings WHERE id = ?', [req.params.id]);
  persist(); res.json({ ok: true });
});

app.get('/api/filters', (req, res) => {
  const books = query('SELECT genres, trigger_warnings FROM books');
  const genres = new Set(), triggers = new Set();
  for (const b of books) {
    JSON.parse(b.genres || '[]').forEach(g => genres.add(g));
    JSON.parse(b.trigger_warnings || '[]').forEach(t => triggers.add(t));
  }
  res.json({ genres: [...genres].sort(), triggers: [...triggers].sort() });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'frontend', 'public', 'index.html'));
});

initDB().then(() => {
  app.listen(PORT, '0.0.0.0', () => console.log(`📚 Family Bookshelf running on http://0.0.0.0:${PORT}`));
}).catch(err => { console.error('Failed to init database:', err); process.exit(1); });
