// Loads the static dataset (resources, category metadata, tag vocabulary)
// and derives the lookups the rest of the app needs. Pure data-layer, no DOM.

export async function loadData() {
  const [resources, categoryConfig, tagVocab] = await Promise.all([
    fetch("data/resources.json").then((r) => r.json()),
    fetch("data/categories.json").then((r) => r.json()),
    fetch("data/tag_vocabulary.json").then((r) => r.json()),
  ]);

  const categoryMeta = {};
  categoryConfig.categories.forEach((c) => {
    categoryMeta[c.name] = c;
  });

  const categoriesPresent = [...new Set(resources.flatMap((r) => r.categories))];
  // Preserve curated config order, then append any category found in data
  // but missing from categories.json (keeps the site working even if config
  // lags behind a data rebuild).
  const categoryOrder = [
    ...categoryConfig.categories.map((c) => c.name).filter((n) => categoriesPresent.includes(n)),
    ...categoriesPresent.filter((n) => !categoryMeta[n]),
  ];
  categoryOrder.forEach((name) => {
    if (!categoryMeta[name]) categoryMeta[name] = { name, color: "#6FBFB0", blurb: "" };
  });

  const usedTags = new Set(resources.flatMap((r) => r.tags || []));
  const allTags = [
    ...tagVocab.tags.filter((t) => usedTags.has(t)),
    ...[...usedTags].filter((t) => !tagVocab.tags.includes(t)),
  ].sort();

  const allTypes = [...new Set(resources.map((r) => r.type_display).filter(Boolean))].sort();

  return { resources, categoryMeta, categoryOrder, allTags, allTypes };
}

export function categoryColor(categoryMeta, name) {
  return (categoryMeta[name] && categoryMeta[name].color) || "#6FBFB0";
}
