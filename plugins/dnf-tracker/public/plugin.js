/**
 * DNF Tracker Plugin
 * Registers hooks: bookCard, bookDetail, navTab
 */
(function() {
  const API = '/api/plugins/dnf-tracker';
  let dnfCounts = {};
  let reasons = [];

  async function preload() {
    try {
      const [countsRes, reasonsRes] = await Promise.all([
        fetch(`${API}/counts`),
        fetch(`${API}/reasons`),
      ]);
      dnfCounts = await countsRes.json();
      reasons = await reasonsRes.json();
    } catch(e) {}
  }

  // ── bookCard hook ── shows DNF badge if anyone DNF'd it
  function bookCard(book) {
    const count = dnfCounts[book.id];
    if (!count) return '';
    return `<div style="margin-top:0.25rem;">
      <span style="font-family:'Josefin Sans',sans-serif;font-size:0.55rem;letter-spacing:0.08em;text-transform:uppercase;
        padding:0.15rem 0.5rem;border-radius:10px;background:rgba(100,100,100,0.15);border:1px solid #444;color:#888;">
        🚫 ${count} DNF
      </span>
    </div>`;
  }

  // ── bookDetail hook ──
  async function bookDetail(book, container) {
    let entries = [];
    try {
      const res = await fetch(`${API}/book/${book.id}`);
      entries = await res.json();
    } catch(e) {}

    const activeReader = (() => { try { return localStorage.getItem('shelf_active_reader') || ''; } catch(e) { return ''; } })();

    const reasonOptions = reasons.map(r =>
      `<option value="${r}">${r}</option>`
    ).join('');

    container.innerHTML = `
      <div style="margin-bottom:1.5rem;">
        <div style="font-family:'Josefin Sans',sans-serif;font-size:0.62rem;letter-spacing:0.2em;text-transform:uppercase;
          color:var(--text-muted);margin-bottom:0.65rem;display:flex;align-items:center;gap:0.75rem;">
          🚫 DNF Log
          <span style="flex:1;height:1px;background:var(--border);display:block;"></span>
        </div>

        ${entries.length ? entries.map(e => `
          <div style="background:var(--surface2);border:1px solid var(--border);border-radius:4px;padding:0.75rem;margin-bottom:0.5rem;">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;">
              <div>
                <span style="font-family:'Josefin Sans',sans-serif;font-size:0.68rem;letter-spacing:0.12em;text-transform:uppercase;">${e.reader_name}</span>
                ${e.reason ? `<span style="font-family:'Josefin Sans',sans-serif;font-size:0.6rem;color:#888;margin-left:0.5rem;">— ${e.reason}</span>` : ''}
              </div>
              <button onclick="window._dnfDelete(${e.id})"
                style="background:none;border:none;color:var(--text-muted);cursor:pointer;font-size:0.75rem;padding:0.15rem;">✕</button>
            </div>
            ${e.stopped_at ? `<div style="font-family:'Josefin Sans',sans-serif;font-size:0.6rem;color:#666;margin-top:0.25rem;">Stopped at: ${e.stopped_at}</div>` : ''}
            ${e.notes ? `<div style="font-size:0.9rem;color:var(--text-dim);font-style:italic;margin-top:0.35rem;">"${e.notes}"</div>` : ''}
          </div>`).join('')
        : '<p style="color:var(--text-muted);font-style:italic;font-size:0.9rem;margin-bottom:0.85rem">Nobody has DNF\'d this book yet!</p>'}

        <div style="padding:0.85rem;background:var(--surface2);border:1px solid var(--border);border-radius:4px;margin-top:0.5rem;">
          <div style="font-family:'Josefin Sans',sans-serif;font-size:0.62rem;letter-spacing:0.15em;text-transform:uppercase;color:var(--text-muted);margin-bottom:0.5rem;">Log a DNF</div>
          <input type="text" id="dnfReader" value="${activeReader}" placeholder="Your name…"
            style="background:var(--bg);border:1px solid var(--border);color:var(--text);padding:0.45rem 0.75rem;
              font-family:'Crimson Pro',serif;font-size:0.95rem;border-radius:4px;width:100%;outline:none;margin-bottom:0.5rem;">
          <select id="dnfReason"
            style="background:var(--surface2);border:1px solid var(--border);color:var(--text);padding:0.45rem 0.75rem;
              font-family:'Josefin Sans',sans-serif;font-size:0.75rem;border-radius:4px;width:100%;outline:none;margin-bottom:0.5rem;appearance:none;">
            <option value="">Select a reason (optional)…</option>
            ${reasonOptions}
          </select>
          <input type="text" id="dnfStoppedAt" placeholder="Where did you stop? (e.g. Chapter 5, 30%)…"
            style="background:var(--bg);border:1px solid var(--border);color:var(--text);padding:0.45rem 0.75rem;
              font-family:'Crimson Pro',serif;font-size:0.95rem;border-radius:4px;width:100%;outline:none;margin-bottom:0.5rem;">
          <textarea id="dnfNotes" placeholder="Any notes? (optional)…" rows="2"
            style="background:var(--bg);border:1px solid var(--border);color:var(--text);padding:0.45rem 0.75rem;
              font-family:'Crimson Pro',serif;font-size:0.95rem;border-radius:4px;width:100%;outline:none;resize:vertical;margin-bottom:0.75rem;"></textarea>
          <button onclick="window._dnfSubmit(${book.id})"
            style="font-family:'Josefin Sans',sans-serif;font-size:0.68rem;letter-spacing:0.15em;text-transform:uppercase;
              padding:0.5rem 1.2rem;background:transparent;color:var(--text-dim);border:1px solid var(--border);border-radius:4px;cursor:pointer;">
            🚫 Log DNF
          </button>
        </div>
      </div>`;

    window._dnfDelete = async (id) => {
      if (!confirm('Remove this DNF entry?')) return;
      await fetch(`${API}/${id}`, { method: 'DELETE' });
      dnfCounts = await (await fetch(`${API}/counts`)).json();
      await bookDetail(book, container);
    };

    window._dnfSubmit = async (bookId) => {
      const name = document.getElementById('dnfReader')?.value?.trim();
      if (!name) return window.toast?.('Enter your name', 'error');

      await fetch(`${API}/book/${bookId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reader_name: name,
          reason: document.getElementById('dnfReason')?.value || null,
          stopped_at: document.getElementById('dnfStoppedAt')?.value?.trim() || null,
          notes: document.getElementById('dnfNotes')?.value?.trim() || null,
        })
      });

      dnfCounts = await (await fetch(`${API}/counts`)).json();
      await bookDetail(book, container);
      window.toast?.('DNF logged 🚫', 'success');
    };
  }

  // ── navTab hook ── full DNF list page rendered into the tab container
  async function navTab(container) {
    container.innerHTML = `<div style="padding:2rem;max-width:900px;margin:0 auto;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1.5rem;flex-wrap:wrap;gap:1rem;">
        <h2 style="font-family:'Playfair Display',serif;font-size:1.8rem;">🚫 DNF List</h2>
        <div style="display:flex;gap:0.5rem;flex-wrap:wrap;">
          <input type="text" id="dnfFilterReader" placeholder="Filter by reader…" oninput="window._dnfFilter()"
            style="background:var(--surface2);border:1px solid var(--border);color:var(--text);padding:0.45rem 0.75rem;
              font-family:'Crimson Pro',serif;font-size:0.9rem;border-radius:4px;outline:none;">
          <select id="dnfFilterReason" onchange="window._dnfFilter()"
            style="background:var(--surface2);border:1px solid var(--border);color:var(--text);padding:0.45rem 1.5rem 0.45rem 0.75rem;
              font-family:'Josefin Sans',sans-serif;font-size:0.7rem;border-radius:4px;outline:none;appearance:none;">
            <option value="">All reasons</option>
            ${reasons.map(r=>`<option>${r}</option>`).join('')}
          </select>
        </div>
      </div>
      <div id="dnfList"><div style="color:var(--text-muted);text-align:center;padding:3rem;font-style:italic;">Loading…</div></div>
    </div>`;

    let allEntries = [];
    try {
      const res = await fetch(`${API}`);
      allEntries = await res.json();
    } catch(e) {}

    window._dnfFilter = () => {
      const readerQ = document.getElementById('dnfFilterReader')?.value?.toLowerCase() || '';
      const reasonQ = document.getElementById('dnfFilterReason')?.value || '';
      const filtered = allEntries.filter(e =>
        (!readerQ || e.reader_name.toLowerCase().includes(readerQ)) &&
        (!reasonQ || e.reason === reasonQ)
      );
      renderDNFList(filtered);
    };

    function renderDNFList(entries) {
      const el = document.getElementById('dnfList');
      if (!entries.length) {
        el.innerHTML = '<div style="text-align:center;padding:4rem;color:var(--text-muted);font-style:italic;">No DNF entries found</div>';
        return;
      }
      el.innerHTML = entries.map(e => `
        <div style="display:flex;gap:1rem;padding:1rem;background:var(--surface);border:1px solid var(--border);border-radius:4px;margin-bottom:0.75rem;align-items:flex-start;">
          ${e.cover_url
            ? `<img src="${e.cover_url}" style="width:55px;height:82px;object-fit:cover;border-radius:2px;flex-shrink:0;" onerror="this.style.display='none'">`
            : `<div style="width:55px;height:82px;background:var(--surface2);border-radius:2px;display:flex;align-items:center;justify-content:center;font-size:1.5rem;flex-shrink:0;">📚</div>`}
          <div style="flex:1;min-width:0;">
            <div style="font-family:'Playfair Display',serif;font-size:1rem;margin-bottom:0.1rem;">${e.title}</div>
            <div style="font-family:'Josefin Sans',sans-serif;font-size:0.6rem;letter-spacing:0.1em;text-transform:uppercase;color:var(--text-muted);margin-bottom:0.4rem;">${e.author}</div>
            <div style="display:flex;flex-wrap:wrap;gap:0.4rem;align-items:center;">
              <span style="font-family:'Josefin Sans',sans-serif;font-size:0.65rem;letter-spacing:0.12em;text-transform:uppercase;padding:0.2rem 0.6rem;background:rgba(100,100,100,0.1);border:1px solid #444;border-radius:20px;color:#999;">🚫 ${e.reader_name}</span>
              ${e.reason ? `<span style="font-family:'Josefin Sans',sans-serif;font-size:0.6rem;color:#777;">${e.reason}</span>` : ''}
              ${e.stopped_at ? `<span style="font-family:'Josefin Sans',sans-serif;font-size:0.6rem;color:#666;">Stopped: ${e.stopped_at}</span>` : ''}
            </div>
            ${e.notes ? `<div style="font-size:0.9rem;color:var(--text-dim);font-style:italic;margin-top:0.35rem;">"${e.notes}"</div>` : ''}
          </div>
          <div style="font-family:'Josefin Sans',sans-serif;font-size:0.58rem;color:var(--text-muted);white-space:nowrap;">${timeAgo(e.dnf_at)}</div>
        </div>`).join('');
    }

    renderDNFList(allEntries);
  }

  function timeAgo(dt) {
    const diff = (Date.now() - new Date(dt + 'Z').getTime()) / 1000;
    if (diff < 60) return 'just now';
    if (diff < 3600) return Math.floor(diff/60) + 'm ago';
    if (diff < 86400) return Math.floor(diff/3600) + 'h ago';
    return Math.floor(diff/86400) + 'd ago';
  }

  window.ShelfPlugins = window.ShelfPlugins || {};
  window.ShelfPlugins['dnf-tracker'] = { preload, bookCard, bookDetail, navTab };
})();
