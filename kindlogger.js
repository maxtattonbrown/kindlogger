// ================================================
// Kindlogger — Export your Kindle library as AI-ready JSON
// https://github.com/maxtattonbrown/kindlogger
//
// Run this in your browser console while on:
// https://www.amazon.co.uk/hz/mycd/digital-console/contentlist/booksAll/dateDsc/
// (Also works on amazon.com and other regional Amazon sites)
// ================================================
(async function() {
  var MAX_WAIT_FOR_CONTENT = 15000;
  var RETRY_DELAYS = [3000, 5000];

  var sleep = function(ms) { return new Promise(function(r) { setTimeout(r, ms); }); };
  var books = [];
  var seenAsins = new Set();

  function getFirstAsin() {
    var checkbox = document.querySelector('input[id$=":KindleEBook"], input[id$=":KindleBook"]');
    return checkbox ? checkbox.id.split(":")[0] : null;
  }

  function scrape() {
    var added = 0;
    var checkboxes = document.querySelectorAll('input[id$=":KindleEBook"], input[id$=":KindleBook"], input[id$=":Sample"]');
    checkboxes.forEach(function(cb) {
      var parts = cb.id.split(":");
      var asin = parts[0];
      var format = parts[1] || "unknown";
      if (!asin || seenAsins.has(asin)) return;
      seenAsins.add(asin);

      var titleEl = document.querySelector("#content-title-" + asin);
      var authorEl = document.querySelector("#content-author-" + asin);
      var dateEl = document.querySelector("#content-acquired-date-" + asin);
      var imageEl = document.querySelector("#content-image-" + asin + " img");
      var readBadge = null;
      if (titleEl) {
        var row = titleEl.closest("tr") || titleEl.closest("div");
        if (row) readBadge = row.querySelector("#content-read-badge");
      }

      var title = titleEl ? titleEl.textContent.trim() : "";
      var author = authorEl ? authorEl.textContent.replace(/^by\s+/i, "").trim() : "";
      var acquiredRaw = dateEl ? dateEl.textContent.trim() : "";
      var acquired = acquiredRaw.replace(/^Acquired on\s*/i, "").trim();
      var read = readBadge ? readBadge.textContent.trim() === "READ" : false;
      var cover = imageEl ? imageEl.src : "";

      // Extract collection names this book belongs to
      var collectionsEl = document.querySelector('[id="AddOrRemoveFromCollection_' + asin + '"]');
      var collections = [];
      if (collectionsEl) {
        var collItems = collectionsEl.querySelectorAll('[id^="AddOrRemoveFromCollection_' + asin + '_"]');
        collItems.forEach(function(item) {
          if (item.id.indexOf("checkmark") > -1) return;
          var label = item.closest("label");
          if (label) {
            var checkbox = label.querySelector("input");
            if (checkbox && checkbox.checked) {
              var name = label.textContent.trim();
              if (name) collections.push(name);
            }
          }
        });
      }

      var region = window.location.hostname.replace("www.amazon.", "");
      var book = {
        asin: asin,
        title: title,
        author: author,
        acquired: acquired || null,
        read: read,
        format: format,
        link: "https://www.amazon." + region + "/dp/" + asin
      };
      if (cover) book.cover = cover;
      if (collections.length > 0) book.collections = collections;

      books.push(book);
      added++;
    });

    // Fallback for rows without checkbox IDs
    if (added === 0) {
      var rows = document.querySelectorAll("tr");
      for (var i = 0; i < rows.length; i++) {
        var row = rows[i];
        var te = row.querySelector('[id^="content-title-"], .digital_entity_title');
        if (!te) continue;
        var title = te.textContent.trim();
        var key = title.toLowerCase();
        if (!title || seenAsins.has(key)) continue;
        seenAsins.add(key);
        var ae = row.querySelector('[id^="content-author-"], .information_row');
        var author = ae ? ae.textContent.replace(/^by\s+/i, "").trim() : "";
        books.push({ title: title, author: author, read: false });
        added++;
      }
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

  async function waitForNewContent(oldAsin, targetPage) {
    var elapsed = 0;
    while (elapsed < MAX_WAIT_FOR_CONTENT) {
      var currentPage = getActivePage();
      var currentAsin = getFirstAsin();
      if (currentPage === targetPage && currentAsin && currentAsin !== oldAsin) return true;
      await sleep(500);
      elapsed += 500;
    }
    return getActivePage() === targetPage;
  }

  function findPageButton(targetPage) {
    return document.querySelector("#page-" + targetPage) || document.querySelector("#page-RIGHT_PAGE");
  }

  async function clickNextPage(currentPage) {
    var targetPage = currentPage + 1;
    var btn = findPageButton(targetPage);
    if (!btn) {
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
  console.log("Kindlogger: scanning " + totalPages + " pages...");

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

    var oldAsin = getFirstAsin();
    var clicked = await clickNextPage(p);
    if (!clicked) {
      console.log("Could not find next page button at page " + p + ". Stopping.");
      break;
    }

    var contentChanged = await waitForNewContent(oldAsin, p + 1);
    if (!contentChanged) {
      console.log("  Page " + (p + 1) + " content slow. Retrying click...");
      await sleep(3000);
      clicked = await clickNextPage(p);
      if (clicked) await waitForNewContent(oldAsin, p + 1);
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

  // Wrap in metadata envelope
  var output = {
    kindlogger: {
      version: "1.0.0",
      exported: new Date().toISOString(),
      region: window.location.hostname,
      total: books.length,
      read: books.filter(function(b) { return b.read; }).length,
      unread: books.filter(function(b) { return !b.read; }).length
    },
    books: books
  };

  console.log("DONE: " + books.length + " books (" + output.kindlogger.read + " read, " + output.kindlogger.unread + " unread)");
  var blob = new Blob([JSON.stringify(output, null, 2)], { type: "application/json" });
  var dlUrl = URL.createObjectURL(blob);
  var a = document.createElement("a");
  a.href = dlUrl;
  a.download = "kindlogger-export.json";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(dlUrl);
  console.table(books.slice(0, 10).map(function(b) { return { title: b.title.substring(0, 60), author: b.author, read: b.read, acquired: b.acquired }; }));
  alert("Kindlogger: " + books.length + " books exported (" + output.kindlogger.read + " read, " + output.kindlogger.unread + " unread)\n\nDownloaded as kindlogger-export.json");
})();
