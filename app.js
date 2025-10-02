const state = {
  config: null,
  selected: {}
};

let processEntries = [];
let categoryLookup = new Map();

const filtersContainer = document.getElementById('filters');
const resultsEl = document.getElementById('processResults');
const emptyMessageEl = document.getElementById('emptyMessage');
const resetButton = document.getElementById('resetButton');
let globalTooltip;

function cloneCompatibility(source = {}) {
  const clone = {};
  Object.entries(source).forEach(([categoryId, values]) => {
    clone[categoryId] = Array.isArray(values) ? [...values] : values;
  });
  return clone;
}

function mergeCompatibility(base = {}, overrides = {}) {
  const merged = cloneCompatibility(base);
  Object.entries(overrides).forEach(([categoryId, values]) => {
    merged[categoryId] = Array.isArray(values) ? [...values] : values;
  });
  return merged;
}

function resolveVariantCompatibility(process, variant) {
  const refinements = variant.refinements ?? {};
  const fallback = variant.compatibility ?? {};
  const baseOverrides = Object.keys(refinements).length > 0 ? refinements : fallback;
  const overrides = variant.compatibilityOverrides ?? {};
  return mergeCompatibility(mergeCompatibility(process.compatibility, baseOverrides), overrides);
}

function buildProcessEntries(processes) {
  const entries = [];
  processes.forEach((proc) => {
    const processCompatibility = cloneCompatibility(proc.compatibility);
    entries.push({
      type: 'process',
      id: proc.id,
      label: proc.label,
      shortLabel: proc.shortLabel,
      compatibility: processCompatibility,
      parentId: null,
      parentLabel: null
    });

    (proc.variants || []).forEach((variant) => {
      const compatibility = resolveVariantCompatibility(proc, variant);
      entries.push({
        type: 'variant',
        id: variant.id,
        label: variant.label,
        shortLabel: variant.shortLabel,
        compatibility,
        parentId: proc.id,
        parentLabel: proc.label
      });
    });
  });
  return entries;
}

function buildCategoryLookup(categories) {
  const map = new Map();
  categories.forEach((category) => {
    const optionsMap = new Map(category.options.map((opt) => [opt.id, opt]));
    map.set(category.id, {
      id: category.id,
      label: category.label,
      options: optionsMap
    });
  });
  return map;
}

function isCompatible(requirements, selections) {
  return Object.entries(selections).every(([categoryId, optionId]) => {
    const allowed = requirements[categoryId];
    return Array.isArray(allowed) && allowed.includes(optionId);
  });
}

function optionIsSupported(categoryId, optionId) {
  const hypotheticalSelection = { ...state.selected, [categoryId]: optionId };
  return processEntries.some((entry) =>
    isCompatible(entry.compatibility, hypotheticalSelection)
  );
}

function buildVariantStates(process, selections) {
  return (process.variants || []).map((variant) => {
    const compatibility = resolveVariantCompatibility(process, variant);
    const match = isCompatible(compatibility, selections);
    return {
      ...variant,
      compatibility,
      match
    };
  });
}

function ensureGlobalTooltip() {
  if (globalTooltip) return globalTooltip;
  const tip = document.createElement('div');
  tip.className = 'global-tooltip hidden';
  document.body.appendChild(tip);
  globalTooltip = tip;
  return tip;
}

function setGlobalTooltipContent(titleText, compatibility) {
  ensureGlobalTooltip();
  globalTooltip.innerHTML = '';
  const title = document.createElement('p');
  title.className = 'trait-title';
  title.textContent = titleText;
  globalTooltip.appendChild(title);

  const list = document.createElement('ul');
  list.className = 'trait-list';
  Object.entries(compatibility || {}).forEach(([categoryId, optionIds]) => {
    const category = categoryLookup.get(categoryId);
    const label = category?.label ?? categoryId;
    const values = Array.isArray(optionIds) ? optionIds : [optionIds];
    const optionLabels = values
      .map((id) => category?.options.get(id)?.label ?? id)
      .join(', ');
    const item = document.createElement('li');
    item.innerHTML = `<span>${label}</span> ${optionLabels}`;
    list.appendChild(item);
  });
  globalTooltip.appendChild(list);
}

function showGlobalTooltipAt(x, y) {
  ensureGlobalTooltip();
  globalTooltip.style.left = `${x + 14}px`;
  globalTooltip.style.top = `${y + 14}px`;
  globalTooltip.classList.remove('hidden');
}

function hideGlobalTooltip() {
  if (!globalTooltip) return;
  globalTooltip.classList.add('hidden');
}

