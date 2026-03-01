# 📚 The Family Shelf

A self-hosted family book tracking app with a plugin system. Track what you've read, rate books, filter by genre and trigger warnings, and extend the app with plugins — all running on your own server with no accounts or subscriptions.

---

## Features

### Core
- **Book lookup** — Auto-fetch cover art, synopsis, genres, and trigger warnings from Open Library (free, no API key)
- **ISBN barcode scanner** — Scan the barcode on the back of any book on mobile
- **Star ratings & blurbs** — 1–5 stars per family member with optional written review
- **Shared library** — Books belong to the shelf, anyone can add or rate
- **Reading status** — Finished / Currently Reading / Want to Read (TBR)
- **Series tracking** — Series name + book number, sortable and filterable
- **Recommended by** — Note who suggested a book
- **Genres & trigger warnings** — Auto-detected and manually editable, with filter tags
- **Kindle Unlimited links** — Direct search link on every book
- **Sort & search** — Recently added, top rated, A–Z, by author, by series
- **CSV export** — Full library as a spreadsheet

### Reader Profiles
- Named reader profiles (no login required)
- Switch readers with one click, stored per-browser
- Profile names auto-added when submitting ratings

### Stats Dashboard
- Book counts by status, total ratings
- Top rated books, reader leaderboard, genre chart, status breakdown
- Plugin widgets appear here automatically

### Activity Feed
- Running log of books added, ratings submitted, and DNFs
- Plugin activity types appear automatically

### Settings
- Site name, subtitle, accent colour, gold colour — live preview
- Manage readers from the settings page
- View active plugins with hook information

### Plugin System
- Drop plugin folders into `plugins/` and rebuild
- Plugins inject UI into book cards, book details, nav tabs, and the stats page
- Each plugin gets isolated DB tables and a scoped API
- See [PLUGIN_DEV.md](PLUGIN_DEV.md) for full documentation

---

## Bundled Plugins

### 🌶️ Spice-o-Meter
Rate books 1–5 chillies for heat level, independently of the star rating. Shows on book cards, detail view, and the stats page.

### 🚫 DNF Tracker
Log "Did Not Finish" entries with a reason, where you stopped, and notes. Adds a full DNF List tab to the nav.

---

## Quick Start (Docker)

### Prerequisites — Debian/Proxmox

```bash
apt update && apt install -y ca-certificates curl
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/debian/gpg -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] \
  https://download.docker.com/linux/debian bookworm stable" \
  | tee /etc/apt/sources.list.d/docker.list > /dev/null
apt update && apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
```

### Deploy

```bash
git clone https://github.com/ArchiveHunter/family-bookshelf.git
cd family-bookshelf
docker compose up -d --build
```

Open `http://YOUR_SERVER_IP:3000`

---

## Updating

```bash
git pull
docker compose down
docker compose up -d --build
```

Data is safe in the Docker volume. New database columns are added automatically on startup.

---

## Installing Plugins

```bash
# Install a plugin
git clone https://github.com/ArchiveHunter/bookshelf-plugin-NAME plugins/NAME

# Rebuild
docker compose down && docker compose up -d --build
```

See the Settings → Active Plugins section in the app for the full install command.

---

## Proxmox LXC (without Docker)

```bash
apt update && apt install -y nodejs npm
git clone https://github.com/ArchiveHunter/family-bookshelf.git /opt/family-bookshelf
cd /opt/family-bookshelf/backend
npm install --production
npm install -g pm2
DB_PATH=/opt/family-bookshelf/data/bookshelf.db pm2 start server.js --name bookshelf
pm2 save && pm2 startup
```

---

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | Port to listen on |
| `DB_PATH` | `./data/bookshelf.db` | SQLite database path |

---

## Backup

```bash
docker run --rm -v bookshelf-data:/data -v $(pwd):/backup alpine \
  cp /data/bookshelf.db /backup/bookshelf-backup.db
```

---

## API Reference

| Method | Path | Description |
|---|---|---|
| GET | `/api/books` | List books — `?genre=`, `?trigger=`, `?search=`, `?sort=`, `?status=`, `?series=` |
| POST | `/api/books` | Add a book |
| GET | `/api/books/:id` | Single book with all ratings |
| PATCH | `/api/books/:id` | Update book fields |
| DELETE | `/api/books/:id` | Delete a book |
| POST | `/api/books/:id/ratings` | Add or update a rating |
| DELETE | `/api/ratings/:id` | Delete a rating |
| GET | `/api/lookup` | Look up book info — `?title=`, `?author=`, `?isbn=` |
| GET | `/api/filters` | All genres, trigger warnings, and series names |
| GET | `/api/stats` | Aggregated stats |
| GET | `/api/activity` | Recent activity log |
| GET | `/api/export/csv` | Download library as CSV |
| GET | `/api/settings` | App settings |
| PATCH | `/api/settings` | Update settings |
| GET | `/api/readers` | Reader list |
| POST | `/api/readers` | Add a reader |
| DELETE | `/api/readers/:name` | Remove a reader |
| GET | `/api/plugins` | Active plugin manifests |
| * | `/api/plugins/:id/*` | Plugin-specific routes |

---

## Tech Stack

- **Backend** — Node.js + Express
- **Database** — SQLite via [sql.js](https://github.com/sql-js/sql.js) (pure WebAssembly, no native compilation)
- **Book data** — [Open Library API](https://openlibrary.org/developers/api)
- **Barcode scanning** — ZXing.js
- **Frontend** — Vanilla JS, no framework
