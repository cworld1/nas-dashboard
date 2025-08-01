// Main state
let prefixes = {};
let groups = [];
let otherGroups = [];
let currentMode = "auto";

/**
 * Entry point: initialize dashboard on window load
 */
window.onload = () => {
  currentMode = detectAutoMode();
  const initialBtn = document.querySelector(
    '.mode-toggle > .group-btn[data-mode="auto"]'
  );
  if (initialBtn) initialBtn.classList.add("active");
  loadData();
};

/**
 * Detects network mode (LAN/WAN) based on hostname
 * @returns {string} "lan" or "wan"
 */
function detectAutoMode() {
  const lanPrefixes = ["192.", "10.", "172."];
  const lanHostnames = ["localhost", "127.0.0.1", "::1"];
  if (lanHostnames.includes(location.hostname)) return "lan";
  if (lanPrefixes.some((prefix) => location.hostname.startsWith(prefix)))
    return "lan";
  return "wan";
}

/**
 * Loads service configuration from services.json
 */
async function loadData() {
  try {
    const response = await fetch("services.json");
    const data = await response.json();
    prefixes = data.prefixes || {};
    groups = data["prefix-groups"] || [];
    otherGroups = data["other-groups"] || [];
    renderPrefixOptions();
    renderGroups();
    renderOtherGroups();
    updateLinks();
  } catch (e) {
    console.error("无法加载服务配置文件:", e);
  }
}

/**
 * Handles mode switching via button click
 * @param {HTMLElement} buttonEl
 */
function switchMode(buttonEl) {
  document
    .querySelectorAll(".mode-toggle > .group-btn")
    .forEach((btn) => btn.classList.remove("active"));
  buttonEl.classList.add("active");
  const selected = buttonEl.getAttribute("data-mode");
  currentMode = selected === "auto" ? detectAutoMode() : selected;
  renderPrefixOptions();
  updateLinks();
}

/**
 * Renders prefix options in the selector
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
 * Renders service groups and their items
 */
function renderGroups() {
  const container = document.getElementById("prefixGroupContainer");
  if (!container) return;
  container.innerHTML = "";
  for (const group of groups) {
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
      link.className = "link";
      link.href = "#";
      link.innerHTML = `
        ${item.icon || ""}
        <div class="info">
          <div class="title">${item.name || item.id}</div>
          <div class="desc">
            <span class="ports">${item.lan || "-"} / ${item.wan || "-"}</span>
          </div>
        </div>
      `;
      content.appendChild(link);
    }
    block.appendChild(content);
    container.appendChild(block);
  }
}

/**
 * Renders other service groups and their items
 */
function renderOtherGroups() {
  const container = document.getElementById("otherGroupContainer");
  if (!container) return;
  container.innerHTML = "";
  for (const group of otherGroups) {
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
      link.className = "link";
      link.href = item.url
        ? item.url.replace("%1", prefixes.LAN?.[0]?.prefix || "")
        : "#";
      link.innerHTML = `
        ${item.icon || ""}
        <div class="info">
          <div class="title">${item.name || item.id}</div>
          <div class="desc">
            <span class="desc">${item.desc || "-"}</span>
          </div>
        </div>
      `;
      content.appendChild(link);
    }
    block.appendChild(content);
    container.appendChild(block);
  }
}

/**
 * Updates service links based on selected prefix and mode
 */
function updateLinks() {
  const prefixSelect = document.getElementById("prefixSelector");
  if (!prefixSelect) return;
  const list = prefixes[currentMode.toUpperCase()] || [];
  const selectedPrefix = list[prefixSelect.selectedIndex];
  if (!selectedPrefix) return;
  const base = selectedPrefix.prefix;
  const protocol = selectedPrefix.https ? "https://" : "http://";
  const mode = selectedPrefix.mode || null;
  const listSet = selectedPrefix.list || [];
  for (const group of groups) {
    for (const item of group.items) {
      const el = document.getElementById(item.id);
      if (!el) continue;
      const serviceId = item.id;
      const portOrSub = currentMode === "lan" ? item.lan : item.wan;
      const urlTemplate = currentMode === "lan" ? item.lanUrl : item.wanUrl;
      // WhiteList mode
      if (mode === "whiteList") {
        if (listSet.includes(serviceId)) {
          if (urlTemplate && portOrSub) {
            el.href = `${protocol}${urlTemplate
              .replace("%1", base)
              .replace("%2", portOrSub)}`;
          } else {
            el.href = "#";
          }
          el.classList.remove("disabled");
        } else {
          el.href = "#";
          el.classList.add("disabled");
        }
        continue;
      }
      // BlackList mode
      if (mode === "blackList") {
        if (listSet.includes(serviceId)) {
          el.href = "#";
          el.classList.add("disabled");
          continue;
        }
      }
      // Default: check port/url
      if (portOrSub && urlTemplate) {
        el.href = `${protocol}${urlTemplate
          .replace("%1", base)
          .replace("%2", portOrSub)}`;
        el.classList.remove("disabled");
      } else {
        el.href = "#";
        el.classList.add("disabled");
      }
    }
  }
}
