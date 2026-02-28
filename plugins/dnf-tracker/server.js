const { Router } = require('express');

const DNF_REASONS = [
  'Too slow', 'Not my vibe', 'Too dark', 'Not dark enough',
  'Bad writing', 'Annoying characters', 'Boring plot',
  'Triggers hit too hard', 'Too much insta-love', 'Just not feeling it',
];

function init({ db, helpers }) {
  helpers.getDb().run(`
    CREATE TABLE IF NOT EXISTS dnf_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      book_id INTEGER NOT NULL,
      reader_name TEXT NOT NULL,
      reason TEXT,
      stopped_at TEXT,
      notes TEXT,
      dnf_at DATETIME DEFAULT (datetime('now')),
      UNIQUE(book_id, reader_name)
    )
  `);
  helpers.persist();

  const router = Router();

  // GET all DNF entries (with book info)
  router.get('/', (req, res) => {
    const entries = helpers.query(`
      SELECT d.*, b.title, b.author, b.cover_url, b.genres, b.series_name
      FROM dnf_entries d JOIN books b ON b.id = d.book_id
      ORDER BY d.dnf_at DESC
    `);
    res.json(entries.map(e => ({
      ...e,
      genres: JSON.parse(e.genres || '[]'),
    })));
  });

  // GET DNF entries for a specific book
  router.get('/book/:bookId', (req, res) => {
    const entries = helpers.query(
      'SELECT * FROM dnf_entries WHERE book_id = ? ORDER BY dnf_at DESC',
      [req.params.bookId]
    );
    res.json(entries);
  });

  // GET DNF count for all books (for card badges)
  router.get('/counts', (req, res) => {
    const rows = helpers.query('SELECT book_id, COUNT(*) as count FROM dnf_entries GROUP BY book_id');
    const map = {};
    rows.forEach(r => { map[r.book_id] = r.count; });
    res.json(map);
  });

  // POST add/update DNF
  router.post('/book/:bookId', (req, res) => {
    const { reader_name, reason, stopped_at, notes } = req.body;
    if (!reader_name) return res.status(400).json({ error: 'reader_name required' });

    const bookRows = helpers.query('SELECT id, title FROM books WHERE id = ?', [req.params.bookId]);
    if (!bookRows.length) return res.status(404).json({ error: 'Book not found' });

    const existing = helpers.query(
      'SELECT id FROM dnf_entries WHERE book_id = ? AND reader_name = ?',
      [req.params.bookId, reader_name]
    );

    if (existing.length) {
      helpers.getDb().run(
        "UPDATE dnf_entries SET reason=?, stopped_at=?, notes=?, dnf_at=datetime('now') WHERE id=?",
        [reason||null, stopped_at||null, notes||null, existing[0].id]
      );
    } else {
      helpers.getDb().run(
        'INSERT INTO dnf_entries (book_id, reader_name, reason, stopped_at, notes) VALUES (?,?,?,?,?)',
        [req.params.bookId, reader_name, reason||null, stopped_at||null, notes||null]
      );
    }
    helpers.persist();
    helpers.logActivity('dnf_added', reader_name, req.params.bookId, bookRows[0].title, reason || 'No reason given');
    res.json({ ok: true });
  });

  // DELETE a DNF entry
  router.delete('/:id', (req, res) => {
    helpers.getDb().run('DELETE FROM dnf_entries WHERE id = ?', [req.params.id]);
    helpers.persist();
    res.json({ ok: true });
  });

  // GET common reasons (for UI hints)
  router.get('/reasons', (req, res) => res.json(DNF_REASONS));

  return router;
}

module.exports = { init };
