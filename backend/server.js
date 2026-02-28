const express = require('express');
const cors = require('cors');
const path = require('path');

const db = require('./core/db');
const { lookupBook } = require('./core/lookup');
const settings = require('./core/settings');
const { loadPlugins, getLoadedPlugins } = require('./plugins');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'frontend', 'public')));

// ── Helpers passed to plugins ──
const helpers = {
  query: (...a) => db.query(...a),
  run: (...a) => db.run(...a),
  persist: () => db.persist(),
  logActivity: (...a) => db.logActivity(...a),
  getDb: () => db.getDb(),
};

// ── Settings ──
app.get('/api/settings', (req, res) => res.json(settings.getAll()));

app.patch('/api/settings', (req, res) => {
  const allowed = ['site_name','site_subtitle','accent_color','gold_color','dark_romance_mode'];
  const updates = {};
  for (const k of allowed) { if (req.body[k] !== undefined) updates[k] = req.body[k]; }
  settings.setMany(updates);
  res.json(settings.getAll());
});

// ── Readers (stored in settings as JSON) ──
app.get('/api/readers', (req, res) => {
  try { res.json(JSON.parse(settings.get('readers') || '[]')); }
  catch(e) { res.json([]); }
});

app.post('/api/readers', (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'name required' });
  let readers = [];
  try { readers = JSON.parse(settings.get('readers') || '[]'); } catch(e) {}
  if (readers.includes(name.trim())) return res.status(409).json({ error: 'Reader already exists' });
  readers.push(name.trim());
  settings.set('readers', JSON.stringify(readers));
  res.json(readers);
});

app.delete('/api/readers/:name', (req, res) => {
  let readers = [];
  try { readers = JSON.parse(settings.get('readers') || '[]'); } catch(e) {}
  readers = readers.filter(r => r !== req.params.name);
  settings.set('readers', JSON.stringify(readers));
  res.json(readers);
});

// ── Plugins manifest ──
app.get('/api/plugins', (req, res) => res.json(getLoadedPlugins()));

