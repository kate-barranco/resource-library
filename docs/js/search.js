// Search: instant keyword/substring matching always works offline.
// Semantic search is a client-side upgrade -- lazily loads transformers.js
// and the quantized Xenova/all-MiniLM-L6-v2 model (~23MB, cached by the
// browser after first use) only once the user starts typing. No API keys,
// no server, no per-query cost.

const TRANSFORMERS_CDN = "https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2";
const MODEL_NAME = "Xenova/all-MiniLM-L6-v2";
const SIMILARITY_THRESHOLD = 0.24;

export function keywordMatch(resource, query) {
  if (!query) return true;
  const hay = [
    resource.title,
    resource.blurb,
    (resource.tags || []).join(" "),
    resource.type_display,
    (resource.categories || []).join(" "),
  ]
    .join(" ")
    .toLowerCase();
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  return terms.every((t) => hay.includes(t));
}

export async function loadEmbeddingIndex() {
  const meta = await fetch("data/embeddings_meta.json").then((r) => r.json());
  const buf = await fetch("data/embeddings.bin").then((r) => r.arrayBuffer());
  const vectors = new Float32Array(buf);
  return { model: meta.model, dim: meta.dim, ids: meta.ids, vectors };
}

export class SemanticSearch {
  constructor() {
    this.status = "idle"; // idle | loading | ready | unavailable
    this.extractor = null;
    this.index = null;
  }

  async ensureLoaded(onStatusChange) {
    if (this.status === "ready" || this.status === "loading") return;
    this.status = "loading";
    onStatusChange && onStatusChange(this.status);
    try {
      const [{ pipeline, env }, index] = await Promise.all([
        import(/* webpackIgnore: true */ TRANSFORMERS_CDN),
        loadEmbeddingIndex(),
      ]);
      env.allowLocalModels = false;
      this.extractor = await pipeline("feature-extraction", MODEL_NAME, { quantized: true });
      this.index = index;
      this.status = "ready";
    } catch (err) {
      console.warn("Semantic search unavailable, falling back to keyword search.", err);
      this.status = "unavailable";
    }
    onStatusChange && onStatusChange(this.status);
  }

  /** Returns a Map<resourceId, similarityScore> for the given query, or null if not ready. */
  async score(query) {
    if (this.status !== "ready") return null;
    const output = await this.extractor(query, { pooling: "mean", normalize: true });
    const q = output.data;
    const { dim, ids, vectors } = this.index;
    const scores = new Map();
    for (let i = 0; i < ids.length; i++) {
      let dot = 0;
      const off = i * dim;
      for (let d = 0; d < dim; d++) dot += q[d] * vectors[off + d];
      scores.set(ids[i], dot);
    }
    return scores;
  }
}

export { SIMILARITY_THRESHOLD };
