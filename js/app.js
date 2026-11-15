var launcherAPI = window.launcherAPI || null;
const i18n = window.MCSharedI18n;
const t = (key, params) => (i18n?.t ? i18n.t(key, params) : key);
let ws = null;
let reconnectSocketTimer = null;
let manualSocketClose = false;
let activeMenu = null;
let menuQuery = "";
let menuBusyState = false;
let currentSessionId = null;
let chatHistory = [];
const chatHistoryLimit = 400;
const inputHistoryLimit = 40;
const inputHistory = [];
let inputHistoryIndex = -1;
let inputDraft = "";
const hiddenBaseNames = new Set();

function reportRendererError(kind, errorLike, where = "app") {
  try {
    const error = errorLike instanceof Error ? errorLike : new Error(String(errorLike));
    launcherAPI?.reportRendererError?.({
      kind,
      where,
      message: error.message || String(errorLike),
      stack: error.stack || "",
      href: window.location.href,
      raw: String(errorLike ?? ""),
    });
  } catch { }
}

window.addEventListener("error", (event) => {
  if (!event?.error) return;
  reportRendererError("error", event.error, "app.window.error");
});

window.addEventListener("unhandledrejection", (event) => {
  const reason = event?.reason;
  reportRendererError("unhandledrejection", reason instanceof Error ? reason : new Error(String(reason)), "app.window.unhandledrejection");
});

// ── DOM refs ──────────────────────────────────────────────────────────────────
const $ = (id) => document.getElementById(id);
const chat = $("chat");
const input = $("input");
const reconnectPanel = $("reconnect-panel");
const reconnectButton = $("reconnect-button");
const reconnectSubtitle = reconnectPanel?.querySelector(".reconnect-subtitle");
const reconnectAttempt = reconnectPanel?.querySelector(".reconnect-attempt");
const menuPanel = $("menu-panel");
const menuTitle = $("menu-title");
const menuMeta = $("menu-meta");
const menuTypeBadge = $("menu-type-badge");
const menuSearch = $("menu-search");
const menuSearchClear = $("menu-search-clear");
const menuBaseFilters = $("menu-base-filters");
const menuResults = $("menu-results");
const menuGrid = $("menu-grid");
const menuEmpty = $("menu-empty");
const menuBusy = $("menu-busy");
const sidebarKicker = document.querySelector(".sidebar-kicker");
const menuCloseBtn = $("menu-close-btn");
const inventoryButton = $("inventory-button");
const endSessionButton = $("end-session-button");
const hudHealth = $("hud-health");
const hudFood = $("hud-food");
const actionModal = $("action-modal");
const actionModalTitle = $("action-modal-title");
const actionModalText = $("action-modal-text");
const actionModalCloseBtn = $("action-modal-close-btn");
const actionBtnLeft = $("action-btn-left");
const actionBtnRight = $("action-btn-right");
const actionBtnUse = $("action-btn-use");
const actionBtnDrop = $("action-btn-drop");

let socketReconnectAttempt = 0;
let onActionSelected = null;

// ── Init icons ────────────────────────────────────────────────────────────────
window.lucide?.createIcons?.({ icons: window.lucide.icons, attrs: { width: 16, height: 16, "stroke-width": 2.2 } });

// ── Helpers ───────────────────────────────────────────────────────────────────
function revealWindowWhenMenuReady() {
  document.body.style.visibility = "visible";
  launcherAPI?.menuReady?.().catch(() => { });
}

async function setupLanguage() {
  try {
    const cfg = await launcherAPI?.getConfig?.();
    const lang = cfg?.launcher?.language || "es";
    i18n?.setLanguage?.(lang);
  } catch {
    i18n?.setLanguage?.("es");
  }
}

function rerenderLocalizedUI() {
  i18n?.applyTranslations?.(document);
  if (activeMenu) renderMenu(activeMenu);
  else clearMenu();
  setBotStatus(sidebarKicker?.dataset?.status || "offline");
}

function sanitizeVisibleText(value) {
  if (window.MCShared?.sanitizeVisibleText) return window.MCShared.sanitizeVisibleText(value);
  return String(value ?? "").replace(/\uFFFD+/g, "").replace(/[\u0000-\u001F\u007F]/g, " ").replace(/\s+/g, " ").trim();
}

function formatVital(value) {
  if (window.MCShared?.formatVital) return window.MCShared.formatVital(value);
  const n = Number(value);
  return Number.isFinite(n) ? `${Math.max(0, Math.min(20, Math.round(n)))}/20` : "--/20";
}

