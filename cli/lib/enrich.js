// ABOUTME: Enriches books with metadata from the Open Library API.
// ABOUTME: Adds genres, page counts, publication years, and descriptions via title+author search.

const https = require('https');
const http = require('http');

const USER_AGENT = 'Kindlogger/2.0 (https://github.com/maxtattonbrown/kindlogger)';
const RATE_LIMIT_DELAY = 350;

const SKIP_SUBJECTS = new Set([
  'fiction', 'in library', 'accessible book', 'protected daisy',
  'lending library', 'large type books', 'english language',
  'english fiction', 'open library staff picks', 'literature',
  'general', 'fiction, general', 'reading level-grade 11',
  'reading level-grade 12', "children's fiction"
]);

function sleep(ms) {
  return new Promise(function(r) { setTimeout(r, ms); });
}

function fetchJson(url) {
  return new Promise(function(resolve) {
    const mod = url.startsWith('https') ? https : http;
    const req = mod.get(url, { headers: { 'User-Agent': USER_AGENT }, timeout: 10000 }, function(res) {
      let data = '';
      res.on('data', function(chunk) { data += chunk; });
      res.on('end', function() {
        try { resolve(JSON.parse(data)); }
        catch (e) { resolve(null); }
      });
    });
    req.on('error', function() { resolve(null); });
    req.on('timeout', function() { req.destroy(); resolve(null); });
  });
}

function cleanSubjects(subjects) {
  const filtered = [];
  for (const s of subjects) {
    const low = s.toLowerCase();
    if (SKIP_SUBJECTS.has(low)) continue;
    if (/^nyt:/.test(low)) continue;
    if (/^fiction,\s/.test(low)) continue;
    if (s.length < 3 || s.length > 50) continue;
    filtered.push(s);
  }
  return filtered.slice(0, 5);
}

async function enrichBook(book) {
  const title = book.title || '';
  const author = book.author || '';
  if (!title) return book;

  // Clean title for search
  const cleanTitle = title.split(':')[0].trim().replace(/\s*\([^)]*\)\s*$/, '');
  const params = new URLSearchParams({
    title: cleanTitle,
    author: author,
    limit: '1',
    fields: 'key,title,author_name,first_publish_year,subject,number_of_pages_median'
  });

  const searchUrl = 'https://openlibrary.org/search.json?' + params.toString();
  const data = await fetchJson(searchUrl);
  await sleep(RATE_LIMIT_DELAY);

  if (!data || !data.numFound || data.numFound === 0) return book;

  const result = data.docs[0];
  const enriched = Object.assign({}, book);

  const subjects = result.subject || [];
  if (subjects.length > 0) {
    const genres = cleanSubjects(subjects);
    if (genres.length > 0) enriched.genres = genres;
  }

  if (result.number_of_pages_median) enriched.pages = result.number_of_pages_median;
  if (result.first_publish_year) enriched.published = result.first_publish_year;

  // Fetch work for description
  if (result.key) {
    const work = await fetchJson('https://openlibrary.org' + result.key + '.json');
    await sleep(RATE_LIMIT_DELAY);
    if (work) {
      let desc = work.description;
      if (desc && typeof desc === 'object') desc = desc.value || '';
      if (typeof desc === 'string' && desc.length > 10) {
        if (desc.length > 500) desc = desc.substring(0, 497) + '...';
        enriched.description = desc;
      }
    }
  }

  return enriched;
}

async function enrichBooks(books) {
  const total = books.length;
  let enrichedCount = 0;

  console.log('Enriching ' + total + ' books from Open Library...');
  console.log('Estimated time: ' + Math.round(total * 0.7 / 60) + ' minutes');

  for (let i = 0; i < books.length; i++) {
    books[i] = await enrichBook(books[i]);
    const hasNew = books[i].genres || books[i].pages || books[i].published || books[i].description;
    if (hasNew) enrichedCount++;

    if ((i + 1) % 25 === 0 || i === total - 1) {
      const pct = Math.round(((i + 1) / total) * 100);
      console.log('  ' + (i + 1) + '/' + total + ' (' + pct + '%) — ' + enrichedCount + ' enriched');
    }
  }

  console.log('Enrichment done: ' + enrichedCount + '/' + total + ' matched');
  return enrichedCount;
}

module.exports = { enrichBooks };
