const GENRE_MAP = {
  'dark romance': 'Dark Romance',
  'romance': 'Romance',
  'fantasy': 'Fantasy',
  'science fiction': 'Sci-Fi',
  'mystery': 'Mystery',
  'thriller': 'Thriller',
  'horror': 'Horror',
  'historical fiction': 'Historical Fiction',
  'contemporary': 'Contemporary',
  'young adult': 'Young Adult',
  'paranormal': 'Paranormal',
  'erotica': 'Erotica',
  'suspense': 'Suspense',
  'adventure': 'Adventure',
  'dystopian': 'Dystopian',
  'urban fantasy': 'Urban Fantasy',
  'new adult': 'New Adult',
  'mafia': 'Mafia Romance',
  'bully': 'Bully Romance',
  'omegaverse': 'Omegaverse',
  'reverse harem': 'Reverse Harem',
  'why choose': 'Why Choose',
  'monster': 'Monster Romance',
  'sports romance': 'Sports Romance',
  'small town': 'Small Town Romance',
  'enemies to lovers': 'Enemies to Lovers',
  'literary fiction': 'Literary Fiction',
};

const TRIGGER_MAP = [
  'dubious consent', 'dub-con', 'dubcon', 'non-con', 'non-consent', 'noncon',
  'abuse', 'domestic violence', 'sexual assault', 'rape',
  'violence', 'graphic violence', 'murder', 'torture',
  'death', 'suicide', 'self-harm', 'mental health',
  'addiction', 'drug use', 'kidnapping', 'captive', 'stalking',
  'age gap', 'dark themes', 'explicit content', 'manipulation', 'possessive',
  'cheating', 'infidelity', 'pregnancy', 'miscarriage', 'gaslighting',
];

function extractGenres(subjects) {
  const genres = new Set();
  const s = subjects.map(x => (x || '').toLowerCase()).join(' ');
  for (const [key, label] of Object.entries(GENRE_MAP)) {
    if (s.includes(key)) genres.add(label);
  }
  return [...genres].slice(0, 8);
}

function extractTriggerWarnings(subjects) {
  const found = new Set();
  const s = subjects.map(x => (x || '').toLowerCase()).join(' ');
  for (const t of TRIGGER_MAP) {
    if (s.includes(t)) found.add(t.replace(/\b\w/g, c => c.toUpperCase()));
  }
  return [...found];
}

module.exports = { GENRE_MAP, TRIGGER_MAP, extractGenres, extractTriggerWarnings };
