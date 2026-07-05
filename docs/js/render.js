import { categoryColor } from "./data.js";

export function buildStarfield(container) {
  const n = 70;
  const frag = document.createDocumentFragment();
  for (let i = 0; i < n; i++) {
    const s = document.createElement("div");
    s.className = "star";
    const size = Math.random() * 1.5 + 0.6;
    s.style.width = size + "px";
    s.style.height = size + "px";
    s.style.top = Math.random() * 100 + "%";
    s.style.left = Math.random() * 100 + "%";
    s.style.setProperty("--o1", (0.12 + Math.random() * 0.25).toFixed(2));
    s.style.setProperty("--o2", (0.4 + Math.random() * 0.4).toFixed(2));
    s.style.animationDuration = (2.5 + Math.random() * 4).toFixed(2) + "s";
    s.style.animationDelay = (Math.random() * 4).toFixed(2) + "s";
    frag.appendChild(s);
  }
  container.appendChild(frag);
}

export function animateCount(el, target, duration) {
  const start = performance.now();
  function step(now) {
    const p = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - p, 3);
    el.textContent = Math.round(eased * target).toLocaleString();
    if (p < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

export function renderCategories(wrap, { resources, categoryMeta, categoryOrder }, onEnter) {
  wrap.innerHTML = categoryOrder
    .map((name, i) => {
      const count = resources.filter((r) => r.categories.includes(name)).length;
      const meta = categoryMeta[name];
      return `<button class="cat-tile" style="--tile-color:${meta.color}; animation-delay:${i * 25}ms;" data-cat="${escapeAttr(name)}">
        <div class="cat-tile-top"><span class="cat-dot"></span><span class="cat-count">${count} resource${count === 1 ? "" : "s"}</span></div>
        <h4>${escapeHtml(name)}</h4>
        <p>${escapeHtml(meta.blurb || "")}</p>
        <span class="enter">Enter &rarr;</span>
      </button>`;
    })
    .join("");
  wrap.querySelectorAll(".cat-tile").forEach((tile) => {
    tile.addEventListener("click", () => onEnter(tile.dataset.cat));
  });
}

export function tagChipsHTML(resource) {
  return (resource.tags || []).map((t) => `<span class="tag-chip" data-tag="${escapeAttr(t)}">${escapeHtml(t)}</span>`).join("");
}

function connectionCount(resource, allResources) {
  const tags = resource.tags || [];
  if (!tags.length) return 0;
  let n = 0;
  for (const o of allResources) {
    if (o.id === resource.id) continue;
    if ((o.tags || []).some((t) => tags.includes(t))) n++;
  }
  return n;
}

export function renderGrid(el, results, allResources, categoryMeta) {
  el.innerHTML = `<div class="grid-view">${results
    .map(
      ({ r }, i) => `
    <div class="card" style="--card-color:${categoryColor(categoryMeta, r.primary_category)}; animation-delay:${Math.min(i * 22, 380)}ms;">
      <div class="card-top">
        <span class="accession"><span class="ring-dot"></span>${r.id}</span>
        <span class="type-tab">${escapeHtml(r.type_display || "")}</span>
      </div>
      <h4>${escapeHtml(r.title)}</h4>
      <p class="blurb">${escapeHtml(r.blurb || "")}</p>
      <div class="tags-label">Tags</div>
      <div class="card-tags">${tagChipsHTML(r)}</div>
      <div class="card-foot">
        <span class="conn-count">${connectionCount(r, allResources)} linked resources</span>
        <a class="visit-link" href="${escapeAttr(r.url)}" target="_blank" rel="noopener">Visit source &rarr;</a>
      </div>
    </div>`
    )
    .join("")}</div>`;
  attachTagChipHandlers(el);
}

export function renderList(el, results, categoryMeta) {
  el.innerHTML = `<div class="list-view">
    <div class="list-head-row"><div>No.</div><div>Title</div><div>Category</div><div>Tags</div><div>Source</div></div>
    ${results
      .map(
        ({ r }) => `
    <div class="list-row" style="--card-color:${categoryColor(categoryMeta, r.primary_category)};">
      <div class="list-acc">${r.id}</div>
      <div class="list-title">${escapeHtml(r.title)}<span class="blurb-inline">${escapeHtml(r.blurb || "")}</span></div>
      <div class="list-type">${escapeHtml(r.primary_category)}</div>
      <div class="list-tags">${tagChipsHTML(r)}</div>
      <div><a class="list-link" href="${escapeAttr(r.url)}" target="_blank" rel="noopener">visit &rarr;</a></div>
    </div>`
      )
      .join("")}
  </div>`;
  attachTagChipHandlers(el);
}

export function attachTagChipHandlers(el, onAddTag) {
  el.querySelectorAll(".tag-chip").forEach((chip) => {
    chip.addEventListener("click", (e) => {
      e.stopPropagation();
      onAddTag && onAddTag(chip.dataset.tag);
    });
  });
}

export function renderLoadMore(el, { hasMore, onLoadMore }) {
  if (!hasMore) return;
  const row = document.createElement("div");
  row.className = "load-more-row";
  row.innerHTML = `<button class="load-more-btn">Load more</button>`;
  row.querySelector("button").addEventListener("click", onLoadMore);
  el.appendChild(row);
}

export function escapeHtml(s) {
  if (s == null) return "";
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
export function escapeAttr(s) {
  return escapeHtml(s);
}
