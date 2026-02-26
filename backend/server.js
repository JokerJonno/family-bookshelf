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
  `);

  // Migrate existing DBs — add new columns if missing
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

function logActivity(type, reader_name, book_id, book_title, detail) {
  db.run(
    'INSERT INTO activity (type, reader_name, book_id, book_title, detail) VALUES (?, ?, ?, ?, ?)',
    [type, reader_name || null, book_id || null, book_title || null, detail || null]
  );
  persist();
}

// ── Book Lookup ──
async function lookupBook(titleOrIsbn, author = '') {
  // ISBN lookup
  if (/^[0-9]{10,13}$/.test(titleOrIsbn.replace(/-/g, ''))) {
    const isbn = titleOrIsbn.replace(/-/g, '');
    try {
      const res = await fetch(`https://openlibrary.org/api/books?bibkeys=ISBN:${isbn}&format=json&jscmd=data`, { timeout: 8000 });
      const data = await res.json();
      const key = `ISBN:${isbn}`;
      if (data[key]) {
        const b = data[key];
        const genres = b.subjects ? extractGenres(b.subjects.map(s => s.name || s)) : [];
        const triggers = b.subjects ? extractTriggerWarnings(b.subjects.map(s => s.name || s)) : [];
        return {
          title: b.title, author: b.authors ? b.authors[0].name : '',
          isbn,
          cover_url: b.cover ? b.cover.large || b.cover.medium : null,
          synopsis: b.notes || '',
          genres, trigger_warnings: triggers,
          kindle_url: `https://www.amazon.com/s?k=${encodeURIComponent(b.title)}&i=digital-text`,
          open_library_key: b.key || null,
          published_year: b.publish_date ? parseInt(b.publish_date) : null,
          page_count: b.number_of_pages || null,
        };
      }
    } catch (e) { console.error('ISBN lookup failed:', e.message); }
  }

  // Title/author search
  const q = encodeURIComponent(`${titleOrIsbn} ${author}`);
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
          if (workData.subjects) {
            genres = extractGenres(workData.subjects);
            triggerWarnings = extractTriggerWarnings(workData.subjects);
          }
        } catch (e) {}
      }
      if (genres.length === 0 && book.subject) {
        genres = extractGenres(book.subject);
        triggerWarnings = extractTriggerWarnings(book.subject);
      }

      return {
        title: book.title || titleOrIsbn, author: book.author_name ? book.author_name[0] : author,
        isbn: book.isbn ? book.isbn[0] : null,
        cover_url: book.cover_i ? `https://covers.openlibrary.org/b/id/${book.cover_i}-L.jpg` : null,
        synopsis, genres, trigger_warnings: triggerWarnings,
        kindle_url: `https://www.amazon.com/s?k=${encodeURIComponent(titleOrIsbn + ' ' + author)}&i=digital-text`,
        open_library_key: olKey,
        published_year: book.first_publish_year || null,
        page_count: book.number_of_pages_median || null,
      };
    }
  } catch (e) { console.error('Open Library lookup failed:', e.message); }

  return {
    title: titleOrIsbn, author, isbn: null, cover_url: null, synopsis: '',
    genres: [], trigger_warnings: [],
    kindle_url: `https://www.amazon.com/s?k=${encodeURIComponent(titleOrIsbn + ' ' + author)}&i=digital-text`,
    open_library_key: null, published_year: null, page_count: null,
  };
}

