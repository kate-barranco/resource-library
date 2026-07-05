import { loadData } from "./data.js";
import { keywordMatch, SemanticSearch, SIMILARITY_THRESHOLD } from "./search.js";
import { buildStarfield, animateCount, renderCategories, renderGrid, renderList, renderLoadMore, attachTagChipHandlers, escapeHtml } from "./render.js";
import { renderLensOverview, renderLensDetail } from "./lens.js";

const PAGE_SIZE = 60;
const SEARCH_DEBOUNCE_MS = 340;

const state = {
  screen: "categories",
  homeView: "lens",
  activeCluster: null,
  query: "",
  activeTags: new Set(),
  activeTypes: new Set(),
  view: "grid",
  lensCluster: null,
  lensSubgroupTag: null,
  lensPage: 1,
  page: 1,
  loading: false,
  semanticQuery: null,
  semanticScores: null,
  tagFiltersExpanded: false,
};

const semantic = new SemanticSearch();
let DATA = null;

async function main() {
  buildStarfield(document.getElementById("starfield"));
  DATA = await loadData();

  animateCount(document.getElementById("odo-total"), DATA.resources.length, 900);
  animateCount(document.getElementById("odo-cats"), DATA.categoryOrder.length, 700);

  wireStaticEvents();
  showCategoriesScreen();
}

/* ============================= SCREEN SWITCHING ============================= */
function showCategoriesScreen() {
  state.screen = "categories";
  document.getElementById("categories-screen").style.display = "";
  document.getElementById("browse-screen").style.display = "none";
  renderHomeContent();
}

function renderHomeContent() {
  const container = document.getElementById("cat-content");
  const onEnter = (catName) => {
    state.activeCluster = catName;
    resetFiltersKeepCluster();
    state.view = "grid";
    showBrowseScreen();
  };
  if (state.homeView === "grid") {
    container.className = "cat-grid";
    renderCategories(container, DATA, onEnter);
  } else {
    container.className = "lens-home-wrap";
    renderLensOverview(container, { resources: DATA.resources, categoryMeta: DATA.categoryMeta }, DATA.categoryOrder, onEnter);
  }
}

function showBrowseScreen() {
  state.screen = "browse";
  document.getElementById("categories-screen").style.display = "none";
  document.getElementById("browse-screen").style.display = "";
  renderAll();
}

function resetFiltersKeepCluster() {
  state.activeTags.clear();
  state.activeTypes.clear();
  state.query = "";
  state.page = 1;
  state.lensCluster = null;
  state.lensSubgroupTag = null;
  document.getElementById("search-input").value = "";
}

/* ============================= FILTER / SEARCH LOGIC ============================= */
function scopedResources() {
  // Resources within the active category (if any) -- used as the base for
  // both filtering and for computing tag/type counts.
  return state.activeCluster ? DATA.resources.filter((r) => r.categories.includes(state.activeCluster)) : DATA.resources;
}

function baseFiltered() {
  return scopedResources().filter((r) => {
    if (state.activeTags.size && ![...state.activeTags].every((t) => (r.tags || []).includes(t))) return false;
    if (state.activeTypes.size && !state.activeTypes.has(r.type_display)) return false;
    return true;
  });
}

function getResults() {
  const base = baseFiltered();
  if (!state.query) return base.map((r) => ({ r, score: null }));

  const q = state.query.trim();
  const kwMatches = new Set(base.filter((r) => keywordMatch(r, q)).map((r) => r.id));

  if (state.semanticScores && state.semanticQuery === state.query) {
    return base
      .filter((r) => kwMatches.has(r.id) || state.semanticScores.get(r.id) > SIMILARITY_THRESHOLD)
      .map((r) => ({ r, score: state.semanticScores.get(r.id) ?? 0, kw: kwMatches.has(r.id) }))
      .sort((a, b) => (b.kw - a.kw) || (b.score - a.score));
  }
  return base.filter((r) => kwMatches.has(r.id)).map((r) => ({ r, score: null }));
}

function tagCount(tag) {
  return scopedResources().filter((r) => (r.tags || []).includes(tag)).length;
}
function typeCount(type) {
  return scopedResources().filter((r) => r.type_display === type).length;
}