function sendSocketMessage(payload) {
  if (ws?.readyState !== WebSocket.OPEN) return false;
  ws.send(typeof payload === "string" ? payload : JSON.stringify(payload));
  return true;
}

function setVitals(health, food) {
  hudHealth.textContent = formatVital(health);
  hudFood.textContent = formatVital(food);
}

// ── Input history ─────────────────────────────────────────────────────────────
function pushInputHistory(text) {
  text = String(text ?? "").trim();
  if (!text || inputHistory.at(-1) === text) { inputHistoryIndex = -1; inputDraft = ""; return; }
  inputHistory.push(text);
  if (inputHistory.length > inputHistoryLimit) inputHistory.shift();
  inputHistoryIndex = -1;
  inputDraft = "";
}

function stepInputHistory(direction) {
  if (!inputHistory.length) return;
  if (inputHistoryIndex === -1) { inputDraft = input.value; inputHistoryIndex = inputHistory.length; }
  inputHistoryIndex = Math.max(0, Math.min(inputHistory.length, inputHistoryIndex + direction));
  input.value = inputHistoryIndex === inputHistory.length ? inputDraft : (inputHistory[inputHistoryIndex] ?? "");
}

// ── Chat ──────────────────────────────────────────────────────────────────────
function resetChatHistory(sessionId, history = []) {
  currentSessionId = sessionId || null;
  chatHistory = Array.isArray(history) ? history.slice(-chatHistoryLimit) : [];
  chat.innerHTML = "";
  chatHistory.forEach(({ text, source, kind }) => renderLine(text, source || kind || "normal", false));
  chat.scrollTop = chat.scrollHeight;
}

let autoScrollEnabled = true;
let chatFilterQuery = "";
const chatFilterInput = $("chat-filter-input");
const chatScrollBtn = $("chat-scroll-btn");

if (chatFilterInput) {
  chatFilterInput.addEventListener("input", () => {
    chatFilterQuery = String(chatFilterInput.value || "").toLowerCase().trim();
    Array.from(chat.children).forEach((node) => {
      if (!chatFilterQuery) {
        node.style.display = "";
      } else {
        const matches = node.textContent.toLowerCase().includes(chatFilterQuery);
        node.style.display = matches ? "" : "none";
      }
    });
  });
}

if (chatScrollBtn) {
  chatScrollBtn.addEventListener("click", () => {
    autoScrollEnabled = !autoScrollEnabled;
    chatScrollBtn.classList.toggle("paused", !autoScrollEnabled);
    chatScrollBtn.textContent = autoScrollEnabled ? "⬇️ Auto-scroll" : "⏸️ Pausado";
    if (autoScrollEnabled) {
      chat.scrollTop = chat.scrollHeight;
    }
  });
}

const KIND_COLORS = { system: "#7dd3fc", player: "#ffffff", local: "#ffffff", server: "#fca5a5" };

function renderLine(text, kind = "normal", persist = true) {
  text = sanitizeVisibleText(text);
  if (!text) return;
  const atBottom = chat.scrollTop + chat.clientHeight >= chat.scrollHeight - 50;
  const line = document.createElement("div");
  line.textContent = text;
  if (KIND_COLORS[kind]) line.style.color = KIND_COLORS[kind];
  if (chatFilterQuery) {
    const matches = text.toLowerCase().includes(chatFilterQuery);
    line.style.display = matches ? "" : "none";
  }
  chat.appendChild(line);
  if (persist) {
    chatHistory.push({ text, source: kind });
    if (chatHistory.length > chatHistoryLimit) {
      chatHistory = chatHistory.slice(-chatHistoryLimit);
      while (chat.childNodes.length > chatHistoryLimit) chat.removeChild(chat.firstChild);
    }
  }
  if (autoScrollEnabled && atBottom) chat.scrollTop = chat.scrollHeight;
}

function appendLine(text, kind = "normal") { renderLine(text, kind, true); }

// ── Reconnect panel ───────────────────────────────────────────────────────────
function updateReconnectPanel({ visible, busy = false, buttonDisabled = false, buttonText = t("app.reconnect.button"), subtitle = "", attemptText = "" }) {
  reconnectPanel.classList.toggle("visible", Boolean(visible));
  reconnectPanel.dataset.reconnectState = busy ? "trying" : "idle";
  reconnectButton.disabled = Boolean(buttonDisabled);
  reconnectButton.textContent = buttonText;
  if (reconnectSubtitle) reconnectSubtitle.textContent = subtitle || t("app.reconnect.subtitle");
  if (reconnectAttempt) reconnectAttempt.textContent = attemptText || "";
}

