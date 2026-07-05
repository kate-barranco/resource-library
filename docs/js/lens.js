// "Lens" view: Prezi-style hierarchical drill-down. Level 1 shows every
// category as a plain circle -- nothing else on screen, so we never render
// more than ~20 nodes at once. Clicking a lens zooms in to level 2: just
// that category's resources (still paginated + sub-groupable by tag for
// the largest categories, since some categories run 100-200+ resources),
// plus a short list of neighboring categories it touches via shared tags.
import { categoryColor } from "./data.js";
import { renderGrid, renderLoadMore, escapeHtml, escapeAttr } from "./render.js";

const GLASSES_ICON = `<svg class="note-glyph" viewBox="-4 0 48 20" fill="none">
  <circle cx="10" cy="10" r="8" stroke="currentColor" stroke-width="1.5"/>
  <circle cx="30" cy="10" r="8" stroke="currentColor" stroke-width="1.5"/>
  <path d="M18,9 Q20,7 22,9" stroke="currentColor" stroke-width="1.5" fill="none"/>
</svg>`;

const SUBGROUP_PAGE_SIZE = 60;
const MAX_SUBGROUP_TAGS = 8;
const MAX_CONNECTIONS = 6;

function topTagsIn(members, excludeTag) {
  const counts = new Map();
  members.forEach((r) => {
    (r.tags || []).forEach((t) => {
      if (t === excludeTag) return;
      counts.set(t, (counts.get(t) || 0) + 1);
    });
  });
  return [...counts.entries()]
    .filter(([, n]) => n >= 3)
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_SUBGROUP_TAGS);
}

function connectedCategories(categoryName, allResources, categoriesPresent) {
  const members = allResources.filter((r) => r.categories.includes(categoryName));
  const others = allResources.filter((r) => !r.categories.includes(categoryName));
  const map = new Map();
  members.forEach((m) => {
    others.forEach((o) => {
      const shared = (m.tags || []).filter((t) => (o.tags || []).includes(t));
      if (!shared.length) return;
      o.categories.forEach((cat) => {
        if (cat === categoryName) return;
        if (!map.has(cat)) map.set(cat, new Set());
        shared.forEach((s) => map.get(cat).add(s));
      });
    });
  });
  return [...map.entries()]
    .map(([cat, set]) => ({ cat, via: [...set], strength: set.size }))
    .filter((c) => categoriesPresent.includes(c.cat))
    .sort((a, b) => b.strength - a.strength)
    .slice(0, MAX_CONNECTIONS);
}

export function renderLensOverview(el, { resources, categoryMeta }, categoriesPresent, onEnter) {
  el.innerHTML = `
    <div class="map-shell">
      <p class="map-note">${GLASSES_ICON} Each lens is a category. Click one to look through it -- you'll see only what's inside, plus a way to step sideways into whatever it touches.</p>
      <div class="lens-grid" id="lens-grid">
        ${categoriesPresent
          .map((c, i) => {
            const count = resources.filter((r) => r.categories.includes(c)).length;
            return `<button class="lens-tile" data-cat="${escapeAttr(c)}" style="--lens-color:${categoryColor(categoryMeta, c)}; animation-delay:${i * 30}ms;">
              <span class="lens-count">${count}</span>
              <span class="lens-name">${escapeHtml(c)}</span>
              <span class="lens-enter">Look closer &rarr;</span>
            </button>`;
          })
          .join("")}
      </div>
    </div>`;
  const tiles = [...el.querySelectorAll(".lens-tile")];
  tiles.forEach((tile) => {
    tile.addEventListener("click", () => {
      tiles.forEach((t) => (t === tile ? t.classList.add("zoom-in") : t.classList.add("zoom-out")));
      setTimeout(() => onEnter(tile.dataset.cat), 260);
    });
  });
}

export function renderLensDetail(el, ctx) {
  const { resources, categoryMeta, lensCluster, lensSubgroupTag, lensPage, onBack, onJump, onSubgroup, onLoadMore, onAddTag } = ctx;
  const categoriesPresent = [...new Set(resources.flatMap((r) => r.categories))];
  const color = categoryColor(categoryMeta, lensCluster);
  const allMembers = resources.filter((r) => r.categories.includes(lensCluster));
  const members = lensSubgroupTag ? allMembers.filter((r) => (r.tags || []).includes(lensSubgroupTag)) : allMembers;
  const subgroups = topTagsIn(allMembers, null);
  const connections = connectedCategories(lensCluster, resources, categoriesPresent);
  const meta = categoryMeta[lensCluster];

  const visibleCount = Math.min(members.length, SUBGROUP_PAGE_SIZE * lensPage);
  const visible = members.slice(0, visibleCount).map((r) => ({ r }));

  el.innerHTML = `
    <div class="map-shell">
      <div class="lens-detail">
        <button class="lens-back" id="lens-back">&larr; All lenses</button>
        <div class="lens-detail-head">
          <span class="lens-detail-ring" style="--lens-color:${color}; border-color:${color};"></span>
          <div>
            <h3>${escapeHtml(lensCluster)}</h3>
            <p class="lens-sub">${escapeHtml(meta.blurb || "")} &mdash; ${allMembers.length} resource${allMembers.length === 1 ? "" : "s"} here.</p>
          </div>
        </div>
        ${
          subgroups.length
            ? `<div class="lens-subgroups">
                <button class="lens-subgroup-pill ${!lensSubgroupTag ? "active" : ""}" data-tag="">All (${allMembers.length})</button>
                ${subgroups.map(([t, n]) => `<button class="lens-subgroup-pill ${lensSubgroupTag === t ? "active" : ""}" data-tag="${escapeAttr(t)}">${escapeHtml(t)} (${n})</button>`).join("")}
              </div>`
            : ""
        }
        <div class="lens-resource-grid-wrap"></div>
        ${
          connections.length
            ? `<div class="lens-also">
                <div class="lens-also-label">This lens also touches</div>
                ${connections
                  .map(
                    (c) => `<button class="lens-jump" data-cat="${escapeAttr(c.cat)}" style="--jump-color:${categoryColor(categoryMeta, c.cat)}">
                      <span class="jc-dot"></span>${escapeHtml(c.cat)} <i>via ${escapeHtml(c.via.slice(0, 2).join(", "))}</i>
                    </button>`
                  )
                  .join("")}
              </div>`
            : ""
        }
      </div>
    </div>`;

  const gridWrap = el.querySelector(".lens-resource-grid-wrap");
  gridWrap.innerHTML = `<div class="lens-resource-grid"></div>`;
  const gridEl = gridWrap.querySelector(".lens-resource-grid");
  renderGrid(gridEl, visible, resources, categoryMeta);
  renderLoadMore(gridWrap, { hasMore: visibleCount < members.length, onLoadMore });

  el.querySelector("#lens-back").addEventListener("click", onBack);
  el.querySelectorAll(".lens-jump").forEach((btn) => btn.addEventListener("click", () => onJump(btn.dataset.cat)));
  el.querySelectorAll(".lens-subgroup-pill").forEach((btn) => btn.addEventListener("click", () => onSubgroup(btn.dataset.tag || null)));
  gridEl.querySelectorAll(".tag-chip").forEach((chip) => {
    chip.addEventListener("click", (e) => {
      e.stopPropagation();
      onAddTag(chip.dataset.tag);
    });
  });
}
