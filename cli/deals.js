#!/usr/bin/env node

// ABOUTME: Overnight Kindle deals checker — scrapes daily deals and wishlist,
// ABOUTME: scores against your taste profile, writes matches to vault digest.

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const os = require('os');

const COOKIE_DIR = path.join(os.homedir(), '.kindlogger');
const CONFIG_PATH = path.join(os.homedir(), '.kindlogger', 'deals-config.json');

// Amazon region config: each has its own deals node ID
const REGIONS = {
  'uk': { domain: 'amazon.co.uk', dealsNode: '5400977031' },
  'us': { domain: 'amazon.com', dealsNode: '2492629011' },
  'de': { domain: 'amazon.de', dealsNode: '530887031' },
  'fr': { domain: 'amazon.fr', dealsNode: '4644376031' },
  'it': { domain: 'amazon.it', dealsNode: '827188031' },
  'es': { domain: 'amazon.es', dealsNode: '827243031' },
  'ca': { domain: 'amazon.ca', dealsNode: '4851825011' },
  'jp': { domain: 'amazon.co.jp', dealsNode: '2293143051' },
  'au': { domain: 'amazon.com.au', dealsNode: '4851809051' }
};

function loadConfig() {
  // Default config
  var config = {
    region: process.env.KINDLOGGER_REGION || 'uk',
    wishlistId: process.env.KINDLOGGER_WISHLIST_ID || null,
    output: process.env.KINDLOGGER_OUTPUT || path.join(os.homedir(), 'kindle-deals-today.md'),
    monthlyNoteDir: process.env.KINDLOGGER_MONTHLY_DIR || null
  };

  // Override from config file if it exists
  if (fs.existsSync(CONFIG_PATH)) {
    try {
      var fileConfig = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
      Object.assign(config, fileConfig);
    } catch (e) {
      console.error('Warning: could not parse ' + CONFIG_PATH + ': ' + e.message);
    }
  }

  // Validate
  if (!REGIONS[config.region]) {
    console.error('Unknown region: ' + config.region + '. Supported: ' + Object.keys(REGIONS).join(', '));
    process.exit(1);
  }

  var region = REGIONS[config.region];
  config.domain = region.domain;
  config.dealsUrl = 'https://www.' + region.domain + '/b?ie=UTF8&node=' + region.dealsNode;
  config.wishlistUrl = config.wishlistId
    ? 'https://www.' + region.domain + '/hz/wishlist/ls/' + config.wishlistId + '?type=wishlist&filter=unpurchased&sort=price-asc&viewType=list'
    : null;

  return config;
}

function loadTasteProfile() {
  const paths = [
    path.join(os.homedir(), 'Library/Mobile Documents/com~apple~CloudDocs/Downloads/kindlogger-complete.json'),
    path.join(os.homedir(), 'Downloads/kindlogger-complete.json'),
    path.join(os.homedir(), 'Downloads/kindlogger-enriched.json')
  ];

  for (const p of paths) {
    if (fs.existsSync(p)) {
      const data = JSON.parse(fs.readFileSync(p, 'utf8'));
      const books = data.books || [];
      const read = books.filter(function(b) { return b.read; });

      // Build taste profile
      const genreCounts = {};
      const authorCounts = {};
      const ownedAsins = new Set();

      books.forEach(function(b) {
        if (b.asin) ownedAsins.add(b.asin);
      });

      read.forEach(function(b) {
        if (b.author) authorCounts[b.author] = (authorCounts[b.author] || 0) + 1;
        (b.genres || []).forEach(function(g) {
          genreCounts[g] = (genreCounts[g] || 0) + 1;
        });
      });

      // Top genres and authors
      var topGenres = Object.entries(genreCounts)
        .sort(function(a, b) { return b[1] - a[1]; })
        .slice(0, 15)
        .map(function(e) { return e[0]; });

      var topAuthors = Object.entries(authorCounts)
        .sort(function(a, b) { return b[1] - a[1]; })
        .slice(0, 20)
        .map(function(e) { return e[0]; });

      return { topGenres: new Set(topGenres), topAuthors: new Set(topAuthors), ownedAsins: ownedAsins };
    }
  }
  return null;
}

