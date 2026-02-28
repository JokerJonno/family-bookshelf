/**
 * Spice-o-Meter Plugin
 * Registers hooks: bookCard, bookDetail, stats
 */
(function() {
  const API = '/api/plugins/spice-o-meter';
  let spiceCache = {};

  // ── Preload spice data for all books ──
  async function preload() {
    try {
      const res = await fetch(`${API}/books`);
      spiceCache = await res.json();
    } catch(e) {}
  }

  // ── Render chillies ──
  function chilliesHTML(avg, size = 'sm') {
    const filled = Math.round(avg || 0);
    const fontSize = size === 'lg' ? '1.3rem' : '0.8rem';
    return `<span style="font-size:${fontSize};letter-spacing:1px">${
      [1,2,3,4,5].map(i => `<span style="opacity:${i<=filled?'1':'0.2'}">🌶️</span>`).join('')
    }</span>`;
  }

  // ── bookCard hook ── injected below the star rating on each card
  function bookCard(book) {
    const data = spiceCache[book.id];
    if (!data || !data.avg) return `<div style="height:18px"></div>`;
    return `<div style="margin-top:0.25rem;display:flex;align-items:center;gap:0.3rem;">
      ${chilliesHTML(data.avg)}
      <span style="font-family:'Josefin Sans',sans-serif;font-size:0.55rem;color:var(--text-muted)">${data.avg} spice</span>
    </div>`;
  }

  // ── bookDetail hook ── injected into the book detail modal
  async function bookDetail(book, container) {
    let data = { avg: null, count: 0, ratings: [] };
    try {
      const res = await fetch(`${API}/book/${book.id}`);
      data = await res.json();
    } catch(e) {}

    const activeReader = (() => { try { return localStorage.getItem('shelf_active_reader') || ''; } catch(e) { return ''; } })();

    container.innerHTML = `
      <div style="margin-bottom:1.5rem;">
        <div style="font-family:'Josefin Sans',sans-serif;font-size:0.62rem;letter-spacing:0.2em;text-transform:uppercase;
          color:var(--text-muted);margin-bottom:0.65rem;display:flex;align-items:center;gap:0.75rem;">
          Spice Level
          <span style="flex:1;height:1px;background:var(--border);display:block;"></span>
        </div>

        ${data.avg ? `
          <div style="display:flex;align-items:center;gap:0.75rem;padding:0.65rem;background:var(--surface2);border:1px solid var(--border);border-radius:4px;margin-bottom:0.85rem;">
            ${chilliesHTML(data.avg, 'lg')}
            <div>
              <div style="font-family:'Playfair Display',serif;font-size:1.2rem;color:#e74;">${data.avg} / 5</div>
              <div style="font-family:'Josefin Sans',sans-serif;font-size:0.6rem;letter-spacing:0.1em;text-transform:uppercase;color:var(--text-muted)">${data.count} rating${data.count!==1?'s':''}</div>
            </div>
          </div>` : '<p style="color:var(--text-muted);font-style:italic;font-size:0.9rem;margin-bottom:0.85rem">No spice ratings yet</p>'}

        ${data.ratings.map(r => `
          <div style="display:flex;justify-content:space-between;align-items:center;padding:0.4rem 0;border-bottom:1px solid var(--border);">
            <span style="font-family:'Josefin Sans',sans-serif;font-size:0.65rem;letter-spacing:0.12em;text-transform:uppercase;">${r.reader_name}</span>
            ${chilliesHTML(r.chillies)}
          </div>`).join('')}

        <div style="margin-top:1rem;padding:0.85rem;background:var(--surface2);border:1px solid var(--border);border-radius:4px;">
          <div style="font-family:'Josefin Sans',sans-serif;font-size:0.62rem;letter-spacing:0.15em;text-transform:uppercase;color:var(--text-muted);margin-bottom:0.5rem;">Rate the Spice</div>
          <div style="margin-bottom:0.5rem;">
            <input type="text" id="spiceReader" placeholder="Your name…" value="${activeReader}"
              style="background:var(--bg);border:1px solid var(--border);color:var(--text);padding:0.45rem 0.75rem;font-family:'Crimson Pro',serif;font-size:0.95rem;border-radius:4px;width:100%;outline:none;margin-bottom:0.5rem;">
          </div>
          <div style="display:flex;gap:6px;margin-bottom:0.75rem;" id="spicePicker">
            ${[1,2,3,4,5].map(i => `<span data-val="${i}" onclick="window._spiceSelect(${i})"
              style="font-size:1.6rem;cursor:pointer;opacity:0.3;transition:opacity 0.1s,transform 0.1s;">🌶️</span>`).join('')}
          </div>
          <button onclick="window._spiceSubmit(${book.id})"
            style="font-family:'Josefin Sans',sans-serif;font-size:0.68rem;letter-spacing:0.15em;text-transform:uppercase;
              padding:0.5rem 1.2rem;background:#c0392b;color:#fff;border:none;border-radius:4px;cursor:pointer;">
            Save Spice Rating
          </button>
        </div>
      </div>`;

    let selectedChillies = 0;

    window._spiceSelect = (n) => {
      selectedChillies = n;
      document.querySelectorAll('#spicePicker span').forEach((s, i) => {
        s.style.opacity = i < n ? '1' : '0.3';
        s.style.transform = i < n ? 'scale(1.1)' : 'scale(1)';
      });
    };

    window._spiceSubmit = async (bookId) => {
      const name = document.getElementById('spiceReader')?.value?.trim();
      if (!name) return window.toast?.('Enter your name', 'error');
      if (!selectedChillies) return window.toast?.('Pick a spice level', 'error');

      await fetch(`${API}/book/${bookId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reader_name: name, chillies: selectedChillies })
      });

      // Refresh cache and re-render
      spiceCache = (await (await fetch(`${API}/books`)).json());
      await bookDetail(book, container);
      window.toast?.('Spice rating saved! 🌶️', 'success');
    };
  }

  // ── stats hook ── returns HTML for stats page widget
  async function statsWidget() {
    let data = { spiciest: [], distribution: [] };
    try {
      const res = await fetch(`${API}/stats`);
      data = await res.json();
    } catch(e) {}

    const dist = data.distribution || [];
    const maxDist = Math.max(...dist.map(d => d.count), 1);

    return `
      <div style="background:var(--surface);border:1px solid var(--border);border-radius:4px;padding:1.25rem;">
        <h3 style="font-family:'Playfair Display',serif;font-size:1.1rem;margin-bottom:1rem;color:var(--text-dim);">🌶️ Spice-o-Meter</h3>

        <div style="margin-bottom:1rem;">
          <div style="font-family:'Josefin Sans',sans-serif;font-size:0.62rem;letter-spacing:0.12em;text-transform:uppercase;color:var(--text-muted);margin-bottom:0.5rem;">Heat Distribution</div>
          ${dist.map(d => `
            <div style="display:flex;align-items:center;gap:0.6rem;margin-bottom:0.3rem;">
              <span style="font-size:0.75rem;width:80px">${'🌶️'.repeat(d.chillies)}</span>
              <div style="flex:1;height:8px;background:var(--surface2);border-radius:4px;overflow:hidden;">
                <div style="width:${Math.round(d.count/maxDist*100)}%;height:100%;background:linear-gradient(90deg,#8b1a1a,#e74c3c);border-radius:4px;"></div>
              </div>
              <span style="font-family:'Josefin Sans',sans-serif;font-size:0.6rem;color:var(--text-muted);width:20px">${d.count}</span>
            </div>`).join('') || '<p style="color:var(--text-muted);font-style:italic;font-size:0.85rem">No ratings yet</p>'}
        </div>

        ${data.spiciest?.length ? `
          <div style="font-family:'Josefin Sans',sans-serif;font-size:0.62rem;letter-spacing:0.12em;text-transform:uppercase;color:var(--text-muted);margin-bottom:0.5rem;">Spiciest Books</div>
          ${data.spiciest.map(b => `
            <div style="display:flex;align-items:center;justify-content:space-between;padding:0.4rem 0;border-bottom:1px solid var(--border);">
              <span style="font-family:'Playfair Display',serif;font-size:0.9rem;">${b.title}</span>
              <span>${chilliesHTML(b.avg_spice)}</span>
            </div>`).join('')}` : ''}
      </div>`;
  }

  // ── Register with core ──
  window.ShelfPlugins = window.ShelfPlugins || {};
  window.ShelfPlugins['spice-o-meter'] = { preload, bookCard, bookDetail, statsWidget };
})();