function setBotStatus(status) {
  const s = String(status ?? "offline").toLowerCase();
  sidebarKicker.dataset.status = s === "online" ? "online" : s === "connecting" ? "connecting" : "offline";
  if (s === "online") {
    updateReconnectPanel({ visible: false });
  } else {
    const connecting = s === "connecting";
    updateReconnectPanel({
      visible: true,
      busy: connecting,
      buttonDisabled: connecting,
      buttonText: connecting ? t("app.status.restarting") : t("app.reconnect.button"),
      subtitle: connecting ? t("app.status.connecting") : t("app.reconnect.subtitle"),
      attemptText: connecting ? t("app.status.trying") : t("app.reconnect.waiting"),
    });
  }
}

// ── Minecraft Text Formatting ──────────────────────────────────────────────────
const MC_COLOR_CODES = {
  "0": "mc-c-0", "1": "mc-c-1", "2": "mc-c-2", "3": "mc-c-3",
  "4": "mc-c-4", "5": "mc-c-5", "6": "mc-c-6", "7": "mc-c-7",
  "8": "mc-c-8", "9": "mc-c-9", "a": "mc-c-a", "b": "mc-c-b",
  "c": "mc-c-c", "d": "mc-c-d", "e": "mc-c-e", "f": "mc-c-f",
};

const MC_STYLE_CODES = {
  "l": "mc-bold", "m": "mc-strike", "n": "mc-underline", "o": "mc-italic",
};