// ── Book Lookup ──
app.get('/api/lookup', async (req, res) => {
  const { title, author, isbn } = req.query;
  const search = isbn || title;
  if (!search) return res.status(400).json({ error: 'title or isbn required' });
  try { res.json(await lookupBook(search, author || '')); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Books ──
function parseBook(b) {
  return { ...b, genres: JSON.parse(b.genres || '[]'), trigger_warnings: JSON.parse(b.trigger_warnings || '[]') };
}

app.get('/api/books', (req, res) => {
  const { genre, trigger, search, sort, status, series } = req.query;

  let books = db.query(`
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
    books = books.filter(b => b.title.toLowerCase().includes(s) || b.author.toLowerCase().includes(s) || (b.series_name||'').toLowerCase().includes(s));
  }
  if (sort === 'rating') books.sort((a, b) => (b.avg_rating||0) - (a.avg_rating||0));
  else if (sort === 'title') books.sort((a, b) => a.title.localeCompare(b.title));
  else if (sort === 'author') books.sort((a, b) => a.author.localeCompare(b.author));
  else if (sort === 'series') {
    books.sort((a, b) => {
      if (!a.series_name && !b.series_name) return 0;
      if (!a.series_name) return 1; if (!b.series_name) return -1;
      const sc = a.series_name.localeCompare(b.series_name);
      return sc !== 0 ? sc : (a.series_order||0) - (b.series_order||0);
    });
  }
  res.json(books);
});

app.get('/api/books/:id', (req, res) => {
  const rows = db.query('SELECT * FROM books WHERE id = ?', [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: 'Not found' });
  const book = parseBook(rows[0]);
  book.ratings = db.query('SELECT * FROM ratings WHERE book_id = ? ORDER BY rated_at DESC', [req.params.id]);
  res.json(book);
});

app.post('/api/books', (req, res) => {
  const { title, author, cover_url, synopsis, genres, trigger_warnings, kindle_url,
          isbn, open_library_key, published_year, page_count,
          status, series_name, series_order, recommended_by } = req.body;

  if (!title) return res.status(400).json({ error: 'title required' });
  const existing = db.query('SELECT id FROM books WHERE LOWER(title) = LOWER(?) AND LOWER(author) = LOWER(?)', [title, author||'']);
  if (existing.length) return res.status(409).json({ error: 'Book already in library', book_id: existing[0].id });

  const id = db.run(
    `INSERT INTO books (title, author, isbn, cover_url, synopsis, genres, trigger_warnings, kindle_url,
      open_library_key, published_year, page_count, status, series_name, series_order, recommended_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [title, author||'', isbn||null, cover_url||null, synopsis||'',
     JSON.stringify(genres||[]), JSON.stringify(trigger_warnings||[]),
     kindle_url||null, open_library_key||null, published_year||null, page_count||null,
     status||'finished', series_name||null, series_order||null, recommended_by||null]
  );

  const book = parseBook(db.query('SELECT * FROM books WHERE id = ?', [id])[0]);
  db.logActivity('book_added', recommended_by||null, id, title, null);
  res.status(201).json(book);
});

app.patch('/api/books/:id', (req, res) => {
  if (!db.query('SELECT id FROM books WHERE id = ?', [req.params.id]).length)
    return res.status(404).json({ error: 'Not found' });

  const fields = ['genres','trigger_warnings','synopsis','cover_url','status','series_name','series_order','recommended_by','title','author'];
  const dbInst = db.getDb();
  for (const f of fields) {
    if (req.body[f] !== undefined) {
      const val = (f==='genres'||f==='trigger_warnings') ? JSON.stringify(req.body[f]) : req.body[f];
      dbInst.run(`UPDATE books SET ${f} = ? WHERE id = ?`, [val, req.params.id]);
    }
  }
  db.persist();
  res.json(parseBook(db.query('SELECT * FROM books WHERE id = ?', [req.params.id])[0]));
});

app.delete('/api/books/:id', (req, res) => {
  const rows = db.query('SELECT title FROM books WHERE id = ?', [req.params.id]);
  if (rows.length) db.logActivity('book_removed', null, null, rows[0].title, null);
  const dbInst = db.getDb();
  dbInst.run('DELETE FROM ratings WHERE book_id = ?', [req.params.id]);
  dbInst.run('DELETE FROM books WHERE id = ?', [req.params.id]);
  db.persist();
  res.json({ ok: true });
});

// ── Ratings ──
app.post('/api/books/:id/ratings', (req, res) => {
  const { reader_name, stars, blurb } = req.body;
  if (!reader_name || !stars) return res.status(400).json({ error: 'reader_name and stars required' });
  const bookRows = db.query('SELECT title FROM books WHERE id = ?', [req.params.id]);
  if (!bookRows.length) return res.status(404).json({ error: 'Book not found' });

  const dbInst = db.getDb();
  const existing = db.query('SELECT id FROM ratings WHERE book_id = ? AND reader_name = ?', [req.params.id, reader_name]);
  if (existing.length) {
    dbInst.run("UPDATE ratings SET stars=?, blurb=?, rated_at=datetime('now') WHERE id=?", [stars, blurb||null, existing[0].id]);
  } else {
    dbInst.run('INSERT INTO ratings (book_id, reader_name, stars, blurb) VALUES (?,?,?,?)', [req.params.id, reader_name, stars, blurb||null]);
  }
  db.persist();
  db.logActivity('rating_added', reader_name, req.params.id, bookRows[0].title, `${stars} stars`);
  res.json({ ok: true });
});

app.delete('/api/ratings/:id', (req, res) => {
  db.getDb().run('DELETE FROM ratings WHERE id = ?', [req.params.id]);
  db.persist();
  res.json({ ok: true });
});

// ── Filters ──
app.get('/api/filters', (req, res) => {
  const books = db.query('SELECT genres, trigger_warnings, series_name FROM books');
  const genres = new Set(), triggers = new Set(), series = new Set();
  for (const b of books) {
    JSON.parse(b.genres||'[]').forEach(g => genres.add(g));
    JSON.parse(b.trigger_warnings||'[]').forEach(t => triggers.add(t));
    if (b.series_name) series.add(b.series_name);
  }
  res.json({ genres: [...genres].sort(), triggers: [...triggers].sort(), series: [...series].sort() });
});

// ── Stats ──
app.get('/api/stats', (req, res) => {
  const totalBooks = db.query('SELECT COUNT(*) as n FROM books')[0].n;
  const totalRatings = db.query('SELECT COUNT(*) as n FROM ratings')[0].n;
  const byStatus = db.query('SELECT status, COUNT(*) as n FROM books GROUP BY status');
  const topRated = db.query(`
    SELECT b.title, b.author, b.cover_url, ROUND(AVG(r.stars),1) as avg, COUNT(r.id) as cnt
    FROM books b JOIN ratings r ON r.book_id = b.id
    GROUP BY b.id HAVING cnt >= 1 ORDER BY avg DESC, cnt DESC LIMIT 5
  `);
  const byReader = db.query(`
    SELECT reader_name, COUNT(*) as ratings_count, ROUND(AVG(stars),1) as avg_stars
    FROM ratings GROUP BY reader_name ORDER BY ratings_count DESC
  `);
  const byGenre = db.query('SELECT genres FROM books').reduce((acc, b) => {
    JSON.parse(b.genres||'[]').forEach(g => { acc[g] = (acc[g]||0) + 1; });
    return acc;
  }, {});
  const topGenres = Object.entries(byGenre).sort((a,b)=>b[1]-a[1]).slice(0,8).map(([g,n])=>({genre:g,count:n}));

  res.json({ totalBooks, totalRatings, byStatus, topRated, byReader, topGenres });
});

// ── Activity ──
app.get('/api/activity', (req, res) => {
  res.json(db.query('SELECT * FROM activity ORDER BY created_at DESC LIMIT 50'));
});

// ── CSV Export ──
app.get('/api/export/csv', (req, res) => {
  const books = db.query(`
    SELECT b.*, ROUND(AVG(r.stars),1) as avg_rating, COUNT(r.id) as rating_count
    FROM books b LEFT JOIN ratings r ON r.book_id = b.id GROUP BY b.id ORDER BY b.title
  `).map(parseBook);

  const headers = ['Title','Author','Series','Series #','Status','Genres','Trigger Warnings','Avg Rating','# Ratings','Year','Pages','ISBN','Recommended By','Added'];
  const rows = books.map(b => [
    b.title, b.author, b.series_name||'', b.series_order||'', b.status,
    b.genres.join('; '), b.trigger_warnings.join('; '),
    b.avg_rating||'', b.rating_count||0, b.published_year||'', b.page_count||'',
    b.isbn||'', b.recommended_by||'', b.added_at,
  ]);

  const csv = [headers,...rows].map(r=>r.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
  res.setHeader('Content-Type','text/csv');
  res.setHeader('Content-Disposition','attachment; filename="family-bookshelf.csv"');
  res.send(csv);
});

// ── Fallback ──
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'frontend', 'public', 'index.html'));
});

// ── Boot ──
db.init().then(async () => {
  await loadPlugins(app, db, helpers);
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`📚 Family Bookshelf running on http://0.0.0.0:${PORT}`);
    console.log(`📦 Plugins: ${getLoadedPlugins().map(p=>p.name).join(', ') || 'none'}`);
  });
}).catch(err => { console.error('Boot failed:', err); process.exit(1); });
