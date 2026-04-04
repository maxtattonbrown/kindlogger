// ================================================
// Kindle Library Exporter
// Exports all books from Amazon's "Manage Your Content" page
// Run this in your browser console while on:
// https://www.amazon.co.uk/hz/mycd/digital-console/contentlist/booksAll/dateDsc/
// (Also works on amazon.com and other regional Amazon sites)
// ================================================
(async function() {
  var MAX_WAIT_FOR_CONTENT = 15000;
  var RETRY_DELAYS = [3000, 5000];

  var sleep = function(ms) { return new Promise(function(r) { setTimeout(r, ms); }); };
  var books = [];
  var seen = new Set();

  var TITLE_SELECTOR = '[id^="content-title-"], .digital_entity_title, a[id*="title"]';
  var AUTHOR_SELECTOR = '[id^="content-author-"], .information_row';
  var FALLBACK_ROW_SELECTOR = '[class*="ListItem"], [class*="contentRow"]';
  var FALLBACK_TITLE_SELECTOR = '[class*="title"], [class*="Title"]';
  var FALLBACK_AUTHOR_SELECTOR = '[class*="author"], [class*="Author"]';

  function getFirstTitle() {
    var rows = document.querySelectorAll("tr");
    for (var i = 0; i < rows.length; i++) {
      var titleEl = rows[i].querySelector(TITLE_SELECTOR);
      if (titleEl) return titleEl.textContent.trim();
    }
    var items = document.querySelectorAll(FALLBACK_ROW_SELECTOR);
    for (var j = 0; j < items.length; j++) {
      var te = items[j].querySelector(FALLBACK_TITLE_SELECTOR);
      if (te && te.textContent.trim().length > 2) return te.textContent.trim();
    }
    return null;
  }

  function cleanAuthor(text) {
    return text.replace(/^by\s+/i, "").trim();
  }

  function scrape() {
    var added = 0;
    var rows = document.querySelectorAll("tr");
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      var titleEl = row.querySelector(TITLE_SELECTOR);
      if (!titleEl) continue;
      var title = titleEl.textContent.trim();
      if (!title || title.length < 2 || seen.has(title.toLowerCase())) continue;
      seen.add(title.toLowerCase());
      var authorEl = row.querySelector(AUTHOR_SELECTOR);
      var author = authorEl ? cleanAuthor(authorEl.textContent) : "";
      books.push({ title: title, author: author });
      added++;
    }
    if (added === 0) {
      document.querySelectorAll(FALLBACK_ROW_SELECTOR).forEach(function(item) {
        var te = item.querySelector(FALLBACK_TITLE_SELECTOR);
        var title = te ? te.textContent.trim() : null;
        if (!title || title.length < 2 || title.length > 300 || seen.has(title.toLowerCase())) return;
        if (/^(select|action|title|author|date|show|filter)/i.test(title)) return;
        seen.add(title.toLowerCase());
        var ae = item.querySelector(FALLBACK_AUTHOR_SELECTOR);
        var author = ae ? cleanAuthor(ae.textContent) : "";
        books.push({ title: title, author: author });
        added++;
      });
    }
    return added;
  }

  function getActivePage() {
    var el = document.querySelector("#pagination a.page-item.active");
    return el ? parseInt(el.textContent.trim(), 10) : null;
  }

  function getTotalPages() {
    var max = 1;
    var items = document.querySelectorAll("#pagination a.page-item");
    for (var i = 0; i < items.length; i++) {
      var n = parseInt(items[i].textContent.trim(), 10);
      if (n > max) max = n;
    }
    return max;
  }

  async function waitForNewContent(oldFirstTitle, targetPage) {
    var elapsed = 0;
    while (elapsed < MAX_WAIT_FOR_CONTENT) {
      var currentPage = getActivePage();
      var currentTitle = getFirstTitle();
      if (currentPage === targetPage && currentTitle && currentTitle !== oldFirstTitle) return true;
      await sleep(500);
      elapsed += 500;
    }
    // Page number changed but content might be the same (rare duplicate titles)
    return getActivePage() === targetPage;
  }

  function findPageButton(targetPage) {
    return document.querySelector("#page-" + targetPage) || document.querySelector("#page-RIGHT_PAGE");
  }

  async function clickNextPage(currentPage) {
    var targetPage = currentPage + 1;
    var btn = findPageButton(targetPage);
    if (!btn) {
      // Pagination may not have rendered yet
      await sleep(3000);
      btn = findPageButton(targetPage);
      if (!btn) return false;
    }
    btn.click();
    return true;
  }

  async function scrapeWithRetry(page) {
    window.scrollTo(0, document.body.scrollHeight);
    await sleep(800);

    var added = scrape();
    for (var r = 0; r < RETRY_DELAYS.length && added === 0; r++) {
      console.log("  Page " + page + ": retrying in " + (RETRY_DELAYS[r] / 1000) + "s...");
      await sleep(RETRY_DELAYS[r]);
      window.scrollTo(0, document.body.scrollHeight);
      await sleep(500);
      added = scrape();
    }
    return added;
  }

  var totalPages = getTotalPages();
  var currentPage = getActivePage() || 1;
  var failures = 0;
  console.log("Kindle Exporter: scanning " + totalPages + " pages...");

  for (var p = currentPage; p <= totalPages; p++) {
    var added = await scrapeWithRetry(p);
    console.log("Page " + p + "/" + totalPages + ": +" + added + " (total: " + books.length + ")");

    if (added === 0) {
      failures++;
      if (failures >= 5) {
        console.log("Too many empty pages. Downloading what we have.");
        break;
      }
    } else {
      failures = 0;
    }

    if (p >= totalPages) break;

    var oldFirstTitle = getFirstTitle();
    var clicked = await clickNextPage(p);
    if (!clicked) {
      console.log("Could not find next page button at page " + p + ". Stopping.");
      break;
    }

    var contentChanged = await waitForNewContent(oldFirstTitle, p + 1);
    if (!contentChanged) {
      console.log("  Page " + (p + 1) + " content slow. Retrying click...");
      await sleep(3000);
      clicked = await clickNextPage(p);
      if (clicked) await waitForNewContent(oldFirstTitle, p + 1);
    }

    if (p % 10 === 0) {
      console.log("  Pausing 3s...");
      await sleep(3000);
    }
  }

  if (books.length === 0) {
    console.log("No books found! Make sure you are on the Manage Your Content page.");
    return;
  }

  console.log("DONE: " + books.length + " books from " + totalPages + " pages");
  var blob = new Blob([JSON.stringify(books, null, 2)], { type: "application/json" });
  var dlUrl = URL.createObjectURL(blob);
  var a = document.createElement("a");
  a.href = dlUrl;
  a.download = "kindle-books.json";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(dlUrl);
  console.table(books.slice(0, 10));
  alert(books.length + " Kindle books exported as kindle-books.json");
})();