function escapeHTML(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function renderMinecraftFormattedHTML(text) {
  if (!text) return "";
  const sanitized = sanitizeVisibleText(String(text));
  const tokens = sanitized.split(/(?:§|&)([0-9a-fk-or])/gi);
  if (tokens.length === 1) return escapeHTML(tokens[0]);

  let currentColor = null;
  const currentStyles = new Set();
  let html = "";

  for (let i = 0; i < tokens.length; i++) {
    if (i % 2 === 1) {
      const code = tokens[i].toLowerCase();
      if (code === "r") {
        currentColor = null;
        currentStyles.clear();
      } else if (MC_COLOR_CODES[code]) {
        currentColor = MC_COLOR_CODES[code];
        currentStyles.clear();
      } else if (MC_STYLE_CODES[code]) {
        currentStyles.add(MC_STYLE_CODES[code]);
      }
    } else {
      const piece = tokens[i];
      if (!piece) continue;
      const classes = [];
      if (currentColor) classes.push(currentColor);
      for (const st of currentStyles) classes.push(st);

      if (classes.length) {
        html += `<span class="${classes.join(" ")}">${escapeHTML(piece)}</span>`;
      } else {
        html += escapeHTML(piece);
      }
    }
  }
  return html;
}

// ── Menu ──────────────────────────────────────────────────────────────────────
function clearMenu() {
  activeMenu = null;
  menuBusyState = false;
  menuPanel.classList.remove("visible", "busy");
  if (menuTypeBadge) menuTypeBadge.textContent = "🎒 Inventario";
  menuTitle.textContent = t("app.menu.none");
  menuMeta.textContent = t("app.menu.noneDesc");
  menuResults.textContent = menuGrid.innerHTML = menuBaseFilters.innerHTML = "";
  menuEmpty.textContent = t("app.menu.empty");
  menuBusy.textContent = t("app.menu.busy");
  menuSearch.value = menuQuery = "";
  if (menuSearchClear) menuSearchClear.classList.add("hidden");
}

const normalizeQueryText = (v) => String(v ?? "").trim().toLowerCase();
const getBaseLabel = (item) => normalizeQueryText(item.name ?? "");

const userUnhiddenBaseNames = new Set();

function isGlassPane(item) {
  if (!item) return false;
  const raw = `${item.name || ""} ${item.displayName || ""} ${item.customName || ""}`.toLowerCase();
  return (
    raw.includes("glass_pane") ||
    raw.includes("glasspane") ||
    raw.includes("glass pane") ||
    raw.includes("panel de cristal") ||
    raw.includes("panel de vidrio")
  );
}

const FRIENDLY_NAMES = {
  chest: "Cofre",
  trapped_chest: "Cofre trampa",
  torch: "Antorcha",
  lime_dye: "Tinte lima",
  green_dye: "Tinte verde",
  player_head: "Cabeza",
  compass: "Brújula",
  clock: "Reloj",
  nether_star: "Estrella",
  diamond: "Diamante",
  emerald: "Esmeralda",
  barrier: "Barrera",
  book: "Libro",
  iron_sword: "Espada hierro",
  diamond_sword: "Espada diamante",
};

function getFriendlyBaseName(baseName) {
  const norm = normalizeQueryText(baseName);
  if (norm.includes("glass_pane") || norm.includes("glasspane")) {
    const color = norm
      .replace("_stained_glass_pane", "")
      .replace("_glass_pane", "")
      .replace("stained_glass_pane", "")
      .replace("glass_pane", "")
      .trim();
    const colorMap = {
      black: "negro",
      white: "blanco",
      gray: "gris",
      light_gray: "gris claro",
      red: "rojo",
      blue: "azul",
      light_blue: "azul claro",
      cyan: "cian",
      purple: "morado",
      magenta: "magenta",
      pink: "rosa",
      lime: "lima",
      green: "verde",
      yellow: "amarillo",
      orange: "naranja",
      brown: "marrón",
    };
    const translatedColor = colorMap[color] || color;
    return translatedColor ? `Panel cristal ${translatedColor}` : "Panel de cristal";
  }
  return FRIENDLY_NAMES[norm] || baseName.replace(/_/g, " ");
}

function renderBaseFilters(items) {
  const counts = new Map();
  for (const item of items) {
    const b = getBaseLabel(item);
    if (b) counts.set(b, (counts.get(b) ?? 0) + 1);
  }
  menuBaseFilters.innerHTML = "";
  [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .forEach(([baseName, count]) => {
      const chip = document.createElement("button");
      chip.type = "button";
      const isHidden = hiddenBaseNames.has(baseName);
      chip.className = `menu-filter-chip${isHidden ? " hidden-filter" : ""}`;
      chip.title = isHidden ? "Oculto por defecto (clic para mostrar)" : "Clic para ocultar este tipo de ítem";
      chip.innerHTML = `<span>${isHidden ? "🚫 " : ""}${escapeHTML(getFriendlyBaseName(baseName))}</span><span class="chip-count">${count}</span>`;
      chip.addEventListener("click", () => {
        if (hiddenBaseNames.has(baseName)) {
          hiddenBaseNames.delete(baseName);
          userUnhiddenBaseNames.add(baseName);
          chip.classList.remove("hidden-filter");
          chip.querySelector("span").textContent = escapeHTML(getFriendlyBaseName(baseName));
          chip.title = "Clic para ocultar este tipo de ítem";
        } else {
          hiddenBaseNames.add(baseName);
          userUnhiddenBaseNames.delete(baseName);
          chip.classList.add("hidden-filter");
          chip.querySelector("span").textContent = `🚫 ${getFriendlyBaseName(baseName)}`;
          chip.title = "Oculto (clic para mostrar)";
        }
        applyMenuFilter();
      });
      menuBaseFilters.appendChild(chip);
    });
}

function renderMenu(menu) {
  if (!menu || !Array.isArray(menu.slots) || !menu.slots.length) return clearMenu();
  activeMenu = menu;
  menuPanel.classList.add("visible");
  menuPanel.classList.toggle("busy", menuBusyState);

  const isInventory = menu.windowId === "inventory" || String(menu.token || "").startsWith("personal-inventory");
  if (menuTypeBadge) {
    menuTypeBadge.textContent = isInventory ? "🎒 Hotbar / Bot" : "📦 Menú Servidor";
  }

  // Render formatted title with colors & styles (e.g. §f§lM§e§lL §0| §0Selector de modalidades)
  menuTitle.innerHTML = menu.title ? renderMinecraftFormattedHTML(menu.title) : (isInventory ? "Inventario del Bot" : t("app.menu.serverMenu"));

  // Default hide all glass panels (decorative fillers in server menus)
  for (const item of menu.slots) {
    const b = getBaseLabel(item);
    if (isGlassPane(item) && !userUnhiddenBaseNames.has(b)) {
      hiddenBaseNames.add(b);
    }
  }

  menuMeta.textContent = `Ranuras totales: ${menu.slots.length} • Clic directo o acciones rápidas`;
  menuPanel.dataset.token = menu.token || "";

  renderBaseFilters(menu.slots);
  menuGrid.innerHTML = "";
  applyMenuFilter();
}

function parseMenuQuery(rawQuery) {
  return { includes: String(rawQuery ?? "").trim().split(/\s+/).filter(Boolean).map(normalizeQueryText) };
}

function matchesMenuItem(item, filter) {
  if (hiddenBaseNames.has(getBaseLabel(item))) return false;
  if (!filter.includes.length) return true;
  const hay = normalizeQueryText(`${item.searchText || ""} ${item.customName || ""} ${item.displayName || ""} ${item.name || ""}`);
  return filter.includes.every((t) => hay.includes(t));
}

function detectItemActionHint(item) {
  const combined = `${item.customName ?? ""} ${item.displayName ?? ""} ${item.name ?? ""} ${Array.isArray(item.lore) ? item.lore.join(" ") : ""}`.toLowerCase();
  if (combined.includes("clic derecho") || combined.includes("click derecho") || combined.includes("right click")) {
    return "right";
  }
  if (combined.includes("clic izquierdo") || combined.includes("click izquierdo") || combined.includes("left click")) {
    return "left";
  }
  return null;
}

const ICON_RULES = [
  { match: ["player_head", "head", "skull"], icon: "👤", kind: "head" },
  { match: ["sword", "blade", "dagger"], icon: "⚔️", kind: "combat" },
  { match: ["bow", "crossbow", "arrow"], icon: "🏹", kind: "combat" },
  { match: ["shield"], icon: "🛡️", kind: "combat" },
  { match: ["barrier", "bedrock"], icon: "⛔", kind: "danger" },
  { match: ["glass_pane", "glasspane", "stained_glass"], icon: "🔲", kind: "block" },
  { match: ["chest", "trapped_chest", "shulker_box", "barrel"], icon: "🧰", kind: "utility" },
  { match: ["compass"], icon: "🧭", kind: "utility" },
  { match: ["torch", "lantern", "campfire", "redstone_torch"], icon: "🕯️", kind: "utility" },
  { match: ["lime_dye", "green_dye", "dye", "glow_ink", "ink_sac"], icon: "🟢", kind: "magic" },
  { match: ["clock"], icon: "⏰", kind: "utility" },
  { match: ["book", "writable_book", "enchanted_book"], icon: "📖", kind: "utility" },
  { match: ["nether_star", "star"], icon: "⭐", kind: "gold" },
  { match: ["diamond", "emerald"], icon: "💎", kind: "emerald" },
  { match: ["gold_ingot", "iron_ingot", "copper_ingot", "gold_nugget"], icon: "🪙", kind: "gold" },
  { match: ["axe", "pickaxe", "shovel", "hoe"], icon: "⛏️", kind: "utility" },
  { match: ["potion", "splash_potion", "lingering_potion", "experience_bottle"], icon: "🧪", kind: "magic" },
  { match: ["firework_rocket", "firework_star"], icon: "🎆", kind: "food" },
  { match: ["apple", "bread", "golden_apple", "beef", "cooked_beef", "steak", "carrot", "golden_carrot"], icon: "🍎", kind: "food" },
  { match: ["elytra"], icon: "🪽", kind: "utility" },
  { match: ["bell"], icon: "🔔", kind: "utility" },
  { match: ["door", "trapdoor", "fence_gate"], icon: "🚪", kind: "utility" },
  { match: ["bed"], icon: "🛏️", kind: "utility" },
  { match: ["tnt", "flint_and_steel"], icon: "🧨", kind: "danger" },
  { match: ["ender_pearl", "eye_of_ender"], icon: "🔮", kind: "magic" },
  { match: ["totem_of_undying"], icon: "🧿", kind: "gold" },
];

function getItemIcon(item) {
  const hay = `${item.name ?? ""} ${item.displayName ?? ""} ${item.customName ?? ""}`.toLowerCase();
  for (const rule of ICON_RULES) {
    if (rule.match.some((t) => hay.includes(t))) return rule;
  }
  return { icon: "📦", kind: "block" };
}

function executeMenuItemAction(item, clickType, cardElement = null) {
  const snapshot = activeMenu;
  if (!snapshot) return;

  if (cardElement) {
    cardElement.classList.add("busy-pulse");
    setTimeout(() => cardElement?.classList.remove("busy-pulse"), 400);
  }

  if (snapshot.windowId !== "inventory" && !String(snapshot.token || "").startsWith("personal-inventory")) {
    menuBusyState = true;
    menuPanel.classList.add("busy");
    menuBusy.textContent = t("app.menu.busy");
  }

  sendSocketMessage({ type: "menuAction", token: snapshot.token, slot: item.slot, clickType });

  const rawName = item.customName || item.displayName || item.name || t("app.menu.element");
  const cleanName = sanitizeVisibleText(rawName).replace(/\(Clic [^)]+\)/i, "").trim();

  let actionLabel = "Clic Izquierdo";
  if (clickType === "right") actionLabel = "Clic Derecho";
  else if (clickType === "use") actionLabel = "Usar / Equipar";
  else if (clickType === "drop") actionLabel = "Tirar ítem";

  appendLine(`[MENU] ${actionLabel} en slot ${item.slot}: ${cleanName}`, "system");

  const toastType = clickType === "drop" ? "info" : "success";
  window.MCShared?.showToast(`${actionLabel} → ${cleanName} (Slot ${item.slot})`, toastType, 2200);
}

function applyMenuFilter() {
  if (!activeMenu) return;
  const items = activeMenu.slots ?? [];
  const filter = parseMenuQuery(menuQuery);
  const visible = items.filter((i) => matchesMenuItem(i, filter));
  menuGrid.innerHTML = "";
  if (!items.length) { menuEmpty.textContent = t("app.menu.noItems"); menuResults.textContent = ""; return; }
  if (!visible.length) { menuEmpty.textContent = t("app.menu.noSearchResults"); menuResults.textContent = t("app.menu.matchesZero", { total: items.length }); return; }

  menuEmpty.textContent = t("app.menu.clickHint");
  menuResults.textContent = t("app.menu.matches", { count: visible.length, total: items.length });

  const frag = document.createDocumentFragment();
  visible.forEach((item) => {
    const card = document.createElement("div");
    card.className = "menu-item";
    card.tabIndex = 0;
    card.setAttribute("role", "button");

    const actionHint = detectItemActionHint(item);
    const isHotbar = item.slot >= 36 && item.slot <= 44;
    const defaultAction = actionHint || (isHotbar ? "right" : "left");

    const rawTitle = item.customName || item.displayName || item.name || t("app.menu.element");
    const { icon, kind } = getItemIcon(item);

    const slotTagHtml = `<div class="menu-item-slot-row">
      <span class="menu-item-slot">Slot ${item.slot} ${isHotbar ? '<span class="menu-hotbar-tag">Hotbar</span>' : ''}</span>
      ${actionHint ? `<span class="menu-action-badge ${actionHint}">🖱️ Clic ${actionHint === 'right' ? 'Derecho' : 'Izquierdo'}</span>` : ''}
    </div>`;

    const cleanItemName = normalizeQueryText(item.name || "");
    const mainRowHtml = `<div class="menu-item-main-row">
      <div class="menu-item-icon" aria-hidden="true" data-kind="${kind}">
        <img class="menu-item-img" src="assets/mc-icons/${cleanItemName}.png" alt="" onerror="this.style.display='none'; if(this.nextElementSibling) this.nextElementSibling.style.display='inline-block';">
        <span class="menu-item-fallback-icon" style="display:none;">${icon}</span>
      </div>
      <div class="menu-item-title-col">
        <div class="menu-item-name">${renderMinecraftFormattedHTML(rawTitle)}</div>
        ${item.count > 1 ? `<span class="menu-item-count">x${item.count}</span>` : ''}
        ${item.name && item.name !== rawTitle ? `<span class="menu-item-base">${escapeHTML(item.name)}</span>` : ''}
      </div>
    </div>`;

    let loreHtml = "";
    if (Array.isArray(item.lore) && item.lore.length) {
      const formattedLoreLines = item.lore
        .map((l) => renderMinecraftFormattedHTML(l.trim()))
        .filter(Boolean)
        .join("<br>");
      if (formattedLoreLines) {
        loreHtml = `<div class="menu-item-lore">${formattedLoreLines}</div>`;
      }
    }

    const actionsHtml = `<div class="menu-item-actions">
      <button type="button" class="item-act-btn act-left ${defaultAction === 'left' ? 'act-primary' : ''}" title="Clic Izquierdo">🖱️ Izq</button>
      <button type="button" class="item-act-btn act-right ${defaultAction === 'right' ? 'act-primary' : ''}" title="Clic Derecho">🖱️ Der</button>
      <button type="button" class="item-act-btn act-use" title="Usar / Equipar en mano">⚡ Usar</button>
      <button type="button" class="item-act-btn act-drop" title="Tirar ítem al suelo">🗑️ Tirar</button>
      <button type="button" class="item-act-btn act-more" title="Opciones avanzadas">⚙️</button>
    </div>`;

    card.innerHTML = slotTagHtml + mainRowHtml + loreHtml + actionsHtml;

    // Direct click on card executes recommended default
    card.addEventListener("click", (e) => {
      if (e.target.closest(".menu-item-actions")) return;
      executeMenuItemAction(item, defaultAction, card);
    });

    // Native mouse right-click directly executes right-click
    card.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      executeMenuItemAction(item, "right", card);
    });

    // Quick action buttons
    card.querySelector(".act-left")?.addEventListener("click", (e) => {
      e.stopPropagation();
      executeMenuItemAction(item, "left", card);
    });
    card.querySelector(".act-right")?.addEventListener("click", (e) => {
      e.stopPropagation();
      executeMenuItemAction(item, "right", card);
    });
    card.querySelector(".act-use")?.addEventListener("click", (e) => {
      e.stopPropagation();
      executeMenuItemAction(item, "use", card);
    });
    card.querySelector(".act-drop")?.addEventListener("click", (e) => {
      e.stopPropagation();
      executeMenuItemAction(item, "drop", card);
    });
    card.querySelector(".act-more")?.addEventListener("click", (e) => {
      e.stopPropagation();
      showActionModal(item, (chosen) => executeMenuItemAction(item, chosen, card));
    });

    frag.appendChild(card);
  });
  menuGrid.appendChild(frag);
}

