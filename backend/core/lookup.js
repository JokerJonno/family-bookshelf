const fetch = require('node-fetch');
const { extractGenres, extractTriggerWarnings } = require('./genres');

async function lookupBook(titleOrIsbn, author = '') {
  // ISBN path
  if (/^[0-9]{10,13}$/.test(titleOrIsbn.replace(/-/g, ''))) {
    const isbn = titleOrIsbn.replace(/-/g, '');
    try {
      const res = await fetch(
        `https://openlibrary.org/api/books?bibkeys=ISBN:${isbn}&format=json&jscmd=data`,
        { timeout: 8000 }
      );
      const data = await res.json();
      const key = `ISBN:${isbn}`;
      if (data[key]) {
        const b = data[key];
        const subjects = b.subjects ? b.subjects.map(s => s.name || s) : [];
        return {
          title: b.title,
          author: b.authors ? b.authors[0].name : '',
          isbn,
          cover_url: b.cover ? b.cover.large || b.cover.medium : null,
          synopsis: b.notes || '',
          genres: extractGenres(subjects),
          trigger_warnings: extractTriggerWarnings(subjects),
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
      let synopsis = '', genres = [], triggerWarnings = [];

      if (book.key) {
        try {
          const workRes = await fetch(`https://openlibrary.org${book.key}.json`, { timeout: 6000 });
          const workData = await workRes.json();
          if (workData.description) {
            synopsis = typeof workData.description === 'string'
              ? workData.description
              : workData.description.value || '';
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
        title: book.title || titleOrIsbn,
        author: book.author_name ? book.author_name[0] : author,
        isbn: book.isbn ? book.isbn[0] : null,
        cover_url: book.cover_i ? `https://covers.openlibrary.org/b/id/${book.cover_i}-L.jpg` : null,
        synopsis, genres, trigger_warnings: triggerWarnings,
        kindle_url: `https://www.amazon.com/s?k=${encodeURIComponent(titleOrIsbn + ' ' + author)}&i=digital-text`,
        open_library_key: book.key,
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

module.exports = { lookupBook };