/* ============================= RENDER: FILTER PANEL ============================= */
function renderFilters() {
  const tagsInScope = DATA.allTags.filter((t) => tagCount(t) > 0);
  const tagWrap = document.getElementById("tag-filters");
  tagWrap.classList.toggle("collapsed", tagsInScope.length > 12 && !state.tagFiltersExpanded);
  tagWrap.innerHTML = tagsInScope
    .map((t) => `<button class="pill ${state.activeTags.has(t) ? "active" : ""}" data-tag="${t}">${escapeHtml(t)}<span class="n">${tagCount(t)}</span></button>`)
    .join("");
  tagWrap.querySelectorAll(".pill").forEach((elm) => {
    elm.addEventListener("click", () => {
      const t = elm.dataset.tag;
      state.activeTags.has(t) ? state.activeTags.delete(t) : state.activeTags.add(t);
      state.page = 1;
      renderAll();
    });
  });

  const moreBtn = document.getElementById("tag-filters-toggle");
  moreBtn.style.display = tagsInScope.length > 12 ? "" : "none";
  moreBtn.textContent = state.tagFiltersExpanded ? "show less" : `show all (${tagsInScope.length})`;

  const typesInScope = DATA.allTypes.filter((t) => typeCount(t) > 0);
  const typeWrap = document.getElementById("type-filters");
  typeWrap.innerHTML = typesInScope
    .map((t) => `<label class="type-row"><input type="checkbox" data-type="${t}" ${state.activeTypes.has(t) ? "checked" : ""}> ${escapeHtml(t)} <span class="n">${typeCount(t)}</span></label>`)
    .join("");
  typeWrap.querySelectorAll("input").forEach((elm) => {
    elm.addEventListener("change", () => {
      const t = elm.dataset.type;
      elm.checked ? state.activeTypes.add(t) : state.activeTypes.delete(t);
      state.page = 1;
      renderAll();
    });
  });

  const anyActive = state.activeTags.size || state.activeTypes.size || state.query;
  document.getElementById("clear-filters").classList.toggle("show", !!anyActive);
}

function renderBrowsingLabel(count, total) {
  const parts = [];
  if (state.activeCluster) parts.push(state.activeCluster);
  if (state.activeTags.size) parts.push([...state.activeTags].join(", "));
  if (state.activeTypes.size) parts.push([...state.activeTypes].join(", "));
  if (state.query) parts.push(`“${state.query}”`);
  document.getElementById("browsing-text").textContent = parts.length ? parts.join(" · ") : "All Resources";
  document.getElementById("drawer-count").textContent = `${count} / ${total}`;
}

/* ============================= RENDER: CONTENT ============================= */
function renderContent() {
  const el = document.getElementById("content");
  const results = getResults();
  renderBrowsingLabel(results.length, scopedResources().length);

  if (state.loading) {
    el.innerHTML = `<div class="loading-state"><div class="loading-ring"></div>Gathering the resources…</div>`;
    return;
  }
  if (results.length === 0) {
    el.innerHTML = `
      <div class="empty-state">
        <div class="ring-mark">?</div>
        <h3>Nothing here yet</h3>
        <p>Try a broader phrase, remove a filter, or head back to categories.</p>
        <button id="empty-reset">Clear search &amp; filters</button>
      </div>`;
    document.getElementById("empty-reset").addEventListener("click", () => {
      state.query = "";
      state.activeTags.clear();
      state.activeTypes.clear();
      document.getElementById("search-input").value = "";
      state.page = 1;
      renderAll();
    });
    return;
  }

  if (state.view === "map") {
    return renderMapView(el, results);
  }

  const visibleCount = Math.min(results.length, PAGE_SIZE * state.page);
  const visible = results.slice(0, visibleCount);

  if (state.view === "grid") {
    renderGrid(el, visible, DATA.resources, DATA.categoryMeta);
    attachTagChipHandlers(el, (tag) => {
      state.activeTags.add(tag);
      state.page = 1;
      renderAll();
    });
  } else {
    renderList(el, visible, DATA.categoryMeta);
    attachTagChipHandlers(el, (tag) => {
      state.activeTags.add(tag);
      state.page = 1;
      renderAll();
    });
  }
  renderLoadMore(el, {
    hasMore: visibleCount < results.length,
    onLoadMore: () => {
      state.page += 1;
      renderContent();
    },
  });
}

