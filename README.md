# Kindlogger

Export your entire Kindle library as AI-ready JSON — with read status, purchase dates, highlights, genres, page counts, and more.

Amazon doesn't give you a way to export your book data. Kindlogger does it with two browser scripts and one terminal command. No extension to install, no account to create, no data sent anywhere.

## What you get

A single JSON file with everything AI needs to understand your reading life:

```json
{
  "kindlogger": {
    "version": "1.1.0",
    "total": 1026,
    "read": 298,
    "unread": 728,
    "enriched_count": 632,
    "books_with_highlights": 169,
    "total_highlights": 847
  },
  "books": [
    {
      "asin": "B09HQXLYSJ",
      "title": "Eyes of the Void (The Final Architecture Book 2)",
      "author": "Adrian Tchaikovsky",
      "acquired": "2 April 2026",
      "read": false,
      "format": "KindleEBook",
      "link": "https://www.amazon.co.uk/dp/B09HQXLYSJ",
      "cover": "https://m.media-amazon.com/images/...",
      "genres": ["Science Fiction", "Space Opera", "Aliens"],
      "pages": 592,
      "published": 2022,
      "description": "The sequel to Children of Time...",
      "highlights": [
        {
          "text": "The universe is not hostile, merely indifferent.",
          "color": "yellow",
          "location": "Page 142"
        }
      ]
    }
  ]
}
```

**Per book:** ASIN, title, author, acquisition date, read/unread status, format, Amazon link, cover image, genres, page count, publication year, description, and your highlights and notes.

## How to use

### Step 1: Export your library

