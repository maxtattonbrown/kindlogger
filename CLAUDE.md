# Kindlogger

Export a Kindle library as AI-ready JSON. Three-step pipeline: scrape library → scrape highlights → enrich via Open Library → merge. **Public repo** (`github.com/maxtattonbrown/kindlogger`) — be careful what goes in commits.

Output: single `kindlogger-complete.json` with ASIN, title, author, acquired date, read status, cover, genres, page count, description, highlights per book.

## The pipeline

1. **`kindlogger.js`** — paste into browser console on `amazon.co.uk/hz/mycd` ("Manage Your Content"). Iterates pagination via `#page-RIGHT_PAGE`, scrapes ASIN-keyed fields per book. Outputs library JSON.
2. **`kindlogger-highlights.js`** — paste into console on `read.amazon.co.uk/notebook`. Clicks each sidebar book, extracts highlights/notes/colors using selectors borrowed from `obsidian-kindle-plugin`.
3. **`process.py`** — Python 3 stdlib only. Enriches via Open Library (search by title+author → Works API for description), merges highlights by ASIN.

`enrich.py` and `merge.py` are split-out helpers; `process.py` is the orchestrator.

## Key design decisions

- **Scrape by ASIN, not title.** Found 1,026 books vs 919 with title selectors. ASINs are unique and let you construct product links.
- **Content-change detection, not page number.** Amazon updates pagination state before content loads — wait for the first ASIN to change before reading the next page.
- **Retry cascade on empty pages.** 3s then 5s with a scroll between. Catches lazy-loaded content.
- **Open Library enrichment, not Amazon's.** Kindle ASINs (`B` prefix) aren't in Open Library, so we search by title+author. ~0.7s/book, ~12 min for 1,000 books.

## Amazon DOM selectors (will rot)

These are the most-likely failure points when Amazon redesigns:

- Pagination wrapper: `div#pagination.pagination`, link `a.page-item`, next button `a#page-RIGHT_PAGE`
- Title: `#content-title-{ASIN}.digital_entity_title`
- Author: `#content-author-{ASIN}.information_row`
- Acquired date: `#content-acquired-date-{ASIN}`
- Read badge: `#content-read-badge`
- Cover: `#content-image-{ASIN} img`
- ASIN extraction: `input[id$=":KindleEBook"]` checkbox, split on `:`

When these break, the scrape silently returns empty — first check is always "did the page DOM change."

## Browser-console scripts hygiene

Per `feedback_console_scripts`: write via shell heredoc, validate with `node -c`, never paste inline-edited JS. The two `.js` files in this repo are designed to be copy-pasted whole — don't tweak in the console.

## Roadmap

- **v2:** Playwright CLI (`npx kindlogger`) with persistent browser context for Amazon login. Auth once, automate the rest. Not started.
- **`cli/` and `claude-skill/`** dirs are placeholders for that work.