const GENRE_MAP = {
  'dark romance':'Dark Romance','romance':'Romance','fantasy':'Fantasy','science fiction':'Sci-Fi',
  'mystery':'Mystery','thriller':'Thriller','horror':'Horror','historical fiction':'Historical Fiction',
  'contemporary':'Contemporary','young adult':'Young Adult','paranormal':'Paranormal','erotica':'Erotica',
  'suspense':'Suspense','adventure':'Adventure','dystopian':'Dystopian','urban fantasy':'Urban Fantasy',
  'new adult':'New Adult','mafia':'Mafia Romance','bully':'Bully Romance','omegaverse':'Omegaverse',
  'reverse harem':'Reverse Harem','why choose':'Why Choose','monster':'Monster Romance',
  'sports romance':'Sports Romance','small town':'Small Town Romance','enemies to lovers':'Enemies to Lovers',
};
const TRIGGER_MAP = [
  'dubious consent','dub-con','dubcon','non-con','non-consent','noncon','abuse','domestic violence',
  'sexual assault','rape','violence','graphic violence','murder','torture','death','suicide',
  'self-harm','addiction','drug use','kidnapping','captive','stalking','age gap','dark themes',
  'explicit content','manipulation','possessive','cheating','infidelity','pregnancy','miscarriage',
];

function extractGenres(subjects) {
  const genres = new Set();
  const s = subjects.map(x => (x || '').toLowerCase()).join(' ');
  for (const [key, label] of Object.entries(GENRE_MAP)) { if (s.includes(key)) genres.add(label); }
  return [...genres].slice(0, 8);
}
function extractTriggerWarnings(subjects) {
  const found = new Set();
  const s = subjects.map(x => (x || '').toLowerCase()).join(' ');
  for (const t of TRIGGER_MAP) { if (s.includes(t)) found.add(t.replace(/\b\w/g, c => c.toUpperCase())); }
  return [...found];
}

function parseBook(b) {
  return {
    ...b,
    genres: JSON.parse(b.genres || '[]'),
    trigger_warnings: JSON.parse(b.trigger_warnings || '[]'),
  };
}

// ── Middleware ──
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'frontend', 'public')));

// ── Routes ──

