// State
let prefixes = {};
let groups = [];
let otherGroups = [];
let currentMode = "wan";
// Cache service elements to avoid repeated queries
let serviceEls = new Map();
// Global blacklist (from services.json top-level)
let globalBlackList = [];

// Reusable link arrow icon
const LINK_ARROW_SVG = `<svg class="link-icon" xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24"><g fill="none"><path d="M24 0v24H0V0zM12.593 23.258l-.011.002l-.071.035l-.02.004l-.014-.004l-.071-.035q-.016-.005-.024.005l-.004.01l-.017.428l.005.02l.01.013l.104.074l.015.004l.012-.004l.104-.074l.012-.016l.004-.017l-.017-.427q-.004-.016-.017-.018m.265-.113l-.013.002l-.185.093l-.01.01l-.003.011l.018.43l.005.012l.008.007l.201.093q.019.005.029-.008l.004-.014l-.034-.614q-.005-.019-.02-.022m-.715.002a.02.02 0 0 0-.027.006l-.006.014l-.034.614q.001.018.017.024l.015-.002l.201-.093l.01-.008l.004-.011l.017-.43l-.003-.012l-.01-.01z"/><path fill="currentColor" d="m14.707 5.636l5.657 5.657a1 1 0 0 1 0 1.414l-5.657 5.657a1 1 0 0 1-1.414-1.414l3.95-3.95H4a1 1 0 1 1 0-2h13.243l-3.95-3.95a1 1 0 1 1 1.414-1.414"/></g></svg>`;

// Helpers: per-mode prefix index
function getPrefixKey(mode) {
  return `dashboard_prefixIndex_${mode}`;
}
function getSavedPrefixIndex(mode) {
  const idx = parseInt(localStorage.getItem(getPrefixKey(mode)), 10);
  return Number.isNaN(idx) ? 0 : idx;
}
function applySavedPrefixIndex(selectEl, mode) {
  if (!selectEl) return;
  const idx = getSavedPrefixIndex(mode);
  if (selectEl.options.length > 0) {
    selectEl.selectedIndex = Math.min(Math.max(idx, 0), selectEl.options.length - 1);
  }
}

// DOM helpers
function setLinkState(el, href, disabled) {
  el.href = href;
  el.classList.toggle("disabled", !!disabled);
}
// Toggle clickable state and href in one place
function setClickable(el, href) {
  if (href) {
    el.href = href;
    el.classList.add("clickable");
  } else {
    el.removeAttribute("href");
    el.classList.remove("clickable");
  }
}
// URL builder; when %2 is empty, remove surrounding separators
function buildUrl(protocol, template, base, portOrSub) {
  // Intelligent replacement: drop separators when %2 is empty
  let t = template || "";
  if (portOrSub) {
    t = t.replace(/%2/g, portOrSub);
  } else {
    t = t.replace(/:\s*%2/g, "").replace(/%2\s*\./g, "").replace(/%2/g, "");
  }
  t = t.replace(/%1/g, base);
  // Collapse redundant slashes (preserves http(s)://)
  t = t.replace(/([^:]\/)\/+/g, "$1");
  return `${protocol}${t}`;
}

// Blacklist helpers (Array or Set)
function isBlacklisted(serviceId, blackSet) {
  if (!blackSet) return false;
  if (Array.isArray(blackSet)) return blackSet.includes(serviceId);
  if (typeof blackSet.has === "function") return blackSet.has(serviceId);
  return false;
}
// Merge global + prefix blacklists
function mergeBlacklist(globalList, prefixList) {
  return new Set([...(globalList || []), ...((prefixList || []))]);
}

// Resolve link mode: lan | ddns
function determineLinkMode(uiMode, prefix) {
  const cfg = (prefix && prefix.linkMode) ? String(prefix.linkMode).toLowerCase() : null;
  if (cfg === "lan" || cfg === "ddns") return cfg;
  // Fallback to UI mode
  return uiMode === "lan" ? "lan" : "ddns";
}

