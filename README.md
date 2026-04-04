# Kindlogger

Export your entire Kindle library as JSON — so you can feed it to AI for reading recommendations, track what you own, or just finally know how many books you've bought.

Amazon doesn't give you an easy way to export your book list. Kindlogger is a single script you paste into your browser console. It clicks through every page of your library and collects every title.

## How to use

1. Go to **[Manage Your Content and Devices](https://www.amazon.co.uk/hz/mycd/digital-console/contentlist/booksAll/dateDsc/)** on Amazon (log in if prompted)

   > **Other regions:** The URL above is for amazon.co.uk. For amazon.com, use [this link](https://www.amazon.com/hz/mycd/digital-console/contentlist/booksAll/dateDsc/). Same pattern for .de, .fr, .co.jp, etc.

2. Make sure you can see your list of books with pagination at the bottom (1, 2, 3... etc)

3. Open your browser's developer console:
   - **Chrome/Edge:** `Cmd+Option+J` (Mac) or `Ctrl+Shift+J` (Windows)
   - **Firefox:** `Cmd+Option+K` (Mac) or `Ctrl+Shift+K` (Windows)
   - **Safari:** Enable Developer menu in Preferences > Advanced, then `Cmd+Option+C`

4. Open `kindlogger.js` from this repo, select all the code, copy it, and paste it into the console

5. Press Enter and watch it go — it'll log progress as it works through each page

6. When it finishes, it downloads `kindle-books.json` automatically

## What you get

A JSON file with every book in your Kindle library:

```json
[
  {
    "title": "Children of Time",
    "author": "Adrian Tchaikovsky"
  },
  {
    "title": "Never Let Me Go",
    "author": "Kazuo Ishiguro"
  }
]
```

## Why this exists

I wanted to ask Claude about my reading habits and get recommendations based on what I actually own — not what I can remember owning. Amazon doesn't offer a "download my library" button, and the browser extensions that do this want to charge you for it.

So I made a script that does it for free in about two minutes.

## Tips

- **Large libraries (500+ books):** The script pauses between pages to avoid Amazon throttling. For very large libraries it may take 2-3 minutes. Don't close the tab while it's running.
- **If it gets stuck:** Refresh the page, make sure you're on page 1, and run it again. It's stateless — each run starts fresh.
- **Feeding it to AI:** Paste the contents of `kindle-books.json` into ChatGPT, Claude, or your AI of choice and ask for recommendations, reading order suggestions, or analysis of your taste.

## How it works

The script reads Amazon's "Manage Your Content" page, which uses a `#pagination` div with page buttons. It clicks the Next button to advance through pages, waits for new content to load (not just the page number to change), scrapes each page's book titles and authors, then downloads everything as JSON when done.

No data is sent anywhere. Everything runs locally in your browser.

## License

MIT — do whatever you want with it.
