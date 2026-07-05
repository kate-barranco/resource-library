# Blurb-writing instructions for one batch

You are enriching a batch of resources for the Conscious Futures resource library (a futures-research and social-change studio's curated link database). Each input record has a `title` (often a raw, ugly Google/webpage title), a `url`, its `primary_category` and any other `categories` it was filed under, a rough `type_normalized` guess, and whatever scraps of context existed in the original spreadsheet (`note`, `extra_tag_text`, `hub`, `year`).

## What to produce, per resource

For every record in the input batch, produce:

- `id` -- copy exactly from input.
- `blurb` -- ONE or TWO sentences, written in third person, editorial but precise. Describe what the resource actually argues/shows/offers -- never generic filler like "an article about X." Base this on the title, note, and category context. Voice reference (these are real examples from an earlier prototype of this same library -- match this register: intelligent, warm, specific, never hype-y):
  - "A framework for what communities need to flourish together — belonging, civic muscle, and the vital conditions that let people co-create a common world."
  - "An essay arguing that AI represents the final territory of enclosure — the human imagination itself — and asks what it means to resist from the inside."
  - "A nationally representative study of over 2,000 young people showing how AI is already woven into their emotional and social lives — and why human connection remains the strongest protective factor."
  - "A reflection on what football terraces and techno clubs share as sites of collective ritual, belonging, and shared meaning-making."
- `tags` -- an array of 2-4 topical tags. **Prefer tags from the controlled vocabulary** at `data/config/tag_vocabulary.json` (read it once at the start of your batch). Only invent a new tag if nothing in the list fits reasonably -- if you do, keep it short and title-cased, consistent with the existing style.
- `type_display` -- a clean, human-facing resource type (e.g. "Article", "Report", "Book", "Podcast", "Tool", "Academic Paper", "Framework", "Video/Talk", "Resource Hub", "Interview"). Use `type_normalized` as a starting guess but correct it if the title clearly indicates otherwise.
- `confidence` -- `"high"` if the title (plus note/context) is unambiguous about what this resource is; `"medium"` if you're reasonably confident but inferring a fair amount from a vague title; `"low"` if the title is generic/cryptic enough that your blurb is a best guess.
- `ambiguous_note` -- ONLY include this field (a short string) when confidence is "medium" or "low", explaining briefly what's uncertain (e.g. "Title suggests a specific report but the exact publisher/edition isn't confirmable from the title alone."). Omit entirely (don't include the key) when confidence is "high".

## Method

- Do NOT fetch every URL. Infer from the title + note + category context for the large majority of records, exactly like the reference examples above -- that's faster and matches how this library was already prototyped.
- You MAY use WebFetch on a small handful of genuinely cryptic titles (rough guideline: no more than ~10% of your batch) if it meaningfully improves accuracy. Don't do this by default.
- If a title is itself a mangled page title (e.g. "Full Article Title | Site Name - Some Journal") clean it up into a proper, readable title in a new `title_clean` field. Only include `title_clean` if you changed it from the original.
- Titles that are clearly a link to a hub/spreadsheet/list rather than a single resource (type_normalized "Resource Hub", or note mentions "sheet"/"hub") should still get a blurb, just describing it as a hub/collection rather than pretending it's a single article.

## Output

Write your results as a single JSON array (same order as input, one object per resource, using exactly the fields above) to the output path you were given. Do not wrap it in markdown code fences -- write raw JSON via the Write tool. Do not include any resource IDs not present in your input batch, and do not skip any.
