let prefixes = {};
let groups = [];
let currentMode = "auto";

window.onload = () => {
  currentMode = detectAutoMode();

  const initialBtn = document.querySelector(
    '.mode-toggle > .group-btn[data-mode="auto"]'
  );
  if (initialBtn) initialBtn.classList.add("active");

  loadData();
};

function detectAutoMode() {
  const lanPrefixes = ["192.", "10.", "172."];
  const lanHostnames = ["localhost", "127.0.0.1", "::1"];
  if (lanHostnames.includes(location.hostname)) return "lan";
  if (lanPrefixes.some((prefix) => location.hostname.startsWith(prefix)))
    return "lan";
  return "wan";
}

async function loadData() {
  try {
    const response = await fetch("services.json");
    const data = await response.json();
    prefixes = data.prefixes || {};
    groups = data["prefix-groups"] || [];

    renderPrefixOptions();
    renderGroups();
    updateLinks();
  } catch (e) {
    console.error("无法加载服务配置文件:", e);
  }
}

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

function renderPrefixOptions() {
  const prefixSelect = document.getElementById("prefixSelector");
  if (!prefixSelect) return;

  prefixSelect.innerHTML = "";

  const list = prefixes[currentMode.toUpperCase()] || [];
  list.forEach((item, index) => {
    const opt = document.createElement("option");
    opt.value = index;
    opt.textContent = item.name;
    prefixSelect.appendChild(opt);
  });
}

function renderGroups() {
  const container = document.getElementById("groupContainer");
  if (!container) return;
  container.innerHTML = "";

  groups.forEach((group) => {
    const block = document.createElement("div");
    block.className = "block";

    const title = document.createElement("h2");
    title.textContent = group.name || "";
    block.appendChild(title);

    const content = document.createElement("div");
    content.className = "block-content";

    group.items.forEach((item) => {
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
    });

    block.appendChild(content);
    container.appendChild(block);
  });
}

function updateLinks() {
  const prefixSelect = document.getElementById("prefixSelector");
  if (!prefixSelect) return;

  const list = prefixes[currentMode.toUpperCase()] || [];
  const selectedPrefix = list[prefixSelect.selectedIndex];
  if (!selectedPrefix) return;

  const base = selectedPrefix.prefix;
  const isHttps = selectedPrefix.https;
  const protocol = isHttps ? "https://" : "http://";

  const mode = selectedPrefix.mode || null;
  const listSet = selectedPrefix.list || [];

  groups.forEach((group) => {
    group.items.forEach((item) => {
      const el = document.getElementById(item.id);
      if (!el) return;

      const serviceId = item.id;
      const portOrSub = currentMode === "lan" ? item.lan : item.wan;
      const urlTemplate = currentMode === "lan" ? item.lanUrl : item.wanUrl;

      // 优先处理 whitelist 模式
      if (mode === "whiteList") {
        if (listSet.includes(serviceId)) {
          // ✅ 强制启用，哪怕缺失 url/port
          if (urlTemplate && portOrSub) {
            const fullUrl =
              protocol +
              urlTemplate.replace("%1", base).replace("%2", portOrSub);
            el.href = fullUrl;
          } else {
            el.href = "#"; // fallback 占位
          }
          el.classList.remove("disabled");
        } else {
          // ❌ 不在白名单中，禁用
          el.href = "#";
          el.classList.add("disabled");
        }
        return; // 👈 不继续往下执行
      }

      // blackList 模式
      if (mode === "blackList") {
        if (listSet.includes(serviceId)) {
          el.href = "#";
          el.classList.add("disabled");
          return;
        }
      }

      // 默认情况：看 port/url 是否存在
      if (portOrSub && urlTemplate) {
        const fullUrl =
          protocol + urlTemplate.replace("%1", base).replace("%2", portOrSub);
        el.href = fullUrl;
        el.classList.remove("disabled");
      } else {
        el.href = "#";
        el.classList.add("disabled");
      }
    });
  });
}
