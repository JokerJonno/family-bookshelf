# Building a Plugin for Family Bookshelf

Plugins are self-contained folders that drop into the `plugins/` directory. After a `docker compose down && docker compose up -d --build`, they are automatically discovered, loaded, and their UI hooks injected into the app.

---

## Plugin Structure

```
plugins/
└── my-plugin/
    ├── manifest.json   ← required: metadata & hook declarations
    ├── server.js       ← required: Express routes
    └── public/
        └── plugin.js   ← optional: frontend hooks
```

---

## manifest.json

```json
{
  "id": "my-plugin",
  "name": "My Plugin",
  "version": "1.0.0",
  "description": "What this plugin does.",
  "author": "Your Name",
  "icon": "🔌",
  "hooks": {
    "bookCard":   true,
    "bookDetail": true,
    "navTab":     false,
    "stats":      false
  },
  "navTab": {
    "label": "My Tab",
    "icon": "🔌"
  }
}
```

### Hook types

| Hook | Where it appears | What it renders |
|---|---|---|
| `bookCard` | Bottom of each book card | Small inline HTML (ratings, badges) |
| `bookDetail` | Inside the book detail modal | A full section with its own UI |
| `navTab` | New tab in the top nav | A full page |
| `stats` | Stats page | A widget card |

---

## server.js

Export an `init` function that receives `{ db, helpers, manifest }` and returns an Express Router.

```js
const { Router } = require('express');

function init({ db, helpers, manifest }) {
  // Create your tables
  helpers.getDb().run(`
    CREATE TABLE IF NOT EXISTS my_plugin_data (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      book_id INTEGER NOT NULL,
      value TEXT,
      created_at DATETIME DEFAULT (datetime('now'))
    )
  `);
  helpers.persist();

  const router = Router();

  router.get('/book/:bookId', (req, res) => {
    const rows = helpers.query(
      'SELECT * FROM my_plugin_data WHERE book_id = ?',
      [req.params.bookId]
    );
    res.json(rows);
  });

  router.post('/book/:bookId', (req, res) => {
    helpers.getDb().run(
      'INSERT INTO my_plugin_data (book_id, value) VALUES (?, ?)',
      [req.params.bookId, req.body.value]
    );
    helpers.persist();
    res.json({ ok: true });
  });

  return router;
}

module.exports = { init };
```

Your routes are mounted at `/api/plugins/YOUR_PLUGIN_ID/`.

### helpers object

| Helper | Description |
|---|---|
| `helpers.query(sql, params)` | Run a SELECT, returns array of row objects |
| `helpers.run(sql, params)` | Run INSERT/UPDATE/DELETE, returns lastInsertRowid |
| `helpers.persist()` | Write the SQLite DB to disk |
| `helpers.getDb()` | Get the raw sql.js Database instance |
| `helpers.logActivity(type, reader, bookId, title, detail)` | Add to the activity feed |

---

## public/plugin.js

Register your plugin with `window.ShelfPlugins`:

```js
(function() {
  const API = '/api/plugins/my-plugin';

  // Called once at startup — preload any data you need
  async function preload() {
    // fetch and cache data
  }

  // bookCard hook — return HTML string to inject on each book card
  function bookCard(book) {
    return `<div>Something for ${book.title}</div>`;
  }

  // bookDetail hook — receives the book object and a container element
  async function bookDetail(book, container) {
    const res = await fetch(`${API}/book/${book.id}`);
    const data = await res.json();
    container.innerHTML = `<div>Detail section for ${book.title}</div>`;
  }

  // navTab hook — receives the page container element, render your full page into it
  async function navTab(container) {
    container.innerHTML = `<div style="padding:2rem"><h2>My Plugin Page</h2></div>`;
  }

  // statsWidget hook — return HTML string for stats page widget
  async function statsWidget() {
    return `<div style="background:var(--surface);border:1px solid var(--border);border-radius:4px;padding:1.25rem;">
      <h3 style="font-family:'Playfair Display',serif;font-size:1.1rem;">My Stats</h3>
    </div>`;
  }

  // Register — only include the hooks you actually use
  window.ShelfPlugins = window.ShelfPlugins || {};
  window.ShelfPlugins['my-plugin'] = { preload, bookCard, bookDetail, navTab, statsWidget };
})();
```

### Available CSS variables

Your plugin renders inside the app and inherits all CSS variables:

```
--bg, --surface, --surface2, --border
--accent, --accent2, --accent-glow
--gold, --gold-dim
--text, --text-dim, --text-muted
--radius, --shadow
--reading, --tbr, --finished
```

Use these to match the app's look and feel, and adapt to whatever accent colour the user has set in Settings.

### Global helpers

| Global | Description |
|---|---|
| `window.toast(message, type)` | Show a toast notification. type: `'success'` or `'error'` |

---

## Installing a plugin

```bash
cd /path/to/family-bookshelf

# From a git repo
git clone https://github.com/AUTHOR/bookshelf-plugin-NAME plugins/NAME

# Or copy a local folder
cp -r my-plugin plugins/

# Restart
docker compose down && docker compose up -d --build
```

## Uninstalling a plugin

```bash
rm -rf plugins/NAME
docker compose down && docker compose up -d --build
```

The plugin's database tables remain in the SQLite file but are inert. To fully clean up, you'd need to manually drop the tables — but they don't affect the app.

---

## Naming convention

We suggest naming plugin repos `bookshelf-plugin-NAME` to make them easy to find on GitHub.

Examples:
- `bookshelf-plugin-spice-o-meter`
- `bookshelf-plugin-dnf-tracker`
- `bookshelf-plugin-trope-tracker`
- `bookshelf-plugin-reading-challenge`