function renderMapView(el, results) {
  const categoriesPresent = [...new Set(results.map((x) => x.r).flatMap((r) => r.categories))];
  if (state.lensCluster && !categoriesPresent.includes(state.lensCluster)) state.lensCluster = null;

  const filteredResources = results.map((x) => x.r);

  if (!state.lensCluster) {
    renderLensOverview(el, { resources: filteredResources, categoryMeta: DATA.categoryMeta }, categoriesPresent, (cat) => {
      state.lensCluster = cat;
      state.lensSubgroupTag = null;
      state.lensPage = 1;
      renderContent();
    });
    return;
  }

  renderLensDetail(el, {
    resources: filteredResources,
    categoryMeta: DATA.categoryMeta,
    lensCluster: state.lensCluster,
    lensSubgroupTag: state.lensSubgroupTag,
    lensPage: state.lensPage,
    onBack: () => {
      state.lensCluster = null;
      renderContent();
    },
    onJump: (cat) => {
      state.lensCluster = cat;
      state.lensSubgroupTag = null;
      state.lensPage = 1;
      renderContent();
    },
    onSubgroup: (tag) => {
      state.lensSubgroupTag = tag;
      state.lensPage = 1;
      renderContent();
    },
    onLoadMore: () => {
      state.lensPage += 1;
      renderContent();
    },
    onAddTag: (tag) => {
      state.activeTags.add(tag);
      state.lensCluster = null;
      state.view = "grid";
      state.page = 1;
      renderAll();
    },
  });
}

function renderAll() {
  renderFilters();
  renderContent();
}

/* ============================= SEARCH ============================= */
function updateSearchModeIndicator() {
  const el = document.getElementById("search-mode");
  if (semantic.status === "ready") {
    el.className = "search-mode ready";
    el.textContent = "semantic search ready";
  } else if (semantic.status === "loading") {
    el.className = "search-mode loading";
    el.textContent = "loading semantic search…";
  } else if (semantic.status === "unavailable") {
    el.className = "search-mode";
    el.textContent = "keyword search (semantic unavailable offline)";
  } else {
    el.className = "search-mode";
    el.textContent = "keyword search";
  }
}

async function handleSearchInput(value) {
  state.query = value;
  state.page = 1;
  document.getElementById("search-clear").classList.toggle("show", !!state.query);

  if (state.query && state.screen === "categories") {
    state.activeCluster = null;
    showBrowseScreen();
  } else if (state.screen === "browse") {
    state.loading = true;
    renderContent();
    clearTimeout(window.__searchDebounce);
    window.__searchDebounce = setTimeout(async () => {
      state.loading = false;
      if (state.query) {
        await semantic.ensureLoaded(updateSearchModeIndicator);
        if (semantic.status === "ready") {
          const q = state.query;
          const scores = await semantic.score(q);
          if (state.query === q) {
            state.semanticScores = scores;
            state.semanticQuery = q;
          }
        }
      }
      renderContent();
    }, SEARCH_DEBOUNCE_MS);
  }
}

/* ============================= STATIC EVENT WIRING ============================= */
function wireStaticEvents() {
  document.getElementById("search-input").addEventListener("input", (e) => handleSearchInput(e.target.value));
  document.getElementById("search-clear").addEventListener("click", () => {
    state.query = "";
    document.getElementById("search-input").value = "";
    document.getElementById("search-clear").classList.remove("show");
    if (state.screen === "browse") renderAll();
  });
  document.querySelectorAll(".search-hint button[data-q]").forEach((b) => {
    b.addEventListener("click", () => {
      document.getElementById("search-input").value = b.dataset.q;
      document.getElementById("search-input").dispatchEvent(new Event("input"));
    });
  });
  document.getElementById("view-toggle").addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-view]");
    if (!btn) return;
    document.querySelectorAll("#view-toggle button").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    state.view = btn.dataset.view;
    state.lensCluster = null;
    state.page = 1;
    renderContent();
  });
  document.getElementById("clear-filters").addEventListener("click", () => {
    state.activeTags.clear();
    state.activeTypes.clear();
    state.query = "";
    state.lensCluster = null;
    state.page = 1;
    document.getElementById("search-input").value = "";
    renderAll();
  });
  document.getElementById("tag-filters-toggle").addEventListener("click", () => {
    state.tagFiltersExpanded = !state.tagFiltersExpanded;
    renderFilters();
  });
  document.getElementById("back-to-categories").addEventListener("click", () => {
    state.activeCluster = null;
    state.activeTags.clear();
    state.activeTypes.clear();
    state.query = "";
    state.lensCluster = null;
    document.getElementById("search-input").value = "";
    showCategoriesScreen();
  });
  document.getElementById("view-all-btn").addEventListener("click", () => {
    state.activeCluster = null;
    state.view = "grid";
    state.lensCluster = null;
    state.page = 1;
    showBrowseScreen();
  });
  document.getElementById("home-view-toggle").addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-homeview]");
    if (!btn) return;
    document.querySelectorAll("#home-view-toggle button").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    state.homeView = btn.dataset.homeview;
    renderHomeContent();
  });
  updateSearchModeIndicator();
}

main();