function parsePrice(priceStr) {
  if (!priceStr) return null;
  var m = priceStr.match(/[\d.]+/);
  return m ? parseFloat(m[0]) : null;
}

function truncateTitle(title, maxLen) {
  if (!title || title.length <= maxLen) return title;
  // Prefer to cut at ": " (subtitle boundary)
  var colonIdx = title.lastIndexOf(':', maxLen);
  if (colonIdx > 20 && colonIdx < maxLen) return title.substring(0, colonIdx);
  // Otherwise cut at last word boundary
  var spaceIdx = title.lastIndexOf(' ', maxLen);
  if (spaceIdx > 20) return title.substring(0, spaceIdx);
  return title.substring(0, maxLen);
}

// Genres/keywords that almost certainly don't match Max's taste
var NEGATIVE_KEYWORDS = [
  'vampires', 'werewolves', 'romance', 'billionaire romance', 'tiktok',
  'twilight', 'bridgerton', 'erotic', 'bdsm', 'stepbrother',
  'cozy mystery', 'regency romance', 'paranormal romance', 'chick lit',
  'self-help', 'diet book', 'cookbook', 'colouring'
];

function scoreBook(book, taste) {
  var score = 0;
  var reasons = [];

  if (taste.ownedAsins.has(book.asin)) {
    return { score: -1, reasons: ['already owned'] };
  }

  var text = (book.title + ' ' + (book.description || '')).toLowerCase();

  // Negative filter: obvious non-matches
  for (var neg of NEGATIVE_KEYWORDS) {
    if (text.indexOf(neg) > -1) {
      return { score: -1, reasons: ['not your genre'] };
    }
  }

  // Cleaned author name (strip any extra text)
  var cleanAuthor = (book.author || '').split(',')[0].trim();

  if (cleanAuthor && taste.topAuthors.has(cleanAuthor)) {
    score += 10;
    reasons.push('you read ' + cleanAuthor);
  }

  var price = parsePrice(book.price);

  // Genre keyword matching
  var genreKeywords = {
    'biography': ['biography', 'memoir', 'life of', 'autobiography', 'life and'],
    'history': ['history', 'historical', 'century', 'empire', 'war', 'ancient', 'dynasty', 'reich', 'reign'],
    'science fiction': ['sci-fi', 'science fiction', 'space opera', 'alien', 'dystopia'],
    'politics': ['politics', 'political', 'government', 'democracy', 'power', 'corruption', 'authoritarian'],
    'science': ['science', 'physics', 'biology', 'evolution', 'brain', 'quantum', 'randomness', 'mathematics'],
    'business': ['strategy', 'startup', 'business', 'economics', 'management']
  };

  var genreMatches = [];
  for (var genre in genreKeywords) {
    for (var kw of genreKeywords[genre]) {
      if (text.indexOf(kw) > -1) {
        score += 2;
        genreMatches.push(genre);
        break;
      }
    }
  }
  if (genreMatches.length > 0) {
    reasons.push(genreMatches.slice(0, 2).join('/'));
  }

  // For wishlist items, being on the wishlist IS the signal
  if (book.source === 'wishlist') {
    score += 3;
    if (price !== null && price <= 3) {
      score += 5;
    } else if (price !== null && price <= 5) {
      score += 3;
    }
  }

  // For daily deals: require at least one genre match, then boost by price
  if (book.source === 'daily-deal') {
    if (genreMatches.length === 0 && score < 10) {
      // No taste signal at all — filter out
      return { score: 0, reasons: ['no taste match'] };
    }
    if (price !== null && price <= 1) score += 3;
    else if (price !== null && price <= 2) score += 2;
    else if (price !== null && price <= 3) score += 1;
  }

  return { score: score, reasons: reasons };
}

