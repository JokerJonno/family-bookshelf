# 📚 The Family Shelf

A private home server web app for tracking books your family has read. Add books with automatic metadata lookup, rate them, filter by genre and trigger warnings, track reading status, and explore stats — all self-hosted with no accounts or subscriptions.

---

## Features

### Library
- **Book lookup** — Enter a title, author, or ISBN and the app fetches cover art, synopsis, genres, and trigger warnings automatically from Open Library (free, no API key needed)
- **ISBN barcode scanner** — On mobile, use your camera to scan the barcode on the back of a book and auto-fill everything
- **Star ratings & blurbs** — 1–5 stars per family member with an optional written review
- **Shared library** — Books belong to the shelf, not a user; anyone can add a book or rate any book
- **Reading status** — Mark books as Finished, Currently Reading, or Want to Read (TBR)
- **Series tracking** — Assign a series name and book number; sort and filter by series
- **Recommended by** — Note who suggested a book when adding it
- **Genres & trigger warnings** — Auto-detected from Open Library metadata, fully editable, with quick filter tags and dropdowns
- **Kindle Unlimited links** — Every book gets a direct search link to Kindle's digital store
- **Sort & search** — By recently added, top rated, A–Z, by author, or by series
- **CSV export** — Download your entire library as a spreadsheet

### Reader Profiles
- Add family member names via the profile bar at the top
- Switch between readers with one click — your name auto-fills on rating forms
- Profiles are stored in the browser (no login required)
- New names entered on rating forms are automatically added to the profile list

### Stats Dashboard
- Total books, ratings, currently reading, and TBR counts
- Top rated books with covers
- Per-reader leaderboard showing rating counts and average stars
- Genre popularity bar chart
- Library status breakdown

### Activity Feed
- A running log of every book added, every rating submitted, and every removal
- Relative timestamps (e.g. "2h ago")

---

## Quick Start (Docker)

### Prerequisites
- Docker + Docker Compose installed on your Proxmox LXC or VM

On Debian (Proxmox default), install Docker via the official repo:

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

### 1. Clone the repo

```bash
git clone https://github.com/JokerJonno/family-bookshelf.git
cd family-bookshelf
```

### 2. Build & run

```bash
docker compose up -d --build
```

The app will be available at `http://your-server-ip:3000`

### 3. Access from your local network

Point any browser on your network to `http://YOUR_SERVER_IP:3000`

To use a custom domain on your LAN (e.g. `bookshelf.home`), add an entry to your router's DNS or your Pi-hole / AdGuard if you run one.

---

## Proxmox LXC Setup (without Docker)

If you prefer running it directly in an LXC container:

```bash
# In the LXC container (Ubuntu/Debian)
apt update && apt install -y nodejs npm

cd /opt
git clone https://github.com/JokerJonno/family-bookshelf.git
cd family-bookshelf/backend
npm install --production

# Run with PM2 for auto-restart
npm install -g pm2
pm2 start server.js --name bookshelf
pm2 save
pm2 startup
```

Set `DB_PATH=/opt/family-bookshelf/data/bookshelf.db` in your environment or create a `.env` file.

---

## Updating

```bash
git pull
docker compose down
docker compose up -d --build
```

Your data is safe in the Docker volume and survives rebuilds. New database columns are added automatically on startup — no manual migration needed.

---

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | Port the server listens on |
| `DB_PATH` | `./data/bookshelf.db` | Path to SQLite database file |

---

## Data & Backups

All data is stored in a single SQLite file at the path specified by `DB_PATH`. When using Docker Compose, this is persisted in the `bookshelf-data` named volume.

**Back up your library:**
```bash
docker run --rm -v bookshelf-data:/data -v $(pwd):/backup alpine cp /data/bookshelf.db /backup/bookshelf-backup.db
```

---

## API Endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/api/books` | List all books — supports `?genre=`, `?trigger=`, `?search=`, `?sort=`, `?status=`, `?series=` |
| POST | `/api/books` | Add a book |
| GET | `/api/books/:id` | Get a single book with all ratings |
| PATCH | `/api/books/:id` | Update book metadata |
| DELETE | `/api/books/:id` | Delete a book |
| POST | `/api/books/:id/ratings` | Add or update a rating |
| DELETE | `/api/ratings/:id` | Delete a rating |
| GET | `/api/lookup?title=&author=` | Look up book info from Open Library (also accepts `?isbn=`) |
| GET | `/api/filters` | Get all unique genres, trigger warnings, and series names |
| GET | `/api/stats` | Aggregated stats for the dashboard |
| GET | `/api/activity` | Recent activity log (last 50 events) |
| GET | `/api/export/csv` | Download the full library as a CSV file |

---

## Customising Genres & Trigger Warnings

Auto-detection uses keyword matching against Open Library subject tags. To add your own mappings (e.g. "omegaverse", "reverse harem", "why choose"), edit the `GENRE_MAP` and `TRIGGER_MAP` objects in `backend/server.js` and rebuild:

```bash
docker compose up -d --build
```

You can also manually add or edit genres and trigger warnings on any book after adding it using the tag editors in the detail panel.

---

## Tech Stack

- **Backend** — Node.js + Express
- **Database** — SQLite via [sql.js](https://github.com/sql-js/sql.js) (pure WebAssembly, no native compilation)
- **Book metadata** — [Open Library API](https://openlibrary.org/developers/api) (free, no key required)
- **Barcode scanning** — ZXing.js
- **Frontend** — Vanilla JS, no framework
