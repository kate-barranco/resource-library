# Conscious Futures — Resource Library

A static, self-contained resource library: 1,069 curated resources across 20 categories, with keyword + semantic search, tag/type filters, and three browsing views (Grid, List, Lens). No backend, no database, no API keys, no hosting cost — it's a folder of HTML/CSS/JS you can open locally or drop on GitHub Pages.

## How it's organized

```
resource-library/
  data/
    raw/            output of the extract + dedup steps (working files, not shipped to the site)
    blurbs/output/  the 34 batch files of AI-written blurbs/tags/type — kept for provenance
    config/         hand-edited files: categories.json, tag_vocabulary.json
    processed/      final resources.json + embeddings.bin/.json — the real "database"
  scripts/          the rebuild pipeline (see below)
  docs/             the actual website — open docs/index.html or serve this folder
    data/           a synced copy of data/processed + data/config, fetched by the browser
```

**The site only ever reads from `docs/data/`.** Everything upstream of that (`data/raw`, `data/blurbs`, `data/processed`) is the pipeline that produces it. If you edit `docs/data/*.json` directly, your changes will be silently overwritten next time the pipeline runs — always edit the source (spreadsheet, `data/config/*.json`) and re-run the pipeline instead.

## Updating the dataset (the normal workflow)

When the source spreadsheet changes — new resources added, a category renamed, etc. — run:

```
npm run rebuild-data
```

This runs five steps in order:

1. **`npm run extract`** — reads the Excel export and writes `data/raw/live.json` (resources with a URL), `data/raw/needs_review.json` (resources with no discoverable URL — see below), and `data/raw/excluded.json` (directory-style rows intentionally left out).
2. **`npm run dedup`** — collapses resources that share a normalized URL (same page listed under multiple tabs/categories) into one record, merging their categories together. Writes `data/raw/live_deduped.json`.
3. **`npm run merge-blurbs`** — merges the AI-written blurb/tag/type enrichment (`data/blurbs/output/batch_*.json`) into the deduped data, normalizes resource-type labels into one consistent set, and does a final pass collapsing near-duplicate URLs that differ only by tracking parameters (`?utm_source=...` etc). Writes `data/processed/resources.json` — this is the canonical dataset.
4. **`npm run embed`** — computes a search vector for every resource using the same small AI model (`Xenova/all-MiniLM-L6-v2`) the browser uses at search time, so they're comparable. Writes `data/processed/embeddings.bin` + `embeddings_meta.json`.
5. **`npm run sync-site-data`** — copies the finished dataset + config into `docs/data/`, which is what the live site actually fetches.

Each step can also be run on its own (useful if you only changed `data/config/categories.json`, for instance — just re-run `npm run sync-site-data`).

### Important: `extract.py` currently points at a specific file on this Mac

`scripts/extract.py` has the spreadsheet path hardcoded near the top:

```python
SRC = "/Users/katebarranco/Downloads/Social Change Toolbox - Resource Collection - RESOURCE LIBRARY FOR WEBSITE (2).xlsx"
```

Before running `npm run rebuild-data`, make sure the current export is saved at that exact path (or update the `SRC` line to point at wherever you saved it). There is no live Airtable connection yet — see "Not built yet" below.

### Re-adding blurbs after adding new resources

The blurb/tag/type enrichment (step 3's input) was originally generated in 34 batches by AI agents reading batches of ~30 resources each, because doing all 1,069 by hand wasn't practical. If you add a handful of new resources by hand later, you have two options:

- Write the `blurb` / `tags` / `type_display` / `confidence` fields yourself directly in a new small file under `data/blurbs/output/` (matching the shape of the existing batch files, keyed by resource `id`), then re-run from step 3 onward.
- Or ask Claude Code to write a new batch file for just the new resources, the same way the original 34 were produced.

### Incremental re-embedding

Re-embedding all 1,069 resources takes a few minutes (it's a real AI model running on your machine, not an API call). If you're only adding a few resources, run:

```
node scripts/precompute_embeddings.mjs --incremental
```

This only computes vectors for resources whose text has changed since the last embedding run (tracked via a hash stored in `embeddings_meta.json`), reusing everything else. Much faster for small updates.

## Viewing / testing the site locally

The site is plain static files — any local web server works (it won't run correctly from `file://` because the browser blocks `fetch()` of local JSON over that protocol). Easiest option:

```
npx serve docs
```

Then open the URL it prints (usually `http://localhost:3000`).

## Deploying to GitHub Pages

1. Push this repository to GitHub.
2. In the repo's Settings → Pages, set the source to the `docs/` folder on your main branch. (GitHub Pages only supports the repo root or a `/docs` folder for the "deploy from a branch" option — that's why the site lives in `docs/` instead of `site/`.)
3. GitHub will publish it at `https://<username>.github.io/<repo-name>/`.

No build step is required — `docs/` is deployed as-is.

## Search: how it works

Typing in the search box does two things at once:

- **Keyword matching** — instant, works offline, no setup. Matches on title, blurb, tags, category, and type.
- **Semantic search** — after you start typing, the site quietly downloads a small (~23MB) AI model in the background (cached by the browser afterward, so it's a one-time cost per device) and starts ranking results by meaning, not just exact words — e.g. searching "loneliness" also surfaces articles about "social isolation" or "disconnection." If the model fails to load (offline, blocked CDN, etc.), the site falls back to keyword-only search automatically — nothing breaks.

There is no API key, no per-search cost, and no server involved in either mode.

## A data-quality note: near-duplicate URLs

Some resources appear on multiple spreadsheet tabs with the same underlying URL but different tracking parameters (e.g. one copy has `?utm_source=newsletter`, another doesn't). The pipeline treats these as the same resource and merges them — but it's deliberately conservative about *which* URLs count as "the same," because being too aggressive here risks merging genuinely different resources (e.g. two different YouTube videos, or two different files in the same Google Drive folder, which differ only in their query string). If you ever notice two cards that look like true duplicates but weren't merged, that's a sign the URLs differ in more than just tracking parameters — flag it and it can be handled as a one-off rather than changing the general rule.

## Not built yet

- **Live Airtable sync** — `extract.py` reads a static Excel export, not a live Airtable connection. If the source of truth moves to Airtable permanently, this script would need to be swapped for one that pulls via Airtable's API instead.
- **"Suggest a Resource" form** — the footer link is currently a placeholder (`href="#"`). It should point to an external form (Airtable form or Google Form) that feeds a review queue, rather than writing directly into the live dataset.
- **161 no-URL resources** — `data/raw/needs_review.json` holds resources from the original spreadsheet that had no discoverable working URL, so they were left out of the live site. These need a human pass to either find the real link or drop the entry.
