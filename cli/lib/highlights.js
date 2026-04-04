// ABOUTME: Scrapes the Kindle Notebook page for highlights, notes, and bookmarks.
// ABOUTME: Clicks each book in the sidebar and extracts highlight data per book.

const sel = require('./selectors').notebook;

async function scrapeHighlightsForCurrentBook(page) {
  return await page.evaluate(function(selectors) {
    var highlights = [];
    var els = document.querySelectorAll(selectors.highlight);
    els.forEach(function(el) {
      var text = el.textContent.trim();
      if (!text || text.length < 3) return;

      var container = el.closest(".a-row, .a-spacing-base, [class*='annotation']");
      var noteEl = container ? container.querySelector(selectors.note) : null;
      var note = noteEl ? noteEl.textContent.trim() : null;

      var color = null;
      var cls = (el.className || "") + " " + ((el.closest("[class*='kp-notebook-highlight']") || {}).className || "");
      if (cls.indexOf("yellow") > -1) color = "yellow";
      else if (cls.indexOf("blue") > -1) color = "blue";
      else if (cls.indexOf("pink") > -1) color = "pink";
      else if (cls.indexOf("orange") > -1) color = "orange";

      var locationEl = container ? container.querySelector(selectors.metadata) : null;
      var location = locationEl ? locationEl.textContent.trim() : null;

      var entry = { text: text };
      if (note && note.length > 0) entry.note = note;
      if (color) entry.color = color;
      if (location) entry.location = location;
      highlights.push(entry);
    });
    return highlights;
  }, sel);
}

async function scrapeHighlights(page, notebookUrl) {
  await page.goto(notebookUrl, { waitUntil: 'networkidle', timeout: 30000 });

  // Wait for book list to load
  try {
    await page.waitForSelector(sel.bookItem, { timeout: 15000 });
  } catch (e) {
    console.log('  No books found on notebook page.');
    return [];
  }

  const bookEls = await page.$$(sel.bookItem);
  console.log('Found ' + bookEls.length + ' books with highlights');

  const results = [];
  let totalHighlights = 0;

  for (let i = 0; i < bookEls.length; i++) {
    const bookEl = bookEls[i];

    // Get book info before clicking
    const bookInfo = await bookEl.evaluate(function(el, selectors) {
      var titleEl = el.querySelector(selectors.bookTitle);
      var authorEl = el.querySelector(selectors.bookAuthor);
      var asin = "";
      var allAttrs = el.attributes;
      for (var j = 0; j < allAttrs.length; j++) {
        var m = allAttrs[j].value.match(/B[A-Z0-9]{9}/);
        if (m) { asin = m[0]; break; }
      }
      if (!asin) {
        var idMatch = (el.id || "").match(/B[A-Z0-9]{9}/);
        if (idMatch) asin = idMatch[0];
      }
      return {
        title: titleEl ? titleEl.textContent.trim() : "",
        author: authorEl ? authorEl.textContent.trim() : "",
        asin: asin
      };
    }, sel);

    await bookEl.click();
    await page.waitForTimeout(800);

    // Wait for highlights to appear
    try {
      await page.waitForSelector(sel.highlight, { timeout: 3000 });
    } catch (e) {
      // No highlights loaded — skip
    }

    const highlights = await scrapeHighlightsForCurrentBook(page);

    if (highlights.length > 0) {
      results.push({
        title: bookInfo.title,
        author: bookInfo.author,
        asin: bookInfo.asin,
        highlights: highlights
      });
      totalHighlights += highlights.length;
      console.log('  ' + (i + 1) + '/' + bookEls.length + ': ' +
        bookInfo.title.substring(0, 50) + ' — ' + highlights.length + ' highlights');
    }
  }

  console.log('Total: ' + totalHighlights + ' highlights from ' + results.length + ' books');
  return results;
}

module.exports = { scrapeHighlights };