// Per-prefix exceptions map
function getExceptionMap(prefix) {
  const map = new Map();
  const list = (prefix && Array.isArray(prefix.exceptions)) ? prefix.exceptions : [];
  for (const ex of list) {
    if (!ex || !ex.id) continue;
    map.set(ex.id, ex);
  }
  return map;
}

/**
 * Init on window load
 */
window.onload = () => {
  const savedMode = localStorage.getItem("dashboard_mode");
  currentMode = savedMode === "lan" ? "lan" : "wan";
  loadData().then(() => {
    const initialBtn = document.querySelector(`.mode-toggle > .group-btn[data-mode="${currentMode}"]`);
    if (initialBtn) initialBtn.classList.add("active");
    const prefixSelect = document.getElementById("prefixSelector");
    if (prefixSelect) applySavedPrefixIndex(prefixSelect, currentMode);
    updateLinks();
  }).catch((e) => console.error("Init failed:", e));
};

/**
 * Load config from services.json
 */
async function loadData() {
  try {
    const response = await fetch("services.json");
    const data = await response.json();
    globalBlackList = data.blackList || [];
    prefixes = data.prefixes || {};
    groups = data["prefix-groups"] || [];
    otherGroups = data["other-groups"] || [];
    renderPrefixOptions();
    // Prefix groups: no initial href/clickable
    renderGroupBlocks("prefixGroupContainer", groups, () => ({ href: null, clickable: false }));
    renderOtherGroups();
    const prefixSelect = document.getElementById("prefixSelector");
    if (prefixSelect) {
      prefixSelect.onchange = () => {
        localStorage.setItem(getPrefixKey(currentMode), prefixSelect.selectedIndex);
        updateLinks();
      };
    }
  } catch (e) {
    console.error("Failed to load services.json:", e);
    throw e;
  }
}

/**
 * Handle mode switching
 */
function switchMode(buttonEl) {
  document.querySelectorAll(".mode-toggle > .group-btn").forEach((btn) => btn.classList.remove("active"));
  buttonEl.classList.add("active");
  const selected = buttonEl.dataset.mode;
  currentMode = selected === "lan" ? "lan" : "wan";
  localStorage.setItem("dashboard_mode", currentMode);
  renderPrefixOptions();
  const newPrefixSelect = document.getElementById("prefixSelector");
  if (newPrefixSelect) applySavedPrefixIndex(newPrefixSelect, currentMode);
  updateLinks();
}

/**
 * Generic block renderer for groups
 * @param {string} containerId target container element id
 * @param {Array} sourceGroups groups to render
 * @param {(item:object)=>({href:string|null, clickable:boolean})} itemResolver initial href/clickable resolver
 */
function renderGroupBlocks(containerId, sourceGroups, itemResolver) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = "";
  if (containerId === "prefixGroupContainer") serviceEls.clear();

  for (const group of sourceGroups) {
    const block = document.createElement("div");
    block.className = "block";
    const title = document.createElement("h2");
    title.textContent = group.name || "";
    block.appendChild(title);

    const content = document.createElement("div");
    content.className = "block-content";

    for (const item of group.items) {
      const link = document.createElement("a");
      link.id = item.id;

      const { href, clickable } = itemResolver(item);
      link.className = clickable ? "link clickable" : "link";
      if (href) link.href = href;

      link.innerHTML = `
        ${item.icon || ""}
        <div class="info">
          <div class="title">${item.name || item.id}</div>
          <div class="desc">
            <span class="${containerId === 'otherGroupContainer' ? 'desc' : 'ports'}">
              ${containerId === "otherGroupContainer" ? (item.desc || "-") : `${item.lan || "-"} / ${item.wan || "-"}`}
            </span>
          </div>
        </div>
        ${LINK_ARROW_SVG}
      `;
      content.appendChild(link);

      if (containerId === "prefixGroupContainer") {
        serviceEls.set(item.id, link);
      }
    }

    block.appendChild(content);
    container.appendChild(block);
  }
}

