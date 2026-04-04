// ABOUTME: Scrapes the Kindle "Manage Your Content" page for library metadata.
// ABOUTME: Uses Playwright to click through pagination and extract book data per page.

const sel = require('./selectors').library;

async function getActivePage(page) {
  const el = await page.$(sel.pagination.activePage);
  if (!el) return null;
  const text = await el.textContent();
  return parseInt(text.trim(), 10) || null;
}

async function getTotalPages(page) {
  const items = await page.$$(sel.pagination.pageItem);
  let max = 1;
  for (const item of items) {
    const text = await item.textContent();
    const n = parseInt(text.trim(), 10);
    if (n > max) max = n;
  }
  return max;
}

async function scrapePage(page) {
  return await page.evaluate(function(selectors) {
    var books = [];
    var checkboxes = document.querySelectorAll(selectors.checkbox);
    checkboxes.forEach(function(cb) {
      var parts = cb.id.split(":");
      var asin = parts[0];
      var format = parts[1] || "unknown";
      if (!asin) return;

      var titleEl = document.querySelector(selectors.title.replace("-]", "-" + asin + '"]'));
      var authorEl = document.querySelector(selectors.author.replace("-]", "-" + asin + '"]'));
      var dateEl = document.querySelector('[id="content-acquired-date-' + asin + '"]');
      var imageContainer = document.querySelector('[id="content-image-' + asin + '"] img');
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
      var cover = imageContainer ? imageContainer.src : "";
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
      books.push(book);
    });
    return books;
  }, sel);
}

async function scrapeLibrary(page, baseUrl) {
  await page.goto(baseUrl, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForSelector(sel.checkbox, { timeout: 15000 });

  const totalPages = await getTotalPages(page);
  const seenAsins = new Set();
  const books = [];

  console.log('Scanning ' + totalPages + ' pages...');

  for (let p = 1; p <= totalPages; p++) {
    await page.evaluate(function() { window.scrollTo(0, document.body.scrollHeight); });
    await page.waitForTimeout(800);

    const pageBooks = await scrapePage(page);
    let added = 0;
    for (const book of pageBooks) {
      if (!seenAsins.has(book.asin)) {
        seenAsins.add(book.asin);
        books.push(book);
        added++;
      }
    }

    // Retry if zero books found
    if (added === 0) {
      await page.waitForTimeout(3000);
      await page.evaluate(function() { window.scrollTo(0, document.body.scrollHeight); });
      await page.waitForTimeout(500);
      const retryBooks = await scrapePage(page);
      for (const book of retryBooks) {
        if (!seenAsins.has(book.asin)) {
          seenAsins.add(book.asin);
          books.push(book);
          added++;
        }
      }
    }

    console.log('  Page ' + p + '/' + totalPages + ': +' + added + ' (total: ' + books.length + ')');

    if (p >= totalPages) break;

    // Navigate to next page
    const nextBtn = await page.$(sel.pagination.pageById(p + 1)) || await page.$(sel.pagination.nextButton);
    if (!nextBtn) {
      console.log('  No next button found, stopping.');
      break;
    }

    const oldAsin = books.length > 0 ? books[books.length - 1].asin : null;
    await nextBtn.click();

    // Wait for new content
    try {
      await page.waitForFunction(
        function(oldAsin, checkboxSel) {
          var cbs = document.querySelectorAll(checkboxSel);
          if (cbs.length === 0) return false;
          var firstAsin = cbs[0].id.split(":")[0];
          return firstAsin !== oldAsin;
        },
        { timeout: 15000 },
        oldAsin, sel.checkbox
      );
    } catch (e) {
      // Fallback: just wait
      await page.waitForTimeout(3000);
    }

    if (p % 10 === 0) {
      await page.waitForTimeout(3000);
    }
  }

  return books;
}

module.exports = { scrapeLibrary };
