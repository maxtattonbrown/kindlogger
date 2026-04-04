---
description: "Query your Kindle library — reading stats, recommendations, pattern analysis, highlight search. Triggers on '/kindle', 'what should I read', 'my kindle', 'my books', 'reading list', 'book recommendations', 'what have I read'."
---

# Kindle Library Skill

You have access to the user's complete Kindle library export from Kindlogger.

## Loading the data

Look for the most recent Kindlogger export:
1. `~/Library/Mobile Documents/com~apple~CloudDocs/Downloads/kindlogger-complete.json`
2. `~/Downloads/kindlogger-complete.json`
3. `~/Downloads/kindlogger-enriched.json`
4. `~/Downloads/kindlogger-export.json`

Use the first one that exists. Read it as JSON.

## Data structure

```json
{
  "kindlogger": { "total": N, "read": N, "unread": N, ... },
  "books": [
    {
      "asin": "B09HQXLYSJ",
      "title": "...",
      "author": "...",
      "acquired": "2 April 2026",
      "read": true/false,
      "format": "KindleEBook",
      "genres": ["Science Fiction", "Space Opera"],
      "pages": 592,
      "published": 2022,
      "description": "...",
      "highlights": [{ "text": "...", "color": "yellow", "note": "..." }]
    }
  ]
}
```

Not all fields are present on all books. `genres`, `pages`, `published`, `description`, and `highlights` are optional.

## What you can do

### Reading stats
- Total library size, read/unread split
- Most-read authors
- Genre breakdown (what they read vs what they buy)
- Buying patterns over time (acquired dates)
- Reading velocity trends

### Recommendations
- "What should I read next?" — match unread books to their demonstrated taste (genres and authors they've actually finished, not just bought)
- "More like [book]" — find similar unread books by genre/author/theme
- Weight recommendations toward books they already own (unread) before suggesting new purchases

### Pattern analysis
- Buying vs reading ratio by year
- Genre drift over time
- Authors they keep buying but don't finish
- Longest unread books
- Books bought together (similar dates)

### Highlight analysis
- Search highlights across all books
- Find themes across highlights
- "What did I highlight in [book]?"
- Books with the most highlights (most engaged reading)

## Response style

- Lead with the interesting finding, not the methodology
- Use specific numbers and book titles
- Keep it conversational — this is about their reading life, not a database query
- When recommending, explain WHY based on their taste ("you've read 6 Expanse books, so...")
- Don't list every book — pick the most interesting 5-10

## Gotchas

- `acquired` dates are strings like "25 December 2010" — parse carefully
- `read: false` doesn't mean they haven't started it — Amazon only marks books as READ when fully completed
- Some books appear twice (different editions, e.g. two Count of Monte Cristo entries)
- Not all books have genres — about 75% get enriched from Open Library
- Highlight text can be very short fragments