async function scrapeWishlist(page, wishlistUrl) {
  await page.goto(wishlistUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(2000);

  return await page.evaluate(function() {
    var items = [];
    var listItems = document.querySelectorAll('li[data-itemid]');

    listItems.forEach(function(el) {
      var titleLink = el.querySelector('[id^="itemName_"]');
      var title = '';
      if (titleLink) {
        title = (titleLink.innerText || titleLink.textContent || titleLink.getAttribute('title') || '').trim();
      }
      if (!title || title.length < 3) return;

      var byEl = el.querySelector('[id^="item-byline-"]');
      var author = byEl ? byEl.textContent.replace(/^by\s+/i, '').replace(/\(Kindle Edition\)/i, '').trim() : '';

      var priceEl = el.querySelector('[id^="itemPrice_"] .a-offscreen, .a-price .a-offscreen');
      var price = priceEl ? priceEl.textContent.trim() : '';

      var href = titleLink ? titleLink.href || '' : '';
      var asinMatch = href.match(/\/dp\/(B[A-Z0-9]{9}|[0-9]{10})/);
      var asin = asinMatch ? asinMatch[1] : '';

      items.push({ title: title, author: author, price: price, asin: asin, source: 'wishlist' });
    });
    return items;
  });
}

async function scrapeDeals(page, dealsUrl) {
  await page.goto(dealsUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(3000);

  return await page.evaluate(function() {
    var items = [];
    var seen = new Set();
    var links = document.querySelectorAll('a[href*="/dp/"]');

    links.forEach(function(a) {
      var m = a.href.match(/\/dp\/(B[A-Z0-9]{9}|[0-9]{10})/);
      if (!m) return;
      var asin = m[1];
      if (seen.has(asin)) return;

      // Walk up to find a container with a valid GBP price
      var container = a;
      var price = '';
      for (var i = 0; i < 6; i++) {
        if (!container.parentElement) break;
        container = container.parentElement;
        var priceEls = container.querySelectorAll('.a-price .a-offscreen');
        for (var pi = 0; pi < priceEls.length; pi++) {
          var pt = priceEls[pi].textContent.trim();
          if (pt.match(/£[1-9]|£0\.[1-9]/)) {
            price = pt;
            break;
          }
        }
        if (price) break;
      }
      if (!price) return;

      // Prefer img alt for title (cleaner than link text)
      var img = a.querySelector('img');
      var title = '';
      if (img && img.getAttribute('alt')) {
        title = img.getAttribute('alt').trim();
      } else {
        title = a.textContent.trim();
      }

      // Deduplicate doubled text (common in Amazon's generated markup)
      if (title.length > 20) {
        var half = Math.floor(title.length / 2);
        if (title.substring(0, half) === title.substring(half)) {
          title = title.substring(0, half);
        }
      }

      if (!title || title.length < 5 || title.length > 300) return;

      // Find author — must be a name pattern, not contain title words
      var author = '';
      var candidates = container.querySelectorAll('span, div');
      for (var j = 0; j < candidates.length; j++) {
        var t = candidates[j].textContent.trim();
        if (t.length < 3 || t.length > 80) continue;
        if (t.match(/£|kindle|deal|price|save|%|edition|bestseller|hardcover|paperback|audible/i)) continue;
        if (t === title) continue;
        // Skip if text is the start of the title (common doubled-up case)
        if (title.substring(0, 20).toLowerCase() === t.substring(0, 20).toLowerCase()) continue;
        // Accept "by X" or a name-like pattern: 2-4 words all capitalised
        var isName = /^(by\s+)?([A-Z][a-z'.-]+(\s+[A-Z][a-z'.-]+){1,3})(,\s*[A-Z][a-z'.-]+(\s+[A-Z][a-z'.-]+){1,3})*$/.test(t);
        if (t.startsWith('by ') || isName) {
          if (t.length > 10) {
            var ah = Math.floor(t.length / 2);
            if (t.substring(0, ah) === t.substring(ah)) t = t.substring(0, ah);
          }
          author = t.replace(/^by\s+/i, '').trim();
          break;
        }
      }

      seen.add(asin);
      items.push({ title: title, author: author, price: price, asin: asin, source: 'daily-deal' });
    });

    return items;
  });
}

function formatMatch(m) {
  var b = m.book;
  var title = truncateTitle(b.title, 80);
  var link = b.asin ? 'https://www.amazon.co.uk/dp/' + b.asin : '';
  var titleMd = link ? '[' + title + '](' + link + ')' : title;
  var author = b.author ? ' — ' + b.author : '';
  var price = b.price ? ' · **' + b.price + '**' : '';
  var reasons = m.reasons.length > 0 ? '  \n  _' + m.reasons.join(' · ') + '_' : '';
  return '- ' + titleMd + author + price + reasons;
}