// ── Action modal ──────────────────────────────────────────────────────────────
function showActionModal(item, callback) {
  const rawName = item.displayName || item.name || t("app.modal.itemName");
  const cleanName = sanitizeVisibleText(rawName).replace(/\(Clic [^)]+\)/i, "").trim();
  actionModalTitle.textContent = cleanName;
  actionModalText.textContent = `¿Qué acción deseas ejecutar con ${cleanName} (Slot ${item.slot})?`;
  onActionSelected = callback;
  actionModal.classList.add("visible");
  actionModal.setAttribute("aria-hidden", "false");
}

function hideActionModal() {
  actionModal.classList.remove("visible");
  actionModal.setAttribute("aria-hidden", "true");
  onActionSelected = null;
}

actionModalCloseBtn.addEventListener("click", hideActionModal);
actionBtnLeft.addEventListener("click", () => { onActionSelected?.("left"); hideActionModal(); });
actionBtnRight.addEventListener("click", () => { onActionSelected?.("right"); hideActionModal(); });
actionBtnUse.addEventListener("click", () => { onActionSelected?.("use"); hideActionModal(); });
actionBtnDrop?.addEventListener("click", () => { onActionSelected?.("drop"); hideActionModal(); });
actionModal.addEventListener("click", (e) => { if (e.target === actionModal) hideActionModal(); });