1. Go to **[Manage Your Content and Devices](https://www.amazon.co.uk/hz/mycd/digital-console/contentlist/booksAll/dateDsc/)** on Amazon

   > **Other regions:** For amazon.com use [this link](https://www.amazon.com/hz/mycd/digital-console/contentlist/booksAll/dateDsc/). Same pattern for .de, .fr, .co.jp, etc.

2. Open your browser console (`Cmd+Option+J` on Mac, `Ctrl+Shift+J` on Windows)

3. Open `kindlogger.js` from this repo, select all, copy, paste into the console, press Enter

4. Watch it click through every page — downloads `kindlogger-export.json` when done

### Step 2: Export your highlights (optional)

1. Go to **[Your Notebook](https://read.amazon.co.uk/notebook)** (or [read.amazon.com/notebook](https://read.amazon.com/notebook))

2. Open the console, paste the contents of `kindlogger-highlights.js`, press Enter

3. It clicks through each book with highlights — downloads `kindlogger-highlights.json`

### Step 3: Enrich and merge

```bash
# With highlights:
python3 process.py kindlogger-export.json kindlogger-highlights.json

# Without highlights:
python3 process.py kindlogger-export.json
```

This enriches every book with genres, page counts, publication years, and descriptions from [Open Library](https://openlibrary.org), then merges in your highlights. Takes about 12 minutes for 1,000 books.

Outputs `kindlogger-complete.json` — the full picture of your reading life.

## Using with AI

Drop `kindlogger-complete.json` into Claude, ChatGPT, or any AI. Some prompts to try:

> Based on my reading taste, recommend 5 books I'd love that aren't on this list.

> Which unread books should I prioritise? Look at what I've enjoyed (marked read) and the genres I gravitate toward.

> Look at my highlights — what ideas and themes keep showing up across different books?

> Analyse my buying vs reading habits. When do I buy books? How many do I actually read?

> Group my library by theme. What patterns do you see in what I'm drawn to?

> Based on my highlights from [book], what else would I enjoy?

## Tips

- **Large libraries:** The scripts pause between pages to avoid Amazon throttling. ~2 minutes for the library, ~3 minutes for highlights. Don't close the tab while running.
- **If a script gets stuck:** Refresh the page, go to page 1, and run it again. Each run starts fresh.
- **Re-running:** Export fresh any time. The enrichment is the slow part (~12 min) but only needs re-running if you've added lots of new books.
- **Privacy:** No data is sent anywhere except Open Library (for public book metadata). Your highlights and reading status stay on your machine.

## Requirements

- A web browser (Chrome, Firefox, Edge, Safari)
- Python 3 (for enrichment — no pip packages needed, uses only the standard library)

## Claude Code skill (optional)

If you use [Claude Code](https://claude.ai/code), copy the skill file to make your library queryable in any conversation:

```bash
mkdir -p ~/.claude/skills/kindle
cp claude-skill/skill.md ~/.claude/skills/kindle/skill.md
```

Then use `/kindle` or just ask "what should I read next?" and Claude will load your library and answer.

## v2: One-command CLI

A Playwright-powered version that does everything in one command. No console-pasting required.

```bash
cd cli
npm install
npx playwright install chromium
node index.js
```

A Chrome window opens for Amazon login (first time only — cookies are saved to `~/.kindlogger/`). After login, it automatically:
1. Scrapes your full library from "Manage Your Content"
2. Scrapes highlights from Kindle Notebook
3. Enriches from Open Library
4. Outputs `kindlogger-complete.json`

**Options:**
```
--region <code>      Amazon region: uk, us, de, fr, it, es, ca, jp, in, au (default: uk)
--skip-highlights    Skip highlight scraping
--skip-enrich        Skip Open Library enrichment (saves ~12 min)
--output <file>      Output filename (default: kindlogger-complete.json)
```

**Quick test run:**
```bash
node index.js --skip-enrich    # Library + highlights only (~5 min)
```

## Daily deals digest

Kindlogger can also check Amazon's Kindle Daily Deals and your wishlist each morning, score the matches against your taste profile, and write a markdown digest to a file of your choosing (perfect for a vault, notes app, or daily review).

```bash
node cli/deals.js
```

**First-time setup:**

1. Find your wishlist ID — open your wishlist on Amazon, copy the ID from the URL: `amazon.co.uk/hz/wishlist/ls/XXXXXXXXXX`
2. Create `~/.kindlogger/deals-config.json`:

```json
{
  "region": "uk",
  "wishlistId": "XXXXXXXXXX",
  "output": "/path/to/your/notes/kindle-deals-today.md",
  "monthlyNoteDir": "/path/to/your/notes/Inbox"
}
```

3. Make sure you've run `node index.js` at least once so the browser has your Amazon login cookies

Supports `uk`, `us`, `de`, `fr`, `it`, `es`, `ca`, `jp`, `au` regions. The `wishlistId` is optional — without it, only the daily deals page is checked.

**Monthly note integration:** If you set `monthlyNoteDir`, deals also get appended to a monthly note file (e.g. `2026-04 April.md`) under a `## 6 April` daily heading. Reruns replace the existing deals subsection rather than duplicating, so it stays clean. Perfect for Obsidian users who already have a monthly note habit — the deals show up in the file you already check each morning.

**Run it daily via launchd (macOS):**

```bash
# Copy the example plist, edit paths, then:
launchctl load ~/Library/LaunchAgents/com.kindlogger.deals.plist
```

**How scoring works:** Each deal is scored based on (1) whether the author matches your top 20 read authors, (2) keyword matching against your most-read genres (history, biography, sci-fi, etc), and (3) price. Books in obvious off-taste genres (paranormal romance, vampire YA, etc) are filtered out. Wishlist items are sorted by price ascending.

## Ethics and Amazon's Terms of Service

Kindlogger is built for **personal use by individuals exporting their own data**. It uses a real browser (Playwright) with your own login session, and runs at most once a day for any given user.

- **Don't run it on a schedule faster than once a day** — Amazon rate limits and may throttle
- **Don't share or redistribute scraped data** — this is your library, not everyone's
- **Don't run it against accounts you don't own** — that's not what this is for
- Amazon's Terms of Service prohibit broad "automated access" but have never been enforced against individuals scraping their own data. Use at your own risk.

If you're building something commercial or at scale, use the [Amazon Product Advertising API](https://webservices.amazon.com/paapi5/documentation/) instead.

## How it works

**Library export:** Reads Amazon's "Manage Your Content" page. Uses each book's ASIN to extract title, author, acquisition date, read status, and cover image. Clicks through pagination waiting for content to load between pages.

**Highlights:** Reads Amazon's Kindle Notebook page. Clicks each book in the sidebar and extracts highlights, notes, and their colors.

**Enrichment:** Searches [Open Library](https://openlibrary.org) by title and author to add genres, page counts, publication years, and descriptions. Uses the Search API and Works API with proper rate limiting.

**Merge:** Joins everything by ASIN (falling back to title matching) into one structured JSON file.

## License

MIT — do whatever you want with it.
