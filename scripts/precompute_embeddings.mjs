#!/usr/bin/env node
/**
 * Precomputes sentence embeddings for every resource in the library, using
 * the SAME model the browser will run at query time (Xenova/all-MiniLM-L6-v2,
 * quantized) so index vectors and live query vectors are comparable.
 *
 * Source: data/processed/resources.json
 * Output:
 *   data/processed/embeddings.bin       -- raw Float32Array, one 384-dim vector per resource, in file order
 *   data/processed/embeddings_meta.json -- { model, dim, ids: [...] } so the frontend can map vector rows back to ids
 *
 * Run: npm run embed  (or: node scripts/precompute_embeddings.mjs)
 *
 * Incremental mode: pass --incremental to only (re)embed resources whose id
 * is new or whose blurb/title/tags text has changed since the last run
 * (compared via a per-id text hash stored in embeddings_meta.json).
 */
import { pipeline } from "@xenova/transformers";
import { fileURLToPath } from "url";
import path from "path";
import fs from "fs";
import crypto from "crypto";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const RESOURCES_PATH = path.join(ROOT, "data", "processed", "resources.json");
const BIN_PATH = path.join(ROOT, "data", "processed", "embeddings.bin");
const META_PATH = path.join(ROOT, "data", "processed", "embeddings_meta.json");

const MODEL = "Xenova/all-MiniLM-L6-v2";
const DIM = 384;

function embeddingText(resource) {
  const tags = (resource.tags || []).join(", ");
  return [resource.title, resource.blurb, tags].filter(Boolean).join(". ");
}

function textHash(text) {
  return crypto.createHash("sha1").update(text).digest("hex").slice(0, 16);
}

async function main() {
  const incremental = process.argv.includes("--incremental");
  const resources = JSON.parse(fs.readFileSync(RESOURCES_PATH, "utf-8"));

  let prevMeta = null;
  if (incremental && fs.existsSync(META_PATH) && fs.existsSync(BIN_PATH)) {
    prevMeta = JSON.parse(fs.readFileSync(META_PATH, "utf-8"));
  }

  const prevVectorsById = new Map();
  if (prevMeta && prevMeta.model === MODEL && prevMeta.dim === DIM) {
    const prevBuf = fs.readFileSync(BIN_PATH);
    const prevFloats = new Float32Array(
      prevBuf.buffer,
      prevBuf.byteOffset,
      prevBuf.byteLength / 4
    );
    prevMeta.ids.forEach((id, i) => {
      if (prevMeta.hashes && prevMeta.hashes[i]) {
        prevVectorsById.set(id, {
          hash: prevMeta.hashes[i],
          vector: prevFloats.slice(i * DIM, (i + 1) * DIM),
        });
      }
    });
  }

  console.log(`Loading ${MODEL} (quantized)...`);
  const extractor = await pipeline("feature-extraction", MODEL, { quantized: true });

  const out = new Float32Array(resources.length * DIM);
  const ids = [];
  const hashes = [];
  let reused = 0;
  let computed = 0;

  for (let i = 0; i < resources.length; i++) {
    const r = resources[i];
    const text = embeddingText(r);
    const hash = textHash(text);
    ids.push(r.id);
    hashes.push(hash);

    const cached = prevVectorsById.get(r.id);
    if (cached && cached.hash === hash) {
      out.set(cached.vector, i * DIM);
      reused++;
      continue;
    }

    const result = await extractor(text, { pooling: "mean", normalize: true });
    out.set(result.data, i * DIM);
    computed++;
    if (computed % 100 === 0) console.log(`  embedded ${computed} (reused ${reused})...`);
  }

  fs.writeFileSync(BIN_PATH, Buffer.from(out.buffer));
  fs.writeFileSync(
    META_PATH,
    JSON.stringify({ model: MODEL, dim: DIM, count: resources.length, ids, hashes }, null, 2)
  );

  console.log(`Done. Computed ${computed} new/changed embeddings, reused ${reused}.`);
  console.log(`Wrote ${BIN_PATH} (${(out.byteLength / 1024 / 1024).toFixed(2)} MB) and ${META_PATH}.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