// ── WebSocket ─────────────────────────────────────────────────────────────────
const WS_HANDLERS = {
  sidebar(data) {
    $("ping").textContent = t("app.status.getting");
    $("version").textContent = data.version;
    $("username").textContent = data.username;
    $("time").textContent = data.time;
    $("server").textContent = data.server;
    $("port").textContent = data.port || "25565";
    setVitals(data.health, data.food);
    setBotStatus(data.botStatus);
    const hist = Array.isArray(data.chatHistory) ? data.chatHistory : [];
    if (data.sessionId && data.sessionId !== currentSessionId) resetChatHistory(data.sessionId, hist);
    else if (data.chatHistory) resetChatHistory(data.sessionId ?? currentSessionId, hist);
  },
  chatHistory(data) {
    const hist = Array.isArray(data.history) ? data.history : [];
    if (data.sessionId && data.sessionId !== currentSessionId) resetChatHistory(data.sessionId, hist);
    else if (data.history) resetChatHistory(data.sessionId ?? currentSessionId, hist);
  },
  updatePing(data) { $("ping").textContent = `${data.ping} ms`; },
  vitals(data) { setVitals(data.health, data.food); },
  chat(data) {
    const prefix = data.source === "player" ? "[CHAT]" : data.source === "system" ? "[SYSTEM]" : "[SERVER]";
    appendLine(`${prefix} ${data.text}`, data.source);
  },
  menu(data) { renderMenu(data.menu); },
  menuClose() { clearMenu(); },
  menuBusy(data) {
    menuBusyState = Boolean(data.busy);
    menuPanel.classList.toggle("busy", menuBusyState);
    menuBusy.textContent = data.message || t("app.menu.busy");
  },
  reconnectState(data) {
    const busy = Boolean(data.busy);
    updateReconnectPanel({
      visible: busy || sidebarKicker.dataset.status === "offline",
      busy,
      buttonDisabled: busy,
      buttonText: busy ? t("app.status.restarting") : t("app.reconnect.button"),
      subtitle: data.message || t("app.reconnect.subtitle"),
      attemptText: busy ? t("app.status.trying") : t("app.reconnect.waiting"),
    });
  },
};

