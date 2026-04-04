// ================================================
// Kindlogger Highlights — scrapes your Kindle highlights and notes
// Run this in your browser console while on:
// https://read.amazon.co.uk/notebook (or read.amazon.com/notebook)
// ================================================
(async function() {
  var sleep = function(ms) { return new Promise(function(r) { setTimeout(r, ms); }); };
  var results = {};
  var totalHighlights = 0;

  // Get all books listed in the sidebar
  function getBookList() {
    var bookEls = document.querySelectorAll(".kp-notebook-library-each-book");
    var books = [];
    bookEls.forEach(function(el) {
      var titleEl = el.querySelector("h2, .kp-notebook-searchable");
      var authorEl = el.querySelector("p, .kp-notebook-searchable:nth-of-type(2)");
      var asinAttr = el.getAttribute("id") || "";
      // Try to extract ASIN from the element
      var asin = asinAttr.replace(/^.*?(B[A-Z0-9]{9}).*$/, "$1");
      if (!asin.match(/^B[A-Z0-9]{9}$/)) {
        // Try data attributes
        var allAttrs = el.attributes;
        for (var i = 0; i < allAttrs.length; i++) {
          var m = allAttrs[i].value.match(/B[A-Z0-9]{9}/);
          if (m) { asin = m[0]; break; }
        }
      }
      var title = titleEl ? titleEl.textContent.trim() : "";
      var author = authorEl ? authorEl.textContent.trim() : "";
      if (title) books.push({ el: el, title: title, author: author, asin: asin });
    });
    return books;
  }

  // Scrape highlights currently visible on the page
  function scrapeHighlights() {
    var highlights = [];
    var highlightEls = document.querySelectorAll("#highlight, .kp-notebook-highlight");
    highlightEls.forEach(function(el) {
      var text = el.textContent.trim();
      if (!text || text.length < 3) return;

      // Find associated note (usually a sibling or nearby element)
      var container = el.closest(".a-row, .a-spacing-base, [class*='annotation']");
      var noteEl = container ? container.querySelector("#note, [id*='note']") : null;
      var note = noteEl ? noteEl.textContent.trim() : null;

      // Try to get color
      var color = null;
      var colorEl = el.closest("[class*='kp-notebook-highlight']") || el;
      var cls = colorEl.className || "";
      if (cls.indexOf("yellow") > -1) color = "yellow";
      else if (cls.indexOf("blue") > -1) color = "blue";
      else if (cls.indexOf("pink") > -1) color = "pink";
      else if (cls.indexOf("orange") > -1) color = "orange";

      // Try to get location/page
      var locationEl = container ? container.querySelector("[id*='annotationHighlightHeader'], .kp-notebook-metadata") : null;
      var location = locationEl ? locationEl.textContent.trim() : null;

      var entry = { text: text };
      if (note && note.length > 0) entry.note = note;
      if (color) entry.color = color;
      if (location) entry.location = location;

      highlights.push(entry);
    });
    return highlights;
  }

  // Check for and click "next page" of highlights within a book
  async function loadAllHighlightsForBook() {
    var allHighlights = scrapeHighlights();
    var maxPages = 50;
    var page = 1;

    while (page < maxPages) {
      var nextToken = document.querySelector(".kp-notebook-annotations-next-page-start");
      if (!nextToken) break;

      // Find and click the "show more" or next page button
      var nextBtn = document.querySelector(".kp-notebook-annotations-next-page-start");
      if (!nextBtn) break;

      // The token element might be a hidden input — look for a clickable trigger
      var showMore = document.querySelector("[class*='kp-notebook-annotations-next-page'], a[class*='next'], .a-last a");
      if (showMore) {
        showMore.click();
        await sleep(2000);
        var newHighlights = scrapeHighlights();
        if (newHighlights.length <= allHighlights.length) break;
        allHighlights = newHighlights;
        page++;
      } else {
        break;
      }
    }

    return allHighlights;
  }

  // Main flow
  var books = getBookList();
  console.log("Kindlogger Highlights: found " + books.length + " books in notebook");

  if (books.length === 0) {
    // Diagnostic dump
    console.log("No books found. DOM diagnostics:");
    console.log("Body classes: " + document.body.className);
    var sample = document.body.innerHTML.substring(0, 2000);
    console.log("Body HTML sample: " + sample);
    alert("No books found on notebook page. Check console for diagnostics.");
    return;
  }

  for (var i = 0; i < books.length; i++) {
    var book = books[i];

    // Click the book in the sidebar to load its highlights
    book.el.click();
    await sleep(800);

    // Wait for highlights to appear (fast check, bail quickly)
    for (var w = 0; w < 6; w++) {
      var test = document.querySelectorAll("#highlight, .kp-notebook-highlight");
      if (test.length > 0) break;
      await sleep(300);
    }

    var highlights = await loadAllHighlightsForBook();

    if (highlights.length > 0) {
      var key = book.asin || book.title;
      results[key] = {
        title: book.title,
        author: book.author,
        asin: book.asin,
        highlights: highlights
      };
      totalHighlights += highlights.length;
      console.log((i + 1) + "/" + books.length + ": " + book.title.substring(0, 50) + " — " + highlights.length + " highlights");
    } else {
      console.log((i + 1) + "/" + books.length + ": " + book.title.substring(0, 50) + " — no highlights");
    }
  }

  var booksWithHighlights = Object.keys(results).length;
  console.log("DONE: " + totalHighlights + " highlights from " + booksWithHighlights + " books");

  if (totalHighlights === 0) {
    console.log("No highlights found.");
    alert("No highlights found in your Kindle notebook.");
    return;
  }

  var output = {
    kindlogger_highlights: {
      version: "1.0.0",
      exported: new Date().toISOString(),
      region: window.location.hostname,
      books_with_highlights: booksWithHighlights,
      total_highlights: totalHighlights
    },
    books: Object.values(results)
  };

  var blob = new Blob([JSON.stringify(output, null, 2)], { type: "application/json" });
  var dlUrl = URL.createObjectURL(blob);
  var a = document.createElement("a");
  a.href = dlUrl;
  a.download = "kindlogger-highlights.json";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(dlUrl);

  alert("Kindlogger: " + totalHighlights + " highlights from " + booksWithHighlights + " books\nDownloaded as kindlogger-highlights.json");
})();