function createProcessCard(process, selectionsActive, baseMatch, variantStates) {
  const hasVariantMatch = variantStates.some((variant) => variant.match);

  const card = document.createElement('article');
  card.className = 'process-card';
  if (baseMatch) {
    card.classList.add('match');
  } else if (hasVariantMatch) {
    card.classList.add('variant-match');
  }
  if (selectionsActive && !baseMatch && !hasVariantMatch) {
    card.classList.add('dimmed');
  }

  const header = document.createElement('div');
  header.className = 'process-header';

  const title = document.createElement('h3');
  title.textContent = process.label;
  header.appendChild(title);

  const status = document.createElement('p');
  status.className = 'match-status';
  if (!selectionsActive) {
    status.textContent = 'Awaiting filter selections.';
  } else if (!baseMatch && !variantStates.some(v => v.match)) {
    status.textContent = 'No compatibility under the current criteria.';
  } else {
    status.textContent = '';
    status.classList.add('hidden');
  }

  card.append(header, status);

  if (variantStates.length > 0) {
    const variantList = document.createElement('ul');
    variantList.className = 'variant-list';

    variantStates.forEach((variant) => {
      const item = document.createElement('li');
      item.className = 'variant-pill';
      if (variant.match) {
        item.classList.add('match');
      } else if (selectionsActive) {
        item.classList.add('dimmed');
      }

      const label = document.createElement('span');
      label.className = 'variant-label';
      label.textContent = variant.label;
      item.appendChild(label);

      // Variant-specific hover tooltip anchored to cursor
      item.addEventListener('mouseenter', (e) => {
        setGlobalTooltipContent(variant.label, variant.compatibility);
        showGlobalTooltipAt(e.clientX, e.clientY);
      });
      item.addEventListener('mousemove', (e) => {
        showGlobalTooltipAt(e.clientX, e.clientY);
      });
      item.addEventListener('mouseleave', hideGlobalTooltip);
      item.addEventListener('focus', (e) => {
        // approximate center of element for keyboard focus
        const rect = item.getBoundingClientRect();
        setGlobalTooltipContent(variant.label, variant.compatibility);
        showGlobalTooltipAt(rect.right, rect.top);
      });
      item.addEventListener('blur', hideGlobalTooltip);

      variantList.appendChild(item);
    });

    card.appendChild(variantList);
  }

  return card;
}

function renderFilters() {
  filtersContainer.innerHTML = '';
  state.config.categories.forEach((category) => {
    const block = document.createElement('section');
    block.className = 'category-block';
    block.dataset.categoryId = category.id;

    const heading = document.createElement('h2');
    heading.className = 'category-title';
    heading.textContent = category.label;

    const optionsWrap = document.createElement('div');
    optionsWrap.className = 'options-grid';

    category.options.forEach((option) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'option-card';
      button.textContent = option.label;
      button.dataset.categoryId = category.id;
      button.dataset.optionId = option.id;
      button.addEventListener('click', onOptionClick);
      optionsWrap.appendChild(button);
    });

    block.append(heading, optionsWrap);
    filtersContainer.appendChild(block);
  });
}

function onOptionClick(event) {
  const button = event.currentTarget;
  const categoryId = button.dataset.categoryId;
  const optionId = button.dataset.optionId;
  const isSelected = state.selected[categoryId] === optionId;

  if (!isSelected && button.classList.contains('disabled')) {
    return;
  }

  if (isSelected) {
    const { [categoryId]: _removed, ...rest } = state.selected;
    state.selected = rest;
  } else {
    state.selected = { ...state.selected, [categoryId]: optionId };
  }

  updateUI();
}

function updateUI() {
  updateOptionStates();
  updateResults();
}

function updateOptionStates() {
  const optionButtons = filtersContainer.querySelectorAll('.option-card');
  optionButtons.forEach((button) => {
    const categoryId = button.dataset.categoryId;
    const optionId = button.dataset.optionId;
    const isSelected = state.selected[categoryId] === optionId;

    if (isSelected) {
      button.classList.add('selected');
      button.classList.remove('disabled');
      button.setAttribute('aria-pressed', 'true');
      return;
    }

    button.classList.remove('selected');
    const supported = optionIsSupported(categoryId, optionId);
    button.classList.toggle('disabled', !supported);
    button.setAttribute('aria-pressed', 'false');
    button.setAttribute('aria-disabled', String(!supported));
  });
}

function updateResults() {
  resultsEl.innerHTML = '';
  const selectionsActive = Object.keys(state.selected).length > 0;
  let anyMatch = false;

  state.config.processes.forEach((process) => {
    const baseMatch = isCompatible(process.compatibility, state.selected);
    const variantStates = buildVariantStates(process, state.selected);
    if (baseMatch || variantStates.some((variant) => variant.match)) {
      anyMatch = true;
    }

    const card = createProcessCard(process, selectionsActive, baseMatch, variantStates);
    resultsEl.appendChild(card);
  });

  const showEmptyState = selectionsActive && !anyMatch;
  emptyMessageEl.classList.toggle('hidden', !showEmptyState);
}