function connectSocket() {
  if (reconnectSocketTimer) { clearTimeout(reconnectSocketTimer); reconnectSocketTimer = null; }
  ws = new WebSocket("ws://127.0.0.1:3000");

  ws.onopen = () => {
    socketReconnectAttempt = 0;
    if (!manualSocketClose) updateReconnectPanel({ visible: false });
  };

  ws.onmessage = ({ data: raw }) => {
    let data;
    try { data = JSON.parse(raw); } catch { appendLine(sanitizeVisibleText(String(raw))); return; }
    if (typeof data.type === "undefined") { appendLine(sanitizeVisibleText(String(raw))); return; }
    WS_HANDLERS[data.type]?.(data);
  };

  ws.onclose = () => {
    if (manualSocketClose) return;
    socketReconnectAttempt += 1;
    updateReconnectPanel({
      visible: true,
      busy: true,
      buttonDisabled: false,
      buttonText: t("app.reconnect.button"),
      subtitle: t("app.status.socketClosed"),
      attemptText: t("app.status.panelRetry", { attempt: socketReconnectAttempt }),
    });
    reconnectSocketTimer = setTimeout(connectSocket, 1200);
  };
}

// ── Controls ──────────────────────────────────────────────────────────────────
menuSearch.addEventListener("input", () => {
  menuQuery = menuSearch.value || "";
  if (menuSearchClear) menuSearchClear.classList.toggle("hidden", !menuQuery);
  applyMenuFilter();
});

