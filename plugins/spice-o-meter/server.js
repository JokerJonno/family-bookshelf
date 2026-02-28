const { Router } = require('express');

function init({ db, helpers }) {
  // Create plugin table
  helpers.getDb().run(`
    CREATE TABLE IF NOT EXISTS spice_ratings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      book_id INTEGER NOT NULL,
      reader_name TEXT NOT NULL,
      chillies INTEGER NOT NULL CHECK(chillies BETWEEN 1 AND 5),
      rated_at DATETIME DEFAULT (datetime('now')),
      UNIQUE(book_id, reader_name)
    )
  `);
  helpers.persist();

  const router = Router();

  // GET avg spice for a book
  router.get('/book/:bookId', (req, res) => {
    const rows = helpers.query(
      'SELECT ROUND(AVG(chillies),1) as avg, COUNT(*) as count FROM spice_ratings WHERE book_id = ?',
      [req.params.bookId]
    );
    const ratings = helpers.query(
      'SELECT reader_name, chillies, rated_at FROM spice_ratings WHERE book_id = ? ORDER BY rated_at DESC',
      [req.params.bookId]
    );
    res.json({ avg: rows[0]?.avg || null, count: rows[0]?.count || 0, ratings });
  });

  // GET spice for multiple books at once (for grid display)
  router.get('/books', (req, res) => {
    const rows = helpers.query(
      'SELECT book_id, ROUND(AVG(chillies),1) as avg, COUNT(*) as count FROM spice_ratings GROUP BY book_id'
    );
    const map = {};
    rows.forEach(r => { map[r.book_id] = { avg: r.avg, count: r.count }; });
    res.json(map);
  });

  // POST add/update spice rating
  router.post('/book/:bookId', (req, res) => {
    const { reader_name, chillies } = req.body;
    if (!reader_name || !chillies || chillies < 1 || chillies > 5)
      return res.status(400).json({ error: 'reader_name and chillies (1-5) required' });

    const bookRows = helpers.query('SELECT id FROM books WHERE id = ?', [req.params.bookId]);
    if (!bookRows.length) return res.status(404).json({ error: 'Book not found' });

    const existing = helpers.query(
      'SELECT id FROM spice_ratings WHERE book_id = ? AND reader_name = ?',
      [req.params.bookId, reader_name]
    );

    if (existing.length) {
      helpers.getDb().run(
        "UPDATE spice_ratings SET chillies = ?, rated_at = datetime('now') WHERE id = ?",
        [chillies, existing[0].id]
      );
    } else {
      helpers.getDb().run(
        'INSERT INTO spice_ratings (book_id, reader_name, chillies) VALUES (?, ?, ?)',
        [req.params.bookId, reader_name, chillies]
      );
    }
    helpers.persist();
    res.json({ ok: true });
  });

  // GET stats - spiciest books, avg by genre
  router.get('/stats', (req, res) => {
    const spiciest = helpers.query(`
      SELECT b.title, b.author, b.cover_url, ROUND(AVG(s.chillies),1) as avg_spice, COUNT(s.id) as count
      FROM books b JOIN spice_ratings s ON s.book_id = b.id
      GROUP BY b.id ORDER BY avg_spice DESC, count DESC LIMIT 5
    `);
    const distribution = helpers.query(`
      SELECT chillies, COUNT(*) as count FROM spice_ratings GROUP BY chillies ORDER BY chillies
    `);
    res.json({ spiciest, distribution });
  });

  return router;
}

module.exports = { init };
