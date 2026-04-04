# Kindlogger

Export your entire Kindle library as AI-ready JSON — with read status, purchase dates, cover art, and Amazon product links for every book.

Amazon doesn't give you an easy way to export your book list. Kindlogger is a single script you paste into your browser console. It clicks through every page of your library and collects everything Amazon knows about each book.

## What you get

A structured JSON file designed to be dropped straight into an AI conversation:

```json
{
  "kindlogger": {
    "version": "1.0.0",
    "exported": "2026-04-04T12:32:34.738Z",
    "region": "www.amazon.co.uk",
    "total": 1026,
    "read": 298,
    "unread": 728
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
      "cover": "https://m.media-amazon.com/images/I/51D5rdJRNyL.SX150.jpg"
    }
  ]
}
```

**Per book:** ASIN (Amazon ID), title, author, acquisition date, read/unread status, format, product link, cover image URL.

**Summary header:** total count, read/unread split, export date, Amazon region.

## How to use

1. Go to **[Manage Your Content and Devices](https://www.amazon.co.uk/hz/mycd/digital-console/contentlist/booksAll/dateDsc/)** on Amazon (log in if prompted)

   > **Other regions:** The URL above is for amazon.co.uk. For amazon.com, use [this link](https://www.amazon.com/hz/mycd/digital-console/contentlist/booksAll/dateDsc/). Same pattern for .de, .fr, .co.jp, etc.

2. Make sure you can see your list of books with pagination at the bottom (1, 2, 3... etc)

3. Open your browser's developer console:
   - **Chrome/Edge:** `Cmd+Option+J` (Mac) or `Ctrl+Shift+J` (Windows)
   - **Firefox:** `Cmd+Option+K` (Mac) or `Ctrl+Shift+K` (Windows)
   - **Safari:** Enable Developer menu in Preferences > Advanced, then `Cmd+Option+C`

4. Open `kindlogger.js`, select all the code (`Cmd+A`), copy it (`Cmd+C`), and paste it into the console

5. Press Enter and watch it go — it logs progress as it works through each page

6. When it finishes, `kindlogger-export.json` downloads automatically

## Using with AI

Paste the contents of `kindlogger-export.json` into Claude, ChatGPT, or any AI assistant. Some prompts to try:

> Here's my Kindle library. Based on my reading taste, recommend 5 books I'd love that aren't on this list.

> Which unread books in my library should I prioritise? Consider my taste based on what I've already read.

> Look at when I acquired these books vs whether I've read them. What patterns do you see in my buying vs reading habits?

> Group my library by genre or theme. What am I drawn to?

> I want to read more non-fiction. Based on the fiction I've enjoyed (marked read), what non-fiction would appeal to me?

The structured format means AI can reason about your reading patterns, not just the titles — it can see what you've finished vs abandoned, when you bought things, and how your taste has evolved over time.

## Tips

- **Large libraries (500+ books):** The script pauses between pages to avoid Amazon throttling. For very large libraries it may take 2-3 minutes. Don't close the tab while it's running.
- **If it gets stuck:** Refresh the page, make sure you're on page 1, and run it again. Each run starts fresh.
- **Privacy:** No data is sent anywhere. Everything runs locally in your browser. The JSON file stays on your machine.

## How it works

The script reads Amazon's "Manage Your Content" page. It uses each book's ASIN (Amazon's unique product ID) to find the title, author, acquisition date, read status, and cover image from the page DOM. It clicks the Next button to advance through pages, waits for new content to load, and collects everything into a single download.

## License

MIT — do whatever you want with it.