if (menuSearchClear) {
  menuSearchClear.addEventListener("click", () => {
    menuSearch.value = menuQuery = "";
    menuSearchClear.classList.add("hidden");
    menuSearch.focus();
    applyMenuFilter();
  });
}

reconnectButton.addEventListener("click", () => {
  if (reconnectButton.disabled) return;
  updateReconnectPanel({ visible: true, busy: true, buttonDisabled: true, buttonText: t("app.status.requesting"), subtitle: t("app.status.requestingReconnect"), attemptText: t("app.status.sending") });
  sendSocketMessage({ type: "reconnectRequest" });
});

menuCloseBtn.addEventListener("click", clearMenu);

inventoryButton.addEventListener("click", () => {
  if (sidebarKicker.dataset.status === "offline") return appendLine(t("app.system.inventoryOffline"), "system");
  if (ws?.readyState !== WebSocket.OPEN) { appendLine(t("app.system.panelDisconnected"), "system"); connectSocket(); return; }
  clearMenu();
  sendSocketMessage({ type: "inventoryRequest" });
});

endSessionButton?.addEventListener("click", async () => {
  endSessionButton.disabled = true;
  endSessionButton.title = t("app.status.leaving");
  manualSocketClose = true;
  try {
    if (ws?.readyState === WebSocket.OPEN) ws.close();
    if (launcherAPI?.returnToLauncher) {
      const result = await launcherAPI.returnToLauncher();
      if (!result?.ok) throw new Error(result?.error ?? t("app.system.returnLauncherFail"));
      return;
    }
    window.location.href = "launcher.html";
  } catch {
    window.location.href = "launcher.html";
  }
});

input.addEventListener("keydown", (e) => {
  if (e.key === "ArrowUp") { e.preventDefault(); stepInputHistory(-1); return; }
  if (e.key === "ArrowDown") { e.preventDefault(); stepInputHistory(1); return; }
  if (e.key !== "Enter") return;
  const text = input.value.trim();
  if (!text) return;
  pushInputHistory(text);
  sendSocketMessage(text);
  input.value = "";
  inputHistoryIndex = -1;
  inputDraft = "";
});

// ── Boot ──────────────────────────────────────────────────────────────────────
setupLanguage().finally(() => {
  i18n?.subscribe?.(() => rerenderLocalizedUI());
  launcherAPI?.onLanguageChanged?.((lang) => {
    i18n?.setLanguage?.(lang);
    rerenderLocalizedUI();
  });
  i18n?.applyTranslations?.(document);
  revealWindowWhenMenuReady();
  connectSocket();
});