function formatDealsSection(wishlistMatches, dealMatches) {
  var lines = [];
  lines.push('### 📚 Kindle deals');
  lines.push('');

  if (wishlistMatches.length > 0) {
    lines.push('**From your wishlist:**');
    wishlistMatches.forEach(function(m) { lines.push(formatMatch(m)); });
    lines.push('');
  }

  if (dealMatches.length > 0) {
    lines.push('**Today\'s deals matching your taste:**');
    dealMatches.forEach(function(m) { lines.push(formatMatch(m)); });
    lines.push('');
  }

  if (wishlistMatches.length === 0 && dealMatches.length === 0) {
    lines.push('No deals matching your taste today.');
    lines.push('');
  }

  return lines.join('\n');
}

function formatStandaloneDigest(wishlistMatches, dealMatches, date) {
  var lines = [];
  lines.push('## Kindle Deals — ' + date);
  lines.push('');
  lines.push(formatDealsSection(wishlistMatches, dealMatches));
  return lines.join('\n');
}

// Find today's daily heading in the monthly note, or create it.
// Then insert/replace the deals section under it.
function updateMonthlyNote(monthlyPath, dealsSection, dayLabel) {
  var content = '';
  if (fs.existsSync(monthlyPath)) {
    content = fs.readFileSync(monthlyPath, 'utf8');
  } else {
    // Create skeleton if missing
    content = '#daynotes #orbit\n\n----\n\n';
  }

  // Find or create today's heading (e.g. "## 7 April")
  var dayHeadingRegex = new RegExp('^## ' + dayLabel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*$', 'm');
  var dayMatch = content.match(dayHeadingRegex);

  // Morning briefing pointer — one-line reminder of what to check this morning
  var morningPointer = '*Morning briefing: [[overnight-digest]] · [[kindle-deals-today]]*';

  if (!dayMatch) {
    // Add new day heading at the top of entries (after the front matter)
    var newDayBlock = '## ' + dayLabel + '\n\n' + morningPointer + '\n\n' + dealsSection + '\n\n';
    var insertAt = content.search(/^## /m);
    if (insertAt === -1) {
      // No existing headings — append
      content = content.trimEnd() + '\n\n' + newDayBlock;
    } else {
      content = content.substring(0, insertAt) + newDayBlock + content.substring(insertAt);
    }
    return content;
  }

  // Day heading exists — find its boundaries
  var dayStart = dayMatch.index + dayMatch[0].length;
  var nextHeadingMatch = content.substring(dayStart).match(/^## /m);
  var dayEnd = nextHeadingMatch ? dayStart + nextHeadingMatch.index : content.length;
  var daySection = content.substring(dayStart, dayEnd);

  // Ensure morning pointer exists (idempotent check)
  if (daySection.indexOf('Morning briefing:') === -1) {
    daySection = '\n\n' + morningPointer + daySection;
  }

  // Look for existing "### 📚 Kindle deals" subsection within today
  var dealsHeadingRegex = /^### 📚 Kindle deals\s*$/m;
  var dealsMatch = daySection.match(dealsHeadingRegex);

  if (dealsMatch) {
    // Replace existing deals subsection
    var dealsStart = dealsMatch.index;
    var afterDeals = daySection.substring(dealsStart + dealsMatch[0].length);
    var nextSubMatch = afterDeals.match(/^### |^## /m);
    var dealsEnd = nextSubMatch
      ? dealsStart + dealsMatch[0].length + nextSubMatch.index
      : daySection.length;
    var newDaySection = daySection.substring(0, dealsStart) + dealsSection.trimEnd() + '\n\n' + daySection.substring(dealsEnd);
    return content.substring(0, dayStart) + newDaySection + content.substring(dayEnd);
  } else {
    // Insert deals subsection right after the day heading
    var newDaySection = '\n\n' + dealsSection.trimEnd() + '\n' + daySection;
    return content.substring(0, dayStart) + newDaySection + content.substring(dayEnd);
  }
}

function getMonthlyNotePath(vaultInbox, now) {
  var year = now.getFullYear();
  var month = String(now.getMonth() + 1).padStart(2, '0');
  var monthName = now.toLocaleDateString('en-GB', { month: 'long' });
  return path.join(vaultInbox, year + '-' + month + ' ' + monthName + '.md');
}

function getDayLabel(now) {
  var day = now.getDate();
  var monthName = now.toLocaleDateString('en-GB', { month: 'long' });
  return day + ' ' + monthName;
}

async function main() {
  var config = loadConfig();
  var taste = loadTasteProfile();
  if (!taste) {
    console.error('No Kindlogger export found. Run kindlogger first.');
    process.exit(1);
  }

  console.log('Kindle Deals Checker');
  console.log('Region: ' + config.region + ' (' + config.domain + ')');
  if (!config.wishlistId) {
    console.log('No wishlist configured. Set KINDLOGGER_WISHLIST_ID or add wishlistId to ~/.kindlogger/deals-config.json');
  }
  console.log('');

  if (!fs.existsSync(COOKIE_DIR)) fs.mkdirSync(COOKIE_DIR, { recursive: true });

  var context = await chromium.launchPersistentContext(
    path.join(COOKIE_DIR, 'browser-data'),
    {
      headless: true,
      viewport: { width: 1280, height: 800 },
      args: ['--disable-blink-features=AutomationControlled']
    }
  );

  var page = await context.newPage();

  try {
    // Scrape wishlist (only if configured)
    var wishlistItems = [];
    if (config.wishlistUrl) {
      console.log('Checking wishlist...');
      try {
        wishlistItems = await scrapeWishlist(page, config.wishlistUrl);
        console.log('  Found ' + wishlistItems.length + ' wishlist items');
      } catch (e) {
        console.log('  Wishlist scrape failed: ' + e.message);
      }
    }

    // Scrape deals
    console.log('Checking daily deals...');
    var dealItems = [];
    try {
      dealItems = await scrapeDeals(page, config.dealsUrl);
      console.log('  Found ' + dealItems.length + ' deals');
    } catch (e) {
      console.log('  Deals scrape failed: ' + e.message);
    }

    await context.close();

    // Score everything
    // Wishlist: show all with price data (wishlist = already curated)
    var wishlistMatches = wishlistItems
      .map(function(b) { var s = scoreBook(b, taste); return { book: b, score: s.score, reasons: s.reasons }; })
      .filter(function(m) { return m.score > 0; })
      .sort(function(a, b) {
        var pa = parsePrice(a.book.price) || 999;
        var pb = parsePrice(b.book.price) || 999;
        return pa - pb;
      });

    // Deals: require genre match (score >= 2) to filter out random cheap junk
    var dealMatches = dealItems
      .map(function(b) { var s = scoreBook(b, taste); return { book: b, score: s.score, reasons: s.reasons }; })
      .filter(function(m) { return m.score >= 2; })
      .sort(function(a, b) { return b.score - a.score; })
      .slice(0, 10);

    console.log('');
    console.log('Wishlist matches: ' + wishlistMatches.length);
    console.log('Deal matches: ' + dealMatches.length);

    var now = new Date();
    var dateStr = now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    var dealsSection = formatDealsSection(wishlistMatches, dealMatches);

    // Write to monthly note (preferred surface)
    if (config.monthlyNoteDir) {
      if (!fs.existsSync(config.monthlyNoteDir)) {
        fs.mkdirSync(config.monthlyNoteDir, { recursive: true });
      }
      var monthlyPath = getMonthlyNotePath(config.monthlyNoteDir, now);
      var dayLabel = getDayLabel(now);
      var newContent = updateMonthlyNote(monthlyPath, dealsSection, dayLabel);
      fs.writeFileSync(monthlyPath, newContent);
      console.log('Updated monthly note: ' + monthlyPath + ' (under "## ' + dayLabel + '")');
    }

    // Also write standalone digest (for backwards compat / digest builders)
    var standaloneDigest = formatStandaloneDigest(wishlistMatches, dealMatches, dateStr);
    var outDir = path.dirname(config.output);
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(config.output, standaloneDigest);
    console.log('Written standalone: ' + config.output);

    console.log('');
    console.log(standaloneDigest);

  } catch (err) {
    console.error('Error: ' + err.message);
    await context.close();
    process.exit(1);
  }
}

main();