app.get('/api/lookup', async (req, res) => {
  const { title, author, isbn } = req.query;
  const search = isbn || title;
  if (!search) return res.status(400).json({ error: 'title or isbn required' });
  try { res.json(await lookupBook(search, author || '')); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/books', (req, res) => {
  const { genre, trigger, search, sort, status, series } = req.query;

  let books = query(`
    SELECT b.*, ROUND(AVG(r.stars), 1) as avg_rating, COUNT(r.id) as rating_count
    FROM books b LEFT JOIN ratings r ON r.book_id = b.id
    GROUP BY b.id ORDER BY b.added_at DESC
  `).map(parseBook);

  if (status && status !== 'all') books = books.filter(b => b.status === status);
  if (genre) books = books.filter(b => b.genres.some(g => g.toLowerCase() === genre.toLowerCase()));
  if (trigger) books = books.filter(b => b.trigger_warnings.some(t => t.toLowerCase().includes(trigger.toLowerCase())));
  if (series) books = books.filter(b => b.series_name && b.series_name.toLowerCase().includes(series.toLowerCase()));
  if (search) {
    const s = search.toLowerCase();
    books = books.filter(b =>
      b.title.toLowerCase().includes(s) || b.author.toLowerCase().includes(s) ||
      (b.series_name || '').toLowerCase().includes(s)
    );
  }
  if (sort === 'rating') books.sort((a, b) => (b.avg_rating || 0) - (a.avg_rating || 0));
  else if (sort === 'title') books.sort((a, b) => a.title.localeCompare(b.title));
  else if (sort === 'author') books.sort((a, b) => a.author.localeCompare(b.author));
  else if (sort === 'series') {
    books.sort((a, b) => {
      if (!a.series_name && !b.series_name) return 0;
      if (!a.series_name) return 1;
      if (!b.series_name) return -1;
      const sc = a.series_name.localeCompare(b.series_name);
      return sc !== 0 ? sc : (a.series_order || 0) - (b.series_order || 0);
    });
  }

  res.json(books);
});

app.get('/api/books/:id', (req, res) => {
  const rows = query('SELECT * FROM books WHERE id = ?', [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: 'Not found' });
  const book = parseBook(rows[0]);
  book.ratings = query('SELECT * FROM ratings WHERE book_id = ? ORDER BY rated_at DESC', [req.params.id]);
  res.json(book);
});

app.post('/api/books', (req, res) => {
  const {
    title, author, cover_url, synopsis, genres, trigger_warnings, kindle_url,
    isbn, open_library_key, published_year, page_count,
    status, series_name, series_order, recommended_by
  } = req.body;

  if (!title) return res.status(400).json({ error: 'title required' });

  const existing = query('SELECT id FROM books WHERE LOWER(title) = LOWER(?) AND LOWER(author) = LOWER(?)', [title, author || '']);
  if (existing.length) return res.status(409).json({ error: 'Book already in library', book_id: existing[0].id });

  const id = run(
    `INSERT INTO books (title, author, isbn, cover_url, synopsis, genres, trigger_warnings, kindle_url,
      open_library_key, published_year, page_count, status, series_name, series_order, recommended_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [title, author || '', isbn || null, cover_url || null, synopsis || '',
     JSON.stringify(genres || []), JSON.stringify(trigger_warnings || []),
     kindle_url || null, open_library_key || null, published_year || null, page_count || null,
     status || 'finished', series_name || null, series_order || null, recommended_by || null]
  );

  const book = parseBook(query('SELECT * FROM books WHERE id = ?', [id])[0]);
  logActivity('book_added', recommended_by || null, id, title, null);
  res.status(201).json(book);
});

app.patch('/api/books/:id', (req, res) => {
  if (!query('SELECT id FROM books WHERE id = ?', [req.params.id]).length) return res.status(404).json({ error: 'Not found' });

  const fields = ['genres','trigger_warnings','synopsis','cover_url','status','series_name','series_order','recommended_by','title','author'];
  for (const f of fields) {
    if (req.body[f] !== undefined) {
      const val = (f === 'genres' || f === 'trigger_warnings') ? JSON.stringify(req.body[f]) : req.body[f];
      db.run(`UPDATE books SET ${f} = ? WHERE id = ?`, [val, req.params.id]);
    }
  }
  persist();

  const book = parseBook(query('SELECT * FROM books WHERE id = ?', [req.params.id])[0]);
  res.json(book);
});

app.delete('/api/books/:id', (req, res) => {
  const rows = query('SELECT title FROM books WHERE id = ?', [req.params.id]);
  if (rows.length) logActivity('book_removed', null, null, rows[0].title, null);
  db.run('DELETE FROM ratings WHERE book_id = ?', [req.params.id]);
  db.run('DELETE FROM books WHERE id = ?', [req.params.id]);
  persist();
  res.json({ ok: true });
});

app.post('/api/books/:id/ratings', (req, res) => {
  const { reader_name, stars, blurb } = req.body;
  if (!reader_name || !stars) return res.status(400).json({ error: 'reader_name and stars required' });
  const bookRows = query('SELECT title FROM books WHERE id = ?', [req.params.id]);
  if (!bookRows.length) return res.status(404).json({ error: 'Book not found' });

  const existing = query('SELECT id FROM ratings WHERE book_id = ? AND reader_name = ?', [req.params.id, reader_name]);
  if (existing.length) {
    db.run("UPDATE ratings SET stars = ?, blurb = ?, rated_at = datetime('now') WHERE id = ?", [stars, blurb || null, existing[0].id]);
  } else {
    db.run('INSERT INTO ratings (book_id, reader_name, stars, blurb) VALUES (?, ?, ?, ?)', [req.params.id, reader_name, stars, blurb || null]);
  }
  persist();
  logActivity('rating_added', reader_name, req.params.id, bookRows[0].title, `${stars} stars`);
  res.json({ ok: true });
});

app.delete('/api/ratings/:id', (req, res) => {
  db.run('DELETE FROM ratings WHERE id = ?', [req.params.id]);
  persist();
  res.json({ ok: true });
});

app.get('/api/filters', (req, res) => {
  const books = query('SELECT genres, trigger_warnings, series_name FROM books');
  const genres = new Set(), triggers = new Set(), series = new Set();
  for (const b of books) {
    JSON.parse(b.genres || '[]').forEach(g => genres.add(g));
    JSON.parse(b.trigger_warnings || '[]').forEach(t => triggers.add(t));
    if (b.series_name) series.add(b.series_name);
  }
  res.json({ genres: [...genres].sort(), triggers: [...triggers].sort(), series: [...series].sort() });
});

app.get('/api/stats', (req, res) => {
  const totalBooks = query('SELECT COUNT(*) as n FROM books')[0].n;
  const totalRatings = query('SELECT COUNT(*) as n FROM ratings')[0].n;
  const byStatus = query("SELECT status, COUNT(*) as n FROM books GROUP BY status");
  const topRated = query(`
    SELECT b.title, b.author, b.cover_url, ROUND(AVG(r.stars),1) as avg, COUNT(r.id) as cnt
    FROM books b JOIN ratings r ON r.book_id = b.id
    GROUP BY b.id HAVING cnt >= 1 ORDER BY avg DESC, cnt DESC LIMIT 5
  `);
  const byReader = query(`
    SELECT reader_name, COUNT(*) as ratings_count, ROUND(AVG(stars),1) as avg_stars
    FROM ratings GROUP BY reader_name ORDER BY ratings_count DESC
  `);
  const byGenre = query(`SELECT genres FROM books`).reduce((acc, b) => {
    JSON.parse(b.genres || '[]').forEach(g => { acc[g] = (acc[g] || 0) + 1; });
    return acc;
  }, {});
  const topGenres = Object.entries(byGenre).sort((a,b) => b[1]-a[1]).slice(0,8).map(([g,n]) => ({ genre: g, count: n }));
  const recentlyRead = query(`
    SELECT b.title, b.author, b.cover_url, b.added_at, ROUND(AVG(r.stars),1) as avg_rating
    FROM books b LEFT JOIN ratings r ON r.book_id = b.id
    WHERE b.status = 'finished'
    GROUP BY b.id ORDER BY b.added_at DESC LIMIT 5
  `);
  const mostActive = query(`
    SELECT reader_name, COUNT(*) as n FROM ratings
    WHERE rated_at >= datetime('now', '-30 days')
    GROUP BY reader_name ORDER BY n DESC LIMIT 1
  `);

  res.json({ totalBooks, totalRatings, byStatus, topRated, byReader, topGenres, recentlyRead, mostActive: mostActive[0] || null });
});

app.get('/api/activity', (req, res) => {
  const rows = query('SELECT * FROM activity ORDER BY created_at DESC LIMIT 50');
  res.json(rows);
});

app.get('/api/export/csv', (req, res) => {
  const books = query(`
    SELECT b.*, ROUND(AVG(r.stars),1) as avg_rating, COUNT(r.id) as rating_count
    FROM books b LEFT JOIN ratings r ON r.book_id = b.id GROUP BY b.id ORDER BY b.title
  `).map(parseBook);

  const headers = ['Title','Author','Series','Series #','Status','Genres','Trigger Warnings','Avg Rating','# Ratings','Year','Pages','ISBN','Recommended By','Added'];
  const rows = books.map(b => [
    b.title, b.author, b.series_name || '', b.series_order || '',
    b.status, b.genres.join('; '), b.trigger_warnings.join('; '),
    b.avg_rating || '', b.rating_count || 0,
    b.published_year || '', b.page_count || '', b.isbn || '',
    b.recommended_by || '', b.added_at,
  ]);

  const csv = [headers, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="family-bookshelf.csv"');
  res.send(csv);
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'frontend', 'public', 'index.html'));
});

initDB().then(() => {
  app.listen(PORT, '0.0.0.0', () => console.log(`📚 Family Bookshelf running on http://0.0.0.0:${PORT}`));
}).catch(err => { console.error('Failed to init database:', err); process.exit(1); });
