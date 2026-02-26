# 📚 The Family Shelf

A private home server web app for tracking books your family has read, with star ratings, blurbs, genre filters, and trigger warning filters.

## Features

- **Book lookup** — Enter title + author, the app fetches cover art, synopsis, genres, and trigger warnings automatically from Open Library (free, no API key needed)
- **Star ratings** — 1–5 stars per family member, plus an optional blurb
- **Shared library** — Books belong to the family shelf, not a user; anyone can rate any book
- **Genres & trigger warnings** — Auto-detected from Open Library metadata, with quick filter tags and dropdowns
- **Kindle Unlimited links** — Every book gets a direct search link to Kindle's digital store
- **Sort & search** — By recently added, top rated, or A–Z

---

## Quick Start (Docker)

### Prerequisites
- Docker + Docker Compose installed on your Proxmox LXC or VM

### 1. Clone / copy the project to your server

```bash
scp -r family-bookshelf/ user@your-server:~/
# or git clone if you push it to a repo
```

### 2. Build & run

```bash
cd family-bookshelf
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
# copy project files here

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

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | Port the server listens on |
| `DB_PATH` | `./data/bookshelf.db` | Path to SQLite database file |

---

## Data

All data is stored in a single SQLite file at the path specified by `DB_PATH`. When using Docker Compose, this is persisted in the `bookshelf-data` named volume.

**To back up your data:**
```bash
docker run --rm -v bookshelf-data:/data -v $(pwd):/backup alpine cp /data/bookshelf.db /backup/bookshelf-backup.db
```

---

## Updating

```bash
docker compose down
docker compose up -d --build
```

Your data is safe in the volume and survives rebuilds.

---

## API Endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/api/books` | List all books (supports `?genre=`, `?trigger=`, `?search=`, `?sort=`) |
| POST | `/api/books` | Add a book |
| GET | `/api/books/:id` | Get single book with all ratings |
| PATCH | `/api/books/:id` | Update book metadata |
| DELETE | `/api/books/:id` | Delete a book |
| POST | `/api/books/:id/ratings` | Add or update a rating |
| DELETE | `/api/ratings/:id` | Delete a rating |
| GET | `/api/lookup?title=&author=` | Look up book info from Open Library |
| GET | `/api/filters` | Get all unique genres and triggers |

---

## Customising Genres & Trigger Warnings

The auto-detection uses keyword matching against Open Library subject tags. To add your own mappings, edit the `GENRE_MAP` and `TRIGGER_MAP` objects in `backend/server.js`.

You can also manually add/edit genres and trigger warnings on any book after adding it — just use the edit tags in the book detail panel.