function handleReset() {
  state.selected = {};
  updateUI();
}

function parseCSV(text) {
  const rows = [];
  let i = 0, field = '', inQuotes = false, row = [];
  const pushField = () => { row.push(field); field = ''; };
  const pushRow = () => { rows.push(row); row = []; };
  for (const ch of text.replace(/^\uFEFF/, '')) { // strip BOM
    if (inQuotes) {
      if (ch === '"') {
        inQuotes = false;
      } else {
        field += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        pushField();
      } else if (ch === '\n') {
        pushField();
        pushRow();
      } else if (ch === '\r') {
        // ignore
      } else {
        field += ch;
      }
    }
  }
  // flush last field/row if not newline-terminated
  if (field.length > 0 || row.length > 0) { pushField(); pushRow(); }
  // trim trailing empty rows
  while (rows.length && rows[rows.length - 1].every((c) => c === '')) rows.pop();
  return rows;
}

function truthyMark(v) {
  const s = (v || '').trim().toLowerCase();
  return s === 'x' || s === '1' || s === 'yes' || s === 'true';
}

function parseHeaderCell(cell) {
  const [id, label] = (cell || '').split('|');
  return { id: (id || '').trim(), label: (label || id || '').trim() };
}

function buildConfigFromCSV(text) {
  const rows = parseCSV(text);
  if (rows.length < 3) throw new Error('CSV requires two header rows + data');

  const header1 = rows[0];
  const header2 = rows[1];
  // Identity columns: process_id, process_label, variant_id, variant_label, summary
  const ID_COLS = 5;
  // Build categories and options from header rows
  const categories = [];
  const categoryIndex = new Map();
  const optionsByCategory = new Map();

  for (let c = ID_COLS; c < header1.length; c++) {
    const cat = parseHeaderCell(header1[c]);
    const opt = parseHeaderCell(header2[c]);
    if (!cat.id || !opt.id) continue;
    if (!categoryIndex.has(cat.id)) {
      categoryIndex.set(cat.id, categories.length);
      categories.push({ id: cat.id, label: cat.label, options: [] });
      optionsByCategory.set(cat.id, new Set());
    }
    const catIdx = categoryIndex.get(cat.id);
    const seen = optionsByCategory.get(cat.id);
    if (!seen.has(opt.id)) {
      categories[catIdx].options.push({ id: opt.id, label: opt.label });
      seen.add(opt.id);
    }
  }

  // Group variants by process
  const processMap = new Map();
  for (let r = 2; r < rows.length; r++) {
    const row = rows[r];
    if (!row || row.length === 0) continue;
    const process_id = (row[0] || '').trim();
    const process_label = (row[1] || '').trim();
    const variant_id = (row[2] || '').trim();
    const variant_label = (row[3] || '').trim();
    const summary = (row[4] || '').trim();
    if (!process_id || !variant_id) continue;

    if (!processMap.has(process_id)) {
      processMap.set(process_id, {
        id: process_id,
        shortLabel: process_id,
        label: process_label || process_id,
        compatibility: {},
        variants: []
      });
    }

    const compatibility = {};
    for (let c = ID_COLS; c < Math.max(header1.length, row.length); c++) {
      const cat = parseHeaderCell(header1[c]);
      const opt = parseHeaderCell(header2[c]);
      if (!cat.id || !opt.id) continue;
      if (truthyMark(row[c])) {
        if (!Array.isArray(compatibility[cat.id])) compatibility[cat.id] = [];
        compatibility[cat.id].push(opt.id);
      }
    }

    processMap.get(process_id).variants.push({
      id: variant_id,
      shortLabel: variant_id,
      label: variant_label || variant_id,
      summary,
      compatibility
    });
  }

  const processes = Array.from(processMap.values());
  return { categories, processes };
}

async function loadConfig() {
  // Prefer CSV; fallback to JSON for dev convenience
  const csvResp = await fetch('process_variants.csv', { cache: 'no-store' });
  if (csvResp.ok) {
    const text = await csvResp.text();
    return buildConfigFromCSV(text);
  }
  const response = await fetch('config.json', { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`Unable to load config (CSV/JSON): ${response.status} ${response.statusText}`);
  }
  return response.json();
}

async function init() {
  try {
    state.config = await loadConfig();
    categoryLookup = buildCategoryLookup(state.config.categories);
    processEntries = buildProcessEntries(state.config.processes);
    renderFilters();
    resetButton.addEventListener('click', handleReset);
    updateUI();
  } catch (error) {
    console.error(error);
    emptyMessageEl.classList.remove('hidden');
    emptyMessageEl.textContent = 'Configuration could not be loaded.';
  }
}

window.addEventListener('DOMContentLoaded', init);
