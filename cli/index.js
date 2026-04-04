#!/usr/bin/env node

// ABOUTME: Main entry point for Kindlogger CLI (v2).
// ABOUTME: One command to export library, scrape highlights, enrich, and merge.

const { chromium } = require('playwright');
const { scrapeLibrary } = require('./lib/scraper');
const { scrapeHighlights } = require('./lib/highlights');
const { enrichBooks } = require('./lib/enrich');
const fs = require('fs');
const path = require('path');
const os = require('os');

const COOKIE_DIR = path.join(os.homedir(), '.kindlogger');
const REGIONS = {
  'uk': { domain: 'amazon.co.uk', reader: 'read.amazon.co.uk' },
  'us': { domain: 'amazon.com', reader: 'read.amazon.com' },
  'de': { domain: 'amazon.de', reader: 'lesen.amazon.de' },
  'fr': { domain: 'amazon.fr', reader: 'lire.amazon.fr' },
  'it': { domain: 'amazon.it', reader: 'leggi.amazon.it' },
  'es': { domain: 'amazon.es', reader: 'leer.amazon.es' },
  'ca': { domain: 'amazon.ca', reader: 'read.amazon.ca' },
  'jp': { domain: 'amazon.co.jp', reader: 'read.amazon.co.jp' },
  'in': { domain: 'amazon.in', reader: 'read.amazon.in' },
  'au': { domain: 'amazon.com.au', reader: 'read.amazon.com.au' }
};

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {
    region: 'uk',
    skipHighlights: false,
    skipEnrich: false,
    output: 'kindlogger-complete.json'
  };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--region' && args[i + 1]) {
      opts.region = args[++i];
    } else if (args[i] === '--skip-highlights') {
      opts.skipHighlights = true;
    } else if (args[i] === '--skip-enrich') {
      opts.skipEnrich = true;
    } else if (args[i] === '--output' && args[i + 1]) {
      opts.output = args[++i];
    } else if (args[i] === '--help' || args[i] === '-h') {
      console.log('Usage: kindlogger [options]');
      console.log('');
      console.log('Options:');
      console.log('  --region <code>      Amazon region (default: uk)');
      console.log('                       Options: ' + Object.keys(REGIONS).join(', '));
      console.log('  --skip-highlights    Skip highlight scraping');
      console.log('  --skip-enrich        Skip Open Library enrichment');
      console.log('  --output <file>      Output filename (default: kindlogger-complete.json)');
      console.log('  --help               Show this help');
      process.exit(0);
    }
  }

  if (!REGIONS[opts.region]) {
    console.error('Unknown region: ' + opts.region);
    console.error('Available: ' + Object.keys(REGIONS).join(', '));
    process.exit(1);
  }

  return opts;
}

async function waitForLogin(page, expectedDomain) {
  // Check if already logged in by looking for the content list
  const url = page.url();
  if (url.includes('contentlist') || url.includes(expectedDomain + '/hz/mycd')) {
    return true;
  }

  console.log('');
  console.log('Please log in to Amazon in the browser window.');
  console.log('The script will continue automatically once you are logged in.');
  console.log('');

  // Wait for redirect back to content page (up to 5 minutes for login)
  try {
    await page.waitForURL(function(url) {
      return url.href.includes('contentlist') || url.href.includes('/hz/mycd');
    }, { timeout: 300000 });
    return true;
  } catch (e) {
    console.error('Login timed out after 5 minutes.');
    return false;
  }
}

async function main() {
  const opts = parseArgs();
  const region = REGIONS[opts.region];
  const contentUrl = 'https://www.' + region.domain + '/hz/mycd/digital-console/contentlist/booksAll/dateDsc/';
  const notebookUrl = 'https://' + region.reader + '/notebook';

  console.log('');
  console.log('Kindlogger v2.0');
  console.log('Region: ' + opts.region + ' (' + region.domain + ')');
  console.log('');

  // Launch browser with persistent context (keeps cookies between runs)
  if (!fs.existsSync(COOKIE_DIR)) fs.mkdirSync(COOKIE_DIR, { recursive: true });

  const context = await chromium.launchPersistentContext(
    path.join(COOKIE_DIR, 'browser-data'),
    {
      headless: false,
      viewport: { width: 1280, height: 800 },
      args: ['--disable-blink-features=AutomationControlled']
    }
  );

  const page = await context.newPage();

  try {
    // Step 1: Library export
    console.log('Step 1: Exporting library...');
    await page.goto(contentUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

    const loggedIn = await waitForLogin(page, region.domain);
    if (!loggedIn) {
      await context.close();
      process.exit(1);
    }

    const books = await scrapeLibrary(page, contentUrl);
    const readCount = books.filter(function(b) { return b.read; }).length;
    console.log('Library: ' + books.length + ' books (' + readCount + ' read)');
    console.log('');

    // Step 2: Highlights
    let highlightBooks = [];
    if (!opts.skipHighlights) {
      console.log('Step 2: Scraping highlights...');
      highlightBooks = await scrapeHighlights(page, notebookUrl);
      console.log('');
    } else {
      console.log('Step 2: Skipping highlights (--skip-highlights)');
      console.log('');
    }

    // Done with browser
    await context.close();

    // Step 3: Enrichment
    let enrichedCount = 0;
    if (!opts.skipEnrich) {
      console.log('Step 3: Enriching from Open Library...');
      enrichedCount = await enrichBooks(books);
      console.log('');
    } else {
      console.log('Step 3: Skipping enrichment (--skip-enrich)');
      console.log('');
    }

    // Step 4: Merge highlights into books
    if (highlightBooks.length > 0) {
      console.log('Step 4: Merging highlights...');
      const hlByAsin = {};
      const hlByTitle = {};
      for (const hb of highlightBooks) {
        if (hb.asin) hlByAsin[hb.asin] = hb.highlights;
        if (hb.title) hlByTitle[hb.title.toLowerCase()] = hb.highlights;
      }

      let booksWithHighlights = 0;
      let totalHighlights = 0;
      for (const book of books) {
        const hl = hlByAsin[book.asin] || hlByTitle[(book.title || '').toLowerCase()];
        if (hl) {
          book.highlights = hl;
          booksWithHighlights++;
          totalHighlights += hl.length;
        }
      }
      console.log('  ' + booksWithHighlights + ' books with highlights (' + totalHighlights + ' total)');
      console.log('');
    }

    // Build output
    const output = {
      kindlogger: {
        version: '2.0.0',
        exported: new Date().toISOString(),
        region: region.domain,
        total: books.length,
        read: readCount,
        unread: books.length - readCount
      },
      books: books
    };

    if (enrichedCount > 0) {
      output.kindlogger.enriched_count = enrichedCount;
      output.kindlogger.enrichment_source = 'Open Library (openlibrary.org)';
    }
    if (highlightBooks.length > 0) {
      output.kindlogger.books_with_highlights = books.filter(function(b) { return b.highlights; }).length;
      output.kindlogger.total_highlights = books.reduce(function(sum, b) { return sum + (b.highlights ? b.highlights.length : 0); }, 0);
    }

    fs.writeFileSync(opts.output, JSON.stringify(output, null, 2));

    console.log('='.repeat(50));
    console.log('DONE: ' + opts.output);
    console.log('  ' + books.length + ' books');
    if (enrichedCount > 0) console.log('  ' + enrichedCount + ' enriched');
    if (highlightBooks.length > 0) {
      console.log('  ' + output.kindlogger.books_with_highlights + ' with highlights');
    }
    console.log('='.repeat(50));

  } catch (err) {
    console.error('Error: ' + err.message);
    await context.close();
    process.exit(1);
  }
}

main();