/**
 * Render prefix selector options
 */
function renderPrefixOptions() {
  const prefixSelect = document.getElementById("prefixSelector");
  if (!prefixSelect) return;
  prefixSelect.innerHTML = "";
  const list = prefixes[currentMode.toUpperCase()] || [];
  for (const [index, item] of list.entries()) {
    const opt = document.createElement("option");
    opt.value = index;
    opt.textContent = item.name;
    prefixSelect.appendChild(opt);
  }
}

/**
 * Render other groups with static URLs clickable
 */
function renderOtherGroups() {
  renderGroupBlocks("otherGroupContainer", otherGroups, (item) => {
    const hasUrl = !!item.url;
    return {
      href: hasUrl ? item.url.replace("%1", item.desc || "") : null,
      clickable: hasUrl
    };
  });
}

/**
 * Compute effective href for a service item; null if not buildable
 */
function resolveLink(selectedPrefix, item, uiMode, exMap) {
  const protocol = selectedPrefix.https ? "https://" : "http://";
  const base = selectedPrefix.prefix;
  const globalLinkMode = determineLinkMode(uiMode, selectedPrefix);

  const ex = exMap.get(item.id) || {};
  const exLinkRaw = ex.linkMode ? String(ex.linkMode).toLowerCase() : null;
  const effLinkMode = (exLinkRaw === "lan" || exLinkRaw === "ddns") ? exLinkRaw : globalLinkMode;
  const effBase = ex.base || base;
  const effProtocol = (typeof ex.https === "boolean") ? (ex.https ? "https://" : "http://") : protocol;

  let urlTemplate, portOrSub, ignoreMissing2 = false;
  if (effLinkMode === "lan") {
    urlTemplate = item.lanUrl;
    portOrSub = item.lan;
    if (effBase.includes(":") && urlTemplate && urlTemplate.includes(":%2")) {
      portOrSub = "";
      ignoreMissing2 = true;
    }
  } else {
    urlTemplate = item.ddnsUrl;
    portOrSub = item.wan;
  }
  if (!urlTemplate) return null;
  const needs2 = urlTemplate.includes("%2");
  if (needs2 && !portOrSub && !ignoreMissing2) return null;

  return buildUrl(effProtocol, urlTemplate, effBase, portOrSub);
}

/**
 * Update service links based on selected prefix and mode
 */
function updateLinks() {
  const prefixSelect = document.getElementById("prefixSelector");
  if (!prefixSelect) return;

  const list = prefixes[currentMode.toUpperCase()] || [];
  const selectedPrefix = list[prefixSelect.selectedIndex];

  // No prefix: apply global blacklist; others keep normal appearance
  if (!selectedPrefix) {
    const blackSet = mergeBlacklist(globalBlackList, []);
    for (const group of groups) {
      for (const item of group.items) {
        const el = serviceEls.get(item.id);
        if (!el) continue;
        if (isBlacklisted(item.id, blackSet)) {
          setLinkState(el, "#", true);
          el.classList.remove("clickable");
        } else {
          el.classList.remove("disabled");
          setClickable(el, null);
        }
      }
    }
    return;
  }

  const blackSet = mergeBlacklist(globalBlackList, selectedPrefix.blackList || []);
  const exMap = getExceptionMap(selectedPrefix);

  for (const group of groups) {
    for (const item of group.items) {
      const el = serviceEls.get(item.id);
      if (!el) continue;

      if (isBlacklisted(item.id, blackSet)) {
        setLinkState(el, "#", true);
        el.classList.remove("clickable");
        continue;
      }

      el.classList.remove("disabled");
      const href = resolveLink(selectedPrefix, item, currentMode, exMap);
      setClickable(el, href);
    }
  }
}
