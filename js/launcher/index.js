(function () {
  const NS = (window.MCBetaLauncher = window.MCBetaLauncher || {});

  NS.init = function initLauncherApp() {
    var launcherAPI = window.launcherAPI || null;
    function reportRendererError(kind, errorLike, where = "launcher") {
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
      reportRendererError("error", event.error, "launcher.window.error");
    });
    window.addEventListener("unhandledrejection", (event) => {
      const reason = event?.reason;
      reportRendererError("unhandledrejection", reason instanceof Error ? reason : new Error(String(reason)), "launcher.window.unhandledrejection");
    });
    const i18n = window.MCSharedI18n;
    const t = (key, params) => (i18n?.t ? i18n.t(key, params) : key);
    const translateError = (res, fallbackKey = "") => {
      if (res?.errorCode) return t(`error.${res.errorCode}`);
      if (res?.error) return String(res.error);
      return fallbackKey ? t(fallbackKey) : "";
    };

    // ── DOM refs ────────────────────────────────────────────────────────────
    const $ = (id) => document.getElementById(id);
    const launcherBgVideo = $("launcher-bg-video");
    const launcherBgStatic = $("launcher-bg-static");
    const launcherBgCustom = $("launcher-bg-custom");
    const bgTypeSelect = $("bg-type-select");
    const bgVideoOptionsRow = $("bg-video-options-row");
    const bgCustomOptionsRow = $("bg-custom-options-row");
    const bgCustomBrowseBtn = $("bg-custom-browse-btn");
    const bgCustomPathDisplay = $("bg-custom-path-display");
    const bgVideoModeSelect = $("bg-video-mode-select");
    const launcherMenuAudio = $("launcher-menu-audio");
    const launcherAudioToggle = $("launcher-audio-toggle");
    const launcherStatus = $("launcher-status");
    const launcherMainMenu = $("launcher-main-menu");
    const launcherPlayView = $("launcher-play-view");
    const launcherConfigView = $("launcher-config-view");
    const launcherInfoView = $("launcher-info-view");
    const launcherControlsHint = $("launcher-controls-hint");
    const gameAuthModeSelect = $("game-auth-mode");
    const gameDistributionSelect = $("game-distribution");
    const gamePerformanceProfileSelect = $("game-performance-profile");
    const gameVersionSelect = $("game-version-select");
    const gameUsernameInput = $("game-username");
    const msAuthPanel = $("ms-auth-panel");
    const msAccountSelect = $("ms-account-select");
    const msAuthStatus = $("ms-auth-status");
    const gameJavaPathInput = $("game-java-path");
    const gameMinMemoryInput = $("game-min-memory-mb");
    const gameMaxMemoryInput = $("game-max-memory-mb");
    const gameExtraJvmArgsInput = $("game-extra-jvm-args");
    const gameExtraGameArgsInput = $("game-extra-game-args");
    const gameAdvancedSection = $("game-advanced-section");
    const gameLaunchBtn = $("game-launch-btn");
    const gameStopBtn = $("game-stop-btn");
    const gameScanJavaBtn = $("game-scan-java-btn");
    const gameShowDiagnosticsBtn = $("game-show-diagnostics-btn");
    const gameInstallStatus = $("game-install-status");
    const playTabServersBtn = $("play-tab-servers");
    const playTabBotBtn = $("play-tab-bot");
    const playTabJavaBtn = $("play-tab-java");
    const playTabServersPanel = $("play-tab-panel-servers");
    const playTabBotPanel = $("play-tab-panel-bot");
    const playTabJavaPanel = $("play-tab-panel-java");
    const serversListContainer = $("servers-list-container");
    const addServerBtn = $("add-server-btn");
    const refreshServersBtn = $("refresh-servers-btn");
    const serverModal = $("server-modal");
    const serverModalTitle = $("server-modal-title");
    const serverModalCloseBtn = $("server-modal-close-btn");
    const serverModalCancelBtn = $("server-modal-cancel-btn");
    const serverModalSaveBtn = $("server-modal-save-btn");
    const serverModalTogglePass = $("server-modal-toggle-pass");
    const serverModalId = $("server-modal-id");
    const serverModalName = $("server-modal-name");
    const serverModalIp = $("server-modal-ip");
    const serverModalPort = $("server-modal-port");
    const serverModalVersion = $("server-modal-version");
    const serverModalUsername = $("server-modal-username");
    const serverModalPassword = $("server-modal-password");
    const serverModalCommand = $("server-modal-command");
    const openMcFolderBtn = $("open-mc-folder-btn");
    const openModsFolderBtn = $("open-mods-folder-btn");
    const openLogsFolderBtn = $("open-logs-folder-btn");
    const filterRelease = $("filter-release");
    const filterSnapshot = $("filter-snapshot");
    const filterOldBeta = $("filter-old-beta");
    const filterOldAlpha = $("filter-old-alpha");
    const gameVersionTypeFilters = $("game-version-type-filters");

    // ── State ────────────────────────────────────────────────────────────────
    let gameStarted = false;
    let menuAudioMuted = false;
    let menuAudioPlayPromise = null;
    let menuAudioUnlockBound = false;
    let currentBgType = "video";
    let currentBgVideoMode = "auto";
    let currentBgVideoSrc = "";
    let currentCustomBgPath = "";
    let currentSavedServers = [];
    let isPingingServers = false;
    let currentLauncherView = "main";
    let launcherViewHistory = ["main"];
    let activeMainMenuIndex = 0;
    let activeConfigIndex = 0;
    let activePlayIndex = 0;
    let activeInfoIndex = 0;
    let gameCatalog = { vanilla: [], forge: [], fabric: [] };
    let activeInstallId = "";
    let installPollTimer = null;
    let activePlayTab = "servers";
    let javaSectionCatalogLoaded = false;
    let msAuthState = { accounts: [], activeAccountId: null };
    let catalogRequestSeq = 0;
    let lastAppliedCatalogRequest = 0;
    const versionTypeFilters = { release: true, snapshot: false, old_beta: false, old_alpha: false };

    const MENU_AUDIO_MUTED_STORAGE_KEY = "launcher.menuAudioMuted";
    const GAME_LAST_SELECTIONS_STORAGE_KEY = "launcher.gameLastSelections.v1";
    const MAIN_MENU_BUTTON_IDS = ["menu-play-btn", "menu-config-btn", "menu-info-btn", "menu-fullscreen-btn", "menu-exit-btn"];
    const BG_VALID_MODES = ["auto", "1080p", "2k", "4k"];
    const BG_SRCS = { "1080p": "mp4/menu-main.mp4", "2k": "mp4/2k-menu-main.mp4", "4k": "mp4/4k-menu-main.mp4" };
    const LISTENER_STORE_KEY = "__mcBetaListeners";

    // ── Core utils ───────────────────────────────────────────────────────────
    function bindEvent(node, eventName, handler, options) {
      if (!node || typeof node.addEventListener !== "function" || typeof handler !== "function") return;
      if (!node[LISTENER_STORE_KEY]) node[LISTENER_STORE_KEY] = new Map();
      const prev = node[LISTENER_STORE_KEY].get(eventName);
      if (prev) node.removeEventListener(eventName, prev.handler, prev.options);
      node.addEventListener(eventName, handler, options);
      node[LISTENER_STORE_KEY].set(eventName, { handler, options });
    }

    function bindClick(id, handler) {
      const node = $(id);
      if (node) bindEvent(node, "click", handler);
    }

    function revealWindowWhenMenuReady() {
      document.body.style.visibility = "visible";
      launcherAPI?.menuReady?.().catch(() => { });
    }

    // ── Status helpers (consolidated) ────────────────────────────────────────
    function setStatus(el, text, isError = false) {
      if (!el) return;
      el.textContent = text || "";
      el.dataset.kind = isError ? "error" : "ok";
    }
    const setLauncherStatus = (text, isError) => setStatus(launcherStatus, text, isError);
    const setGameStatus = (text, isError) => setStatus(gameInstallStatus, text, isError);
    const setMsAuthStatus = (text, isError) => setStatus(msAuthStatus, text, isError);

    // ── Background video ─────────────────────────────────────────────────────
    function chooseBackgroundSource(mode) {
      if (BG_SRCS[mode]) return BG_SRCS[mode];
      const fullScreen = Boolean(document.fullscreenElement) || window.matchMedia("(display-mode: fullscreen)").matches;
      const w = Math.max(window.innerWidth || 0, window.screen?.width || 0);
      const h = Math.max(window.innerHeight || 0, window.screen?.height || 0);
      if (fullScreen || w > 2560 || h > 1440) return BG_SRCS["4k"];
      if (w > 1920 || h > 1080) return BG_SRCS["2k"];
      return BG_SRCS["1080p"];
    }

    function applyLauncherBackgroundVideo(mode = currentBgVideoMode) {
      if (!launcherBgVideo) return;
      currentBgVideoMode = BG_VALID_MODES.includes(String(mode)) ? String(mode) : "auto";
      const src = chooseBackgroundSource(currentBgVideoMode);
      if (src === currentBgVideoSrc) return;
      currentBgVideoSrc = src;
      launcherBgVideo.src = src;
      launcherBgVideo.load();
      launcherBgVideo.play().catch(() => { });
    }

    function applyLauncherBackground(bgType = currentBgType, videoMode = currentBgVideoMode, customPath = currentCustomBgPath) {
      currentBgType = ["video", "static", "custom"].includes(bgType) ? bgType : "video";
      currentBgVideoMode = BG_VALID_MODES.includes(videoMode) ? videoMode : "auto";
      currentCustomBgPath = customPath || "";

      if (currentBgType === "static") {
        if (launcherBgVideo) {
          launcherBgVideo.classList.add("hidden");
          launcherBgVideo.pause();
        }
        launcherBgCustom?.classList.add("hidden");
        launcherBgStatic?.classList.remove("hidden");
      } else if (currentBgType === "custom" && currentCustomBgPath) {
        launcherBgStatic?.classList.add("hidden");
        const lower = currentCustomBgPath.toLowerCase();
        const isVideo = lower.endsWith(".mp4") || lower.endsWith(".webm");

        if (isVideo && launcherBgVideo) {
          launcherBgCustom?.classList.add("hidden");
          launcherBgVideo.classList.remove("hidden");
          launcherBgVideo.src = currentCustomBgPath;
          launcherBgVideo.load();
          launcherBgVideo.play().catch(() => {});
        } else if (launcherBgCustom) {
          if (launcherBgVideo) {
            launcherBgVideo.classList.add("hidden");
            launcherBgVideo.pause();
          }
          launcherBgCustom.classList.remove("hidden");
          launcherBgCustom.style.backgroundImage = `url("${currentCustomBgPath.replace(/\\/g, "/")}")`;
        }
      } else {
        launcherBgStatic?.classList.add("hidden");
        launcherBgCustom?.classList.add("hidden");
        launcherBgVideo?.classList.remove("hidden");
        applyLauncherBackgroundVideo(currentBgVideoMode);
      }
    }

    async function browseCustomBackground() {
      if (!launcherAPI?.selectCustomBackground) return;
      const res = await launcherAPI.selectCustomBackground();
      if (!res?.canceled && res.filePath) {
        currentCustomBgPath = res.filePath;
        if (bgCustomPathDisplay) {
          bgCustomPathDisplay.textContent = currentCustomBgPath;
        }
        applyLauncherBackground("custom", currentBgVideoMode, currentCustomBgPath);
        window.MCShared?.showToast("Fondo personalizado cargado", "success");
      }
    }

    async function openFolder(folderType) {
      if (!launcherAPI?.openFolder) return;
      const res = await launcherAPI.openFolder(folderType);
      if (res?.ok) {
        window.MCShared?.showToast(`Carpeta abierta: ${res.path}`, "info");
      } else {
        window.MCShared?.showToast(res?.error || "No se pudo abrir la carpeta", "error");
      }
    }

    // ── Menu audio ───────────────────────────────────────────────────────────
    function startMenuAudio(force = false) {
      if (!launcherMenuAudio || gameStarted || (!force && menuAudioMuted) || menuAudioPlayPromise) return;
      launcherMenuAudio.muted = menuAudioMuted;
      launcherMenuAudio.volume = 0.35;
      menuAudioPlayPromise = launcherMenuAudio.play()
        .catch((e) => console.warn("[Launcher Audio] autoplay bloqueado:", e?.message || e))
        .finally(() => { menuAudioPlayPromise = null; });
    }

    function setupMenuAudioUnlockListeners() {
      if (menuAudioUnlockBound) return;
      menuAudioUnlockBound = true;
      const events = ["pointerdown", "click", "keydown", "touchstart"];
      const unlock = () => {
        startMenuAudio(true);
        events.forEach((ev) => document.removeEventListener(ev, unlock, true));
      };
      events.forEach((ev) => document.addEventListener(ev, unlock, true));
    }

    function loadMenuAudioMutedPreference() {
      try { return window.localStorage.getItem(MENU_AUDIO_MUTED_STORAGE_KEY) === "true"; } catch { return false; }
    }

    function saveMenuAudioMutedPreference() {
      try { window.localStorage.setItem(MENU_AUDIO_MUTED_STORAGE_KEY, String(menuAudioMuted)); } catch { }
    }

    function updateMenuAudioToggle() {
      if (!launcherAudioToggle || !launcherMenuAudio) return;
      launcherMenuAudio.muted = menuAudioMuted;
      const label = menuAudioMuted ? t("launcher.audio.unmute") : t("launcher.audio.mute");
      launcherAudioToggle.innerHTML = `<i data-lucide="${menuAudioMuted ? "volume-x" : "volume-2"}"></i>`;
      launcherAudioToggle.setAttribute("aria-label", label);
      launcherAudioToggle.setAttribute("title", label);
      window.lucide?.createIcons?.({ icons: window.lucide.icons, attrs: { width: 17, height: 17, "stroke-width": 2.2 } });
    }

    // ── Storage ──────────────────────────────────────────────────────────────
    function loadLastGameSelections() {
      try {
        const raw = window.localStorage.getItem(GAME_LAST_SELECTIONS_STORAGE_KEY);
        const parsed = raw && JSON.parse(raw);
        return (parsed && typeof parsed === "object") ? parsed : {};
      } catch { return {}; }
    }

    function saveLastGameSelections(next) {
      try { window.localStorage.setItem(GAME_LAST_SELECTIONS_STORAGE_KEY, JSON.stringify(next && typeof next === "object" ? next : {})); } catch { }
    }

    // ── MS Auth ──────────────────────────────────────────────────────────────
    function getSelectedMsAccount() {
      const id = String(msAccountSelect?.value || "").trim();
      return id ? (msAuthState.accounts || []).find((a) => String(a.id) === id) ?? null : null;
    }

    function renderMsAccounts() {
      if (!msAccountSelect) return;
      const accounts = Array.isArray(msAuthState.accounts) ? msAuthState.accounts : [];
      msAccountSelect.innerHTML = "";
      if (!accounts.length) {
        const opt = document.createElement("option");
        opt.value = ""; opt.textContent = t("launcher.ms.noAccounts");
        msAccountSelect.appendChild(opt);
        msAccountSelect.disabled = true;
        setMsAuthStatus(t("launcher.ms.noActive"), true);
        return;
      }
      accounts.forEach((a) => {
        const opt = document.createElement("option");
        opt.value = String(a.id || "");
        opt.textContent = `${a.minecraftUsername || a.displayName || a.username || t("launcher.ms.account")} (${a.username || t("launcher.ms.noEmail")})`;
        msAccountSelect.appendChild(opt);
      });
      const target = String(msAuthState.activeAccountId || "");
      if (target && Array.from(msAccountSelect.options).some((o) => o.value === target)) msAccountSelect.value = target;
      msAccountSelect.disabled = false;
      const active = getSelectedMsAccount();
      setMsAuthStatus(active ? t("launcher.ms.active", { name: active.minecraftUsername || active.displayName || active.username }) : t("launcher.ms.activeNotFound"), !active);
    }

    async function refreshMsSessions() {
      if (typeof launcherAPI?.listAuthSessions !== "function") return;
      const res = await launcherAPI.listAuthSessions();
      if (!res?.ok) { setMsAuthStatus(translateError(res, "launcher.ms.loadFail"), true); return; }
      msAuthState = {
        accounts: Array.isArray(res.accounts) ? res.accounts : [],
        activeAccountId: String(res.activeAccountId || "").trim() || null,
      };
      renderMsAccounts();
    }

    function updateAuthModeUI() {
      let authMode = String(gameAuthModeSelect?.value || "offline");
      if (authMode === "microsoft" && gameAuthModeSelect) { gameAuthModeSelect.value = "offline"; authMode = "offline"; }
      const isMs = authMode === "microsoft";
      if (gameUsernameInput) {
        gameUsernameInput.disabled = isMs;
        gameUsernameInput.placeholder = isMs ? "Se usa el usuario de tu cuenta Microsoft" : "JugadorOffline";
      }
      msAuthPanel?.classList.toggle("hidden", !isMs);
    }

    // ── Version catalog ──────────────────────────────────────────────────────
    function getDistributionEntries() {
      const dist = String(gameDistributionSelect?.value || "vanilla");
      return gameCatalog[dist] || gameCatalog.vanilla || [];
    }

    function getEntryVersionId(entry) {
      if (!entry || typeof entry !== "object") return "";
      return String(entry.source === "vanilla" ? (entry.id ?? "") : (entry.gameVersion ?? ""));
    }

    function applyVersionFilters(entries, distribution, filters) {
      if (!Array.isArray(entries) || String(distribution || "vanilla") !== "vanilla") return entries ?? [];
      return entries.filter((entry) => {
        if (!filters[String(entry.type || "release")]) return false;
        const match = String(entry.id || "").match(/^1\.(\d+)(?:\.\d+)?$/);
        if (!match) return true;
        const minor = Number.parseInt(match[1], 10);
        return Number.isFinite(minor) ? minor >= 8 : true;
      });
    }

    function syncVersionTypeFiltersUI() {
      if (filterRelease) filterRelease.checked = versionTypeFilters.release;
      if (filterSnapshot) filterSnapshot.checked = versionTypeFilters.snapshot;
      if (filterOldBeta) filterOldBeta.checked = versionTypeFilters.old_beta;
      if (filterOldAlpha) filterOldAlpha.checked = versionTypeFilters.old_alpha;
    }

    function updateFilterVisibilityByDistribution() {
      const vanilla = String(gameDistributionSelect?.value || "vanilla") === "vanilla";
      if (gameVersionTypeFilters) gameVersionTypeFilters.style.display = vanilla ? "grid" : "none";
      if (gamePerformanceProfileSelect) {
        const isFabric = String(gameDistributionSelect?.value || "vanilla") === "fabric";
        const profileLabel = document.querySelector('label[for="game-performance-profile"]');
        gamePerformanceProfileSelect.disabled = !isFabric;
        gamePerformanceProfileSelect.classList.toggle("hidden", !isFabric);
        profileLabel?.classList.toggle("hidden", !isFabric);
      }
      if (!vanilla) setGameStatus("Filtros de tipo aplican solo a Vanilla.", false);
    }

    function refreshVersionSelect() {
      if (!gameVersionSelect) return;
      const dist = String(gameDistributionSelect?.value || "vanilla");
      const entries = applyVersionFilters(getDistributionEntries(), dist, versionTypeFilters);
      const previous = gameVersionSelect.value;
      const remembered = loadLastGameSelections()[dist] ?? null;
      gameVersionSelect.innerHTML = "";
      entries.forEach((entry) => {
        const opt = document.createElement("option");
        const vid = getEntryVersionId(entry);
        opt.value = vid;
        opt.textContent = entry.source === "fabric" ? `${entry.gameVersion} | loader ${entry.loaderVersion}`
          : entry.source === "forge" ? `${entry.gameVersion} | forge ${entry.forgeVersion} (${entry.channel})`
            : `${entry.id} (${entry.type})`;
        opt.dataset.source = entry.source || dist;
        opt.dataset.loaderVersion = entry.loaderVersion || "";
        opt.dataset.type = entry.type || "";
        gameVersionSelect.appendChild(opt);
      });
      const hasOpt = (v) => v && Array.from(gameVersionSelect.options).some((o) => o.value === String(v));
      if (hasOpt(remembered?.versionId)) gameVersionSelect.value = String(remembered.versionId);
      else if (hasOpt(previous)) gameVersionSelect.value = String(previous);
      else if (gameVersionSelect.options.length) gameVersionSelect.selectedIndex = 0;
      if (!gameVersionSelect.options.length) setGameStatus(t("launcher.status.noFilterResults"), true);
    }

    async function loadGameCatalog(forceRefresh = false) {
      if (!launcherAPI) return;
      const requestId = ++catalogRequestSeq;
      setGameStatus(forceRefresh ? t("launcher.status.catalogRefreshing") : t("launcher.status.catalogLoading"));
      const result = await (forceRefresh ? launcherAPI.refreshVersionCatalog() : launcherAPI.getVersionCatalog());
      if (requestId < lastAppliedCatalogRequest) return;
      lastAppliedCatalogRequest = requestId;
      if (!result?.ok) { setGameStatus(translateError(result, "launcher.status.catalogFail"), true); return; }
      gameCatalog = result.catalog || { vanilla: [], forge: [], fabric: [] };
      refreshVersionSelect();
      const warn = result.warning ? ` (warning: ${result.warning})` : "";
      setGameStatus(t("launcher.status.catalogReady", {
        vanilla: gameCatalog.vanilla.length,
        fabric: gameCatalog.fabric.length,
        forge: gameCatalog.forge.length,
        warning: warn,
      }));
    }

    // ── Launch options ───────────────────────────────────────────────────────
    function loadLaunchOptionsFromConfig(cfg) {
      const dl = (cfg?.launcher?.downloads && typeof cfg.launcher.downloads === "object") ? cfg.launcher.downloads : {};
      if (gameJavaPathInput) gameJavaPathInput.value = String(dl.javaPath || "").trim();
      if (gameMinMemoryInput) gameMinMemoryInput.value = String(dl.minMemoryMb ?? 1024);
      if (gameMaxMemoryInput) gameMaxMemoryInput.value = String(dl.maxMemoryMb ?? 2048);
      if (gameExtraJvmArgsInput) gameExtraJvmArgsInput.value = String(dl.extraJvmArgs || "");
      if (gameExtraGameArgsInput) gameExtraGameArgsInput.value = String(dl.extraGameArgs || "");
      if (gamePerformanceProfileSelect) gamePerformanceProfileSelect.value = String(dl.performanceProfileId || "vanilla_fabric");
    }

    function normalizeLaunchOptions(raw) {
      const src = raw && typeof raw === "object" ? raw : {};
      const minMemoryMb = Math.max(512, Number.parseInt(String(src.minMemoryMb ?? 1024), 10) || 1024);
      const maxMemoryMb = Math.max(minMemoryMb, Number.parseInt(String(src.maxMemoryMb ?? 2048), 10) || 2048);
      return {
        javaPath: String(src.javaPath || "").trim(),
        minMemoryMb,
        maxMemoryMb,
        extraJvmArgs: String(src.extraJvmArgs || "").trim(),
        extraGameArgs: String(src.extraGameArgs || "").trim(),
        performanceProfileId: String(src.performanceProfileId || "vanilla_fabric").trim() || "vanilla_fabric",
        instanceMode: String(src.instanceMode || "dedicated").trim() || "dedicated",
      };
    }

    function buildLaunchOptionsFromInputs() {
      const int = (el, def) => Number.parseInt(String(el?.value || def), 10) || def;
      const dist = String(gameDistributionSelect?.value || "vanilla");
      const selectedProfile = String(gamePerformanceProfileSelect?.value || "vanilla_fabric").trim() || "vanilla_fabric";
      return normalizeLaunchOptions({
        javaPath: String(gameJavaPathInput?.value || "").trim(),
        minMemoryMb: int(gameMinMemoryInput, 1024),
        maxMemoryMb: int(gameMaxMemoryInput, 2048),
        extraJvmArgs: String(gameExtraJvmArgsInput?.value || "").trim(),
        extraGameArgs: String(gameExtraGameArgsInput?.value || "").trim(),
        performanceProfileId: dist === "fabric" ? selectedProfile : "vanilla_fabric",
        instanceMode: "dedicated",
      });
    }

    async function persistLaunchOptionsToConfig() {
      if (typeof launcherAPI?.getConfig !== "function" || typeof launcherAPI?.saveConfig !== "function") return;
      const cfg = await launcherAPI.getConfig();
      const next = cfg && typeof cfg === "object" ? cfg : {};
      if (!next.launcher || typeof next.launcher !== "object") next.launcher = {};
      const dl = (next.launcher.downloads && typeof next.launcher.downloads === "object") ? next.launcher.downloads : {};
      next.launcher.downloads = dl;
      const lo = buildLaunchOptionsFromInputs();
      dl.javaPath = lo.javaPath;
      dl.minMemoryMb = lo.minMemoryMb;
      dl.maxMemoryMb = lo.maxMemoryMb;
      dl.extraJvmArgs = lo.extraJvmArgs;
      dl.extraGameArgs = lo.extraGameArgs;
      dl.performanceProfileId = lo.performanceProfileId;
      dl.instanceMode = lo.instanceMode;
      await launcherAPI.saveConfig(next);
    }

    // ── Version selection persistence ────────────────────────────────────────
    function getCurrentVersionSelectionPayload() {
      const sel = gameVersionSelect?.selectedOptions?.[0];
      if (!sel) return null;
      const dist = String(gameDistributionSelect?.value || "vanilla");
      return {
        distribution: dist,
        versionId: String(sel.value || ""),
        source: String(sel.dataset.source || dist),
        loaderVersion: String(sel.dataset.loaderVersion || ""),
        type: String(sel.dataset.type || ""),
        label: String(sel.textContent || "").trim(),
        updatedAt: Date.now(),
      };
    }

    function persistCurrentVersionSelection() {
      const payload = getCurrentVersionSelectionPayload();
      if (!payload?.versionId) return;
      const all = loadLastGameSelections();
      all[payload.distribution] = payload;
      all.__last = payload;
      saveLastGameSelections(all);
    }

    function restoreRememberedDistribution() {
      const last = loadLastGameSelections().__last;
      if (!last || !gameDistributionSelect) return;
      const dist = String(last.distribution || "").trim();
      if (["vanilla", "fabric", "forge"].includes(dist)) gameDistributionSelect.value = dist;
    }

    // ── Navigation ───────────────────────────────────────────────────────────
    // Generic navigable-element selector + focus pattern: 4 views, same logic.
    const NAV_VIEWS = {
      main: { getEls: getMainMenuButtons, getIdx: () => activeMainMenuIndex, setIdx: (v) => { activeMainMenuIndex = v; }, cls: "nav-active" },
      config: { getEls: getConfigNavigableElements, getIdx: () => activeConfigIndex, setIdx: (v) => { activeConfigIndex = v; }, cls: "launcher-nav-active" },
      play: { getEls: getPlayNavigableElements, getIdx: () => activePlayIndex, setIdx: (v) => { activePlayIndex = v; }, cls: "launcher-nav-active" },
      info: { getEls: getInfoNavigableElements, getIdx: () => activeInfoIndex, setIdx: (v) => { activeInfoIndex = v; }, cls: "launcher-nav-active" },
    };

    function setNavSelection(viewKey, index) {
      const cfg = NAV_VIEWS[viewKey]; if (!cfg) return;
      const els = cfg.getEls(); if (!els.length) return;
      const norm = ((index % els.length) + els.length) % els.length;
      cfg.setIdx(norm);
      els.forEach((el, i) => el.classList.toggle(cfg.cls, i === norm));
      els[norm].focus({ preventScroll: true });
      if (viewKey !== "main") els[norm].scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
    }

    function clearNavSelection(viewKey) {
      const cfg = NAV_VIEWS[viewKey]; if (!cfg) return;
      cfg.getEls().forEach((el) => el.classList.remove(cfg.cls));
    }

    // Kept as named wrappers so external modules can call them by name unchanged.
    const setMainMenuSelection = (i) => setNavSelection("main", i);
    const setConfigSelection = (i) => setNavSelection("config", i);
    const setPlaySelection = (i) => setNavSelection("play", i);
    const setInfoSelection = (i) => setNavSelection("info", i);

    function getMainMenuButtons() {
      return MAIN_MENU_BUTTON_IDS.map($).filter(Boolean);
    }

    function getConfigNavigableElements() {
      return _getViewInputs(launcherConfigView);
    }

    function getPlayNavigableElements() {
      return _getViewInputs(launcherPlayView);
    }

    function getInfoNavigableElements() {
      return launcherInfoView
        ? Array.from(launcherInfoView.querySelectorAll("button")).filter((el) => !el.disabled && el.offsetParent !== null)
        : [];
    }

    function _getViewInputs(view) {
      return view
        ? Array.from(view.querySelectorAll("input, select, button")).filter((el) => !el.disabled && el.type !== "hidden" && el.offsetParent !== null)
        : [];
    }

    function setLauncherMainMenuControlsVisible(visible) {
      launcherControlsHint?.classList.toggle("visible", Boolean(visible));
    }

    function showLauncherView(view, options = {}) {
      const fromHistory = Boolean(options.fromHistory);
      if (!fromHistory) {
        if (view === "main") launcherViewHistory = ["main"];
        else if (currentLauncherView !== view) launcherViewHistory.push(view);
      }
      currentLauncherView = view;
      startMenuAudio();
      launcherMainMenu.style.display = view === "main" ? "flex" : "none";
      const shell = document.querySelector(".launcher-shell");
      if (shell) {
        shell.classList.toggle("main-compact", view === "main");
        if (view !== "play") shell.classList.remove("java-expanded");
      }
      launcherPlayView.classList.toggle("visible", view === "play");
      launcherConfigView.classList.toggle("visible", view === "config");
      launcherInfoView.classList.toggle("visible", view === "info");
      setLauncherMainMenuControlsVisible(["main", "play", "config", "info"].includes(view));

      // Activate the right view's selection; clear all others.
      Object.keys(NAV_VIEWS).forEach((key) => {
        if (key === view) setNavSelection(key, 0);
        else clearNavSelection(key);
      });
      // Main menu buttons clear happens via clearNavSelection already.
      if (view !== "main") getMainMenuButtons().forEach((b) => b.classList.remove("nav-active"));
      setLauncherStatus("");
    }

    function goBackLauncherView() {
      if (currentLauncherView === "play") {
        const form = $("new-profile-form");
        if (form && !form.classList.contains("hidden")) { form.classList.add("hidden"); return; }
      }
      launcherViewHistory.pop();
      showLauncherView(launcherViewHistory[launcherViewHistory.length - 1] || "main", { fromHistory: true });
    }

    // ── Play tab ─────────────────────────────────────────────────────────────
    function switchPlayTab(tab) {
      activePlayTab = ["servers", "bot", "java"].includes(tab) ? tab : "servers";
      document.querySelector(".launcher-shell")?.classList.toggle("java-expanded", activePlayTab === "java" || activePlayTab === "servers");
      [
        { btn: playTabServersBtn, id: "servers" },
        { btn: playTabBotBtn, id: "bot" },
        { btn: playTabJavaBtn, id: "java" },
      ].forEach(({ btn, id }) => {
        if (!btn) return;
        const active = activePlayTab === id;
        btn.classList.toggle("active", active);
        btn.setAttribute("aria-selected", String(active));
      });
      if (playTabServersPanel) playTabServersPanel.hidden = activePlayTab !== "servers";
      if (playTabBotPanel) playTabBotPanel.hidden = activePlayTab !== "bot";
      if (playTabJavaPanel) playTabJavaPanel.hidden = activePlayTab !== "java";

      if (activePlayTab === "servers") {
        loadAndRenderSavedServers();
      }
    }

    // ── Saved Servers (Bookmarks) ─────────────────────────────────────────────
    async function loadAndRenderSavedServers() {
      if (!serversListContainer || !launcherAPI?.listServers) return;
      serversListContainer.innerHTML = `<div class="servers-empty-state">${t("launcher.servers.empty")}</div>`;

      try {
        const res = await launcherAPI.listServers();
        if (!res?.ok || !Array.isArray(res.servers) || res.servers.length === 0) {
          serversListContainer.innerHTML = `<div class="servers-empty-state">${t("launcher.servers.empty")}</div>`;
          return;
        }

        currentSavedServers = res.servers;
        renderServerCards(currentSavedServers);
        refreshServerPings(currentSavedServers);
      } catch (err) {
        console.warn("[Servers] Error loading servers:", err);
      }
    }

    function renderServerCards(servers) {
      if (!serversListContainer) return;
      serversListContainer.innerHTML = "";

      servers.forEach((server) => {
        const card = document.createElement("div");
        card.className = "server-card";
        card.dataset.id = server.id;

        const faviconSrc = server.favicon || "assets/logo/MineBAO-icono-256-oscuro.png";
        const title = server.name || server.ip;
        const address = `${server.ip}:${server.port || 25565}`;
        const nick = server.username || "Jugador";
        const ver = server.version || "1.21.1";

        card.innerHTML = `
          <div class="server-card-top">
            <div class="server-card-main">
              <img src="${faviconSrc}" class="server-favicon" id="favicon-${server.id}" alt="Icon">
              <div class="server-card-details">
                <span class="server-card-title">${title}</span>
                <span class="server-card-address">${address}</span>
              </div>
            </div>
            <div class="server-ping-badge" id="ping-badge-${server.id}">
              <span class="server-ping-dot"></span>
              <span class="server-ping-text">Comprobando...</span>
            </div>
          </div>
          <div class="server-card-motd hidden" id="motd-${server.id}"></div>
          <div class="server-card-footer">
            <div class="server-card-meta">
              <span>👤 ${nick}</span>
              <span>🏷️ ${ver}</span>
            </div>
            <div class="server-card-actions">
              <button type="button" class="server-act-btn primary btn-act-bot" title="Iniciar bot NoGUI"><span>${t("launcher.servers.botLaunch")}</span></button>
              <button type="button" class="server-act-btn btn-act-game" title="Lanzar cliente Java"><span>${t("launcher.servers.gameLaunch")}</span></button>
              <button type="button" class="server-act-btn btn-act-edit" title="Editar servidor"><span>✏️</span></button>
              <button type="button" class="server-act-btn danger btn-act-delete" title="Eliminar"><span>🗑️</span></button>
            </div>
          </div>
        `;

        card.querySelector(".btn-act-bot")?.addEventListener("click", () => launchBotFromServer(server));
        card.querySelector(".btn-act-game")?.addEventListener("click", () => launchGameFromServer(server));
        card.querySelector(".btn-act-edit")?.addEventListener("click", () => openEditServerModal(server));
        card.querySelector(".btn-act-delete")?.addEventListener("click", () => deleteServerCard(server.id));

        serversListContainer.appendChild(card);
      });
    }

    async function refreshServerPings(servers) {
      if (isPingingServers) return;
      isPingingServers = true;

      for (const server of servers) {
        const badge = $(`ping-badge-${server.id}`);
        const motdEl = $(`motd-${server.id}`);
        const faviconEl = $(`favicon-${server.id}`);

        try {
          const res = await launcherAPI.pingServer({ host: server.ip, port: server.port, timeoutMs: 3500 });
          if (!badge) continue;

          if (res?.online) {
            badge.className = "server-ping-badge online";
            badge.innerHTML = `<span class="server-ping-dot"></span><span class="server-ping-text">${res.latency}ms • ${res.playersOnline}/${res.playersMax}</span>`;
            if (res.motd && motdEl) {
              motdEl.textContent = res.motd;
              motdEl.classList.remove("hidden");
            }
            if (res.favicon && faviconEl) {
              faviconEl.src = res.favicon;
            }
          } else {
            badge.className = "server-ping-badge offline";
            badge.innerHTML = `<span class="server-ping-dot"></span><span class="server-ping-text">Offline</span>`;
          }
        } catch {
          if (badge) {
            badge.className = "server-ping-badge offline";
            badge.innerHTML = `<span class="server-ping-dot"></span><span class="server-ping-text">Offline</span>`;
          }
        }
      }

      isPingingServers = false;
    }

    async function launchBotFromServer(server) {
      if (!launcherAPI) return startPanelSession();
      window.MCShared?.showToast(`Conectando Bot a ${server.name || server.ip}...`, "info");
      const profile = {
        username: server.username || "Jugador",
        ip: server.ip,
        port: server.port || 25565,
        version: server.version || "1.21.1",
        mode: "nogui",
        autoLoginPassword: server.autoLoginPassword || "",
        autoCommand: server.autoCommand || "",
      };
      setLauncherStatus("Iniciando bot y abriendo panel...");
      const res = await launcherAPI.startNew(profile);
      if (!res?.ok) {
        window.MCShared?.showToast(translateError(res, "launcher.status.saveFailed"), "error");
        return;
      }
      startPanelSession();
    }

    async function launchGameFromServer(server) {
      if (gameUsernameInput && server.username) gameUsernameInput.value = server.username;
      switchPlayTab("java");
      await ensureJavaCatalogLoadedOnce();
      window.MCShared?.showToast(`Servidor ${server.name || server.ip} seleccionado.`, "success");
    }

    async function openAddServerModal() {
      if (!serverModal) return;
      if (serverModalTitle) serverModalTitle.textContent = t("launcher.servers.modalAddTitle");
      if (serverModalId) serverModalId.value = "";
      if (serverModalName) serverModalName.value = "";
      if (serverModalIp) serverModalIp.value = "";
      if (serverModalPort) serverModalPort.value = "25565";
      if (serverModalVersion) serverModalVersion.value = "1.21.1";
      if (serverModalUsername) serverModalUsername.value = gameUsernameInput?.value || "Jugador";
      if (serverModalPassword) {
        serverModalPassword.value = "";
        serverModalPassword.type = "password";
      }
      if (serverModalCommand) serverModalCommand.value = "";
      serverModal.classList.remove("hidden");
      serverModalIp?.focus();
    }

    async function openEditServerModal(server) {
      if (!serverModal) return;
      if (serverModalTitle) serverModalTitle.textContent = t("launcher.servers.modalEditTitle");
      if (serverModalId) serverModalId.value = server.id || "";
      if (serverModalName) serverModalName.value = server.name || "";
      if (serverModalIp) serverModalIp.value = server.ip || "";
      if (serverModalPort) serverModalPort.value = String(server.port || 25565);
      if (serverModalVersion) serverModalVersion.value = server.version || "1.21.1";
      if (serverModalUsername) serverModalUsername.value = server.username || "";
      if (serverModalCommand) serverModalCommand.value = server.autoCommand || "";

      if (serverModalPassword) {
        if (server.autoLoginPassword && typeof launcherAPI?.decryptPassword === "function") {
          const dec = await launcherAPI.decryptPassword(server.autoLoginPassword);
          serverModalPassword.value = dec.plainText || "";
        } else {
          serverModalPassword.value = server.autoLoginPassword || "";
        }
        serverModalPassword.type = "password";
      }

      serverModal.classList.remove("hidden");
      serverModalName?.focus();
    }

    function closeServerModal() {
      if (serverModal) serverModal.classList.add("hidden");
    }

    function toggleServerModalPassword() {
      if (!serverModalPassword) return;
      serverModalPassword.type = serverModalPassword.type === "password" ? "text" : "password";
    }

    async function saveServerModalForm() {
      const ip = String(serverModalIp?.value || "").trim();
      if (!ip) {
        window.MCShared?.showToast("Debes ingresar la dirección IP del servidor", "error");
        serverModalIp?.focus();
        return;
      }

      const serverData = {
        id: serverModalId?.value || undefined,
        name: serverModalName?.value || ip,
        ip,
        port: Number.parseInt(serverModalPort?.value, 10) || 25565,
        version: serverModalVersion?.value || "1.21.1",
        username: serverModalUsername?.value || "Jugador",
        autoLoginPassword: serverModalPassword?.value || "",
        autoCommand: serverModalCommand?.value || "",
      };

      const res = await launcherAPI.saveServer(serverData);
      if (res?.ok) {
        closeServerModal();
        window.MCShared?.showToast(t("launcher.servers.savedToast"), "success");
        await loadAndRenderSavedServers();
      } else {
        window.MCShared?.showToast(res?.error || "Error al guardar servidor", "error");
      }
    }

    async function deleteServerCard(id) {
      if (!confirm(t("launcher.servers.deleteConfirm"))) return;
      const res = await launcherAPI.deleteServer(id);
      if (res?.ok) {
        window.MCShared?.showToast(t("launcher.servers.deletedToast"), "info");
        await loadAndRenderSavedServers();
      }
    }

    async function ensureJavaCatalogLoadedOnce() {
      if (javaSectionCatalogLoaded) return;
      await loadGameCatalog(true);
      refreshVersionSelect();
      javaSectionCatalogLoaded = true;
    }

    // ── Install / launch ─────────────────────────────────────────────────────
    function stopInstallPolling() {
      if (installPollTimer) { clearInterval(installPollTimer); installPollTimer = null; }
    }

    function startInstallPolling() {
      stopInstallPolling();
      if (!activeInstallId || !launcherAPI) return;
      installPollTimer = setInterval(async () => {
        const res = await launcherAPI.getInstallStatus(activeInstallId);
        if (!res?.ok) return;
        const st = res.status || {};
        const pct = Number.isFinite(st.progress) ? `${Math.max(0, Math.min(100, Math.round(st.progress)))}%` : "";
        setGameStatus(`[${st.phase || "working"}] ${pct} ${st.message || "Procesando..."}`.trim(), st.phase === "error");
        if (!st.busy) stopInstallPolling();
      }, 1000);
    }

    async function waitInstallCompletion(installId) {
      if (!launcherAPI || !installId) return { ok: false, error: "Instalación inválida." };
      while (true) {
        const res = await launcherAPI.getInstallStatus(installId);
        if (!res?.ok) return { ok: false, error: res?.error || "No se pudo consultar instalación." };
        const st = res.status || {};
        const pct = Number.isFinite(st.progress) ? `${Math.max(0, Math.min(100, Math.round(st.progress)))}%` : "";
        setGameStatus(`[${st.phase || "working"}] ${pct} ${st.message || "Procesando..."}`.trim(), st.phase === "error");
        if (!st.busy) return st.phase === "done" ? { ok: true } : { ok: false, error: st.error || st.message || "La instalación no finalizó correctamente." };
        await new Promise((r) => setTimeout(r, 1000)); // eslint-disable-line no-await-in-loop
      }
    }

    function formatRuntimeDiagnostics(st) {
      const tried = Array.isArray(st?.javaPathTried) ? st.javaPathTried.join(" | ") || "n/a" : "n/a";
      const lines = [
        "Diagnóstico runtime:",
        `- running: ${Boolean(st?.running)}`,
        `- pid: ${st?.pid ?? "n/a"}`,
        `- java seleccionado: ${st?.javaPathSelected || "n/a"}`,
        `- java probados: ${tried}`,
        `- lastExitCode: ${st?.lastExitCode ?? "n/a"}`,
        `- lastLifecycleEvent: ${st?.lastLifecycleEvent || "n/a"}`,
        `- lineCount: ${Number(st?.lineCount || 0)}`,
      ];
      if (Number(st?.silenceMs || 0) > 0) lines.push(`- silenceMs: ${st.silenceMs} (threshold ${st?.stallThresholdMs || "n/a"})`);
      if (st?.lastError) lines.push(`- lastError: ${st.lastError}`);
      if (st?.lastErrorLines) lines.push("- últimas líneas:", st.lastErrorLines);
      return lines.join("\n");
    }

    async function waitForRuntimeStable(timeoutMs = 8000, healthWindowMs = 4500) {
      if (typeof launcherAPI?.getGameRuntimeStatus !== "function") return { ok: true };
      const start = Date.now();
      let firstRunning = null;
      while (Date.now() - start <= timeoutMs) {
        const st = await launcherAPI.getGameRuntimeStatus(); // eslint-disable-line no-await-in-loop
        if (!st?.ok) return { ok: false, error: st?.error || "No se pudo validar estado del juego." };
        if (st.running) {
          firstRunning = firstRunning ?? Date.now();
          const elapsed = Date.now() - firstRunning;
          if (st.stalled && elapsed >= 1500) return { ok: false, error: `Proceso Java activo pero sin progreso.\n${formatRuntimeDiagnostics(st)}` };
          if (elapsed >= healthWindowMs) return { ok: true, pid: st.pid };
        }
        if (st.lastExitCode !== null || st.lastError) {
          const details = [st.lastError || `Proceso cerrado con código ${st.lastExitCode}.`, st.lastErrorLines || ""].filter(Boolean).join("\n");
          return { ok: false, error: details || "El juego cerró antes de iniciar." };
        }
        await new Promise((r) => setTimeout(r, 500)); // eslint-disable-line no-await-in-loop
      }
      return { ok: false, error: "Timeout esperando que el juego quede en ejecución." };
    }

    async function showRuntimeDiagnostics() {
      if (typeof launcherAPI?.getGameRuntimeStatus !== "function") return;
      const st = await launcherAPI.getGameRuntimeStatus();
      if (!st?.ok) return setGameStatus(st?.error || "No se pudo obtener diagnóstico runtime.", true);
      setGameStatus(formatRuntimeDiagnostics(st), Boolean(st?.stalled || st?.lastError || st?.lastExitCode !== null));
    }

    async function ensureInstalledThenLaunch({ source, versionId, loaderVersion, authMode, username, javaPath, minMemoryMb, maxMemoryMb, extraJvmArgs, extraGameArgs, performanceProfileId, instanceMode }) {
      if (!launcherAPI) return { ok: false, error: "API no disponible." };
      if (source === "forge") return { ok: false, error: "Forge automático aún no está soportado en esta build." };

      let check = await launcherAPI.isVersionInstalled({ source, versionId, loaderVersion });
      if (!check?.ok) return { ok: false, error: check?.error || "No se pudo validar instalación." };

      if (!check.installed) {
        setGameStatus(`Instalando ${source}:${versionId} antes de lanzar...`);
        const installRes = await launcherAPI.installVersion({ source, versionId, loaderVersion, authMode, performanceProfileId, instanceMode });
        if (!installRes?.ok) return { ok: false, error: installRes?.error || "No se pudo iniciar instalación." };
        activeInstallId = installRes.installId || "";
        const waitRes = await waitInstallCompletion(activeInstallId);
        if (!waitRes.ok) return waitRes;
        check = await launcherAPI.isVersionInstalled({ source, versionId, loaderVersion });
        if (!check?.ok || !check?.installed) return { ok: false, error: check?.error || "Instalación no detectada tras completar." };
      }

      const launchVersionId = source === "fabric" && check?.profileId ? check.profileId : versionId;
      setGameStatus(`Lanzando ${launchVersionId}...`);
      const launchRes = await launcherAPI.launchGame({
        source,
        gameVersion: versionId,
        loaderVersion,
        performanceProfileId,
        instanceMode,
        versionId: launchVersionId,
        authMode,
        username,
        javaPath,
        minMemoryMb,
        maxMemoryMb,
        extraJvmArgs,
        extraGameArgs,
      });
      if (!launchRes?.ok) return { ok: false, error: launchRes?.error || "No se pudo lanzar el juego." };
      const runtimeCheck = await waitForRuntimeStable(8000, 4500);
      return runtimeCheck.ok ? { ok: true, pid: runtimeCheck.pid || launchRes.pid, mods: launchRes?.mods || null } : runtimeCheck;
    }

    async function launchSelectedGameFromUI() {
      if (!launcherAPI) return;
      const sel = gameVersionSelect?.selectedOptions?.[0];
      if (!sel) return setGameStatus("Selecciona una versión para lanzar.", true);
      const authMode = String(gameAuthModeSelect?.value || "offline");
      const lo = buildLaunchOptionsFromInputs();
      persistCurrentVersionSelection();
      await persistLaunchOptionsToConfig();
      if (lo.javaPath) await launcherAPI.setJavaPath(lo.javaPath);
      const result = await ensureInstalledThenLaunch({
        source: sel.dataset.source || "vanilla",
        versionId: sel.value,
        loaderVersion: sel.dataset.loaderVersion || "",
        authMode,
        username: authMode === "microsoft"
          ? (getSelectedMsAccount()?.minecraftUsername || "MicrosoftPlayer")
          : (String(gameUsernameInput?.value || "JugadorOffline").trim() || "JugadorOffline"),
        javaPath: lo.javaPath,
        minMemoryMb: lo.minMemoryMb,
        maxMemoryMb: Math.max(lo.minMemoryMb, lo.maxMemoryMb),
        extraJvmArgs: lo.extraJvmArgs,
        extraGameArgs: lo.extraGameArgs,
        performanceProfileId: lo.performanceProfileId,
        instanceMode: lo.instanceMode,
      });
      if (!result.ok) return setGameStatus(result.error || "No se pudo lanzar.", true);
      const installedCount = Number(result?.mods?.installed?.length || 0);
      const skippedCount = Number(result?.mods?.skipped?.length || 0);
      const coreState = result?.mods ? (result.mods.coreOk ? "core=OK" : "core=FAIL") : "";
      const profilePart = result?.mods?.profileId ? `perfil=${result.mods.profileId}` : "";
      const instancePart = result?.mods?.instancePath ? `instancia=${result.mods.instancePath}` : "";
      const modsPart = result?.mods
        ? `mods=${installedCount} skipped=${skippedCount} ${coreState}`.trim()
        : "";
      const details = [profilePart, instancePart, modsPart].filter(Boolean).join(" | ");
      setGameStatus(`Juego iniciado (PID ${result.pid || "?"})${details ? ` | ${details}` : ""}`);
    }

    // ── Config form ──────────────────────────────────────────────────────────
    function loadConfigIntoForm(cfg) {
      const config = cfg && typeof cfg === "object" ? cfg : {};
      const launcher = typeof config.launcher === "object" ? config.launcher : {};
      const versions = Array.isArray(launcher.preferredVersions) ? launcher.preferredVersions : [];
      $("cfg-client-id").value = String(config.clientId || "");
      const vset = new Set(versions.map((v) => String(v).trim()).filter(Boolean));
      Array.from($("cfg-preferred-versions").options).forEach((o) => { o.selected = vset.has(o.value); });
      $("cfg-reconnect-delay").value = String(launcher.reconnectDelayMs ?? 650);
      $("cfg-velocity-compat").checked = Boolean(launcher.velocityCompatMode);
      $("cfg-debug-lifecycle").checked = Boolean(launcher.debugLifecycle);
      $("cfg-verbose-mode").value = String(launcher.verboseMode || "app").toLowerCase() === "all" ? "all" : "app";
      $("cfg-auth-recovery-window").value = String(launcher.authRecoveryWindowMs ?? 30000);
      $("cfg-max-reconnect-attempts").value = String(launcher.maxReconnectAttempts ?? 6);
      $("cfg-reconnect-backoff-max").value = String(launcher.reconnectBackoffMaxMs ?? 4000);
      $("cfg-reconnect-jitter").value = String(launcher.reconnectJitterRatio ?? 0.2);

      if (bgTypeSelect) {
        bgTypeSelect.value = String(launcher.backgroundType || "video");
        if (bgVideoOptionsRow) bgVideoOptionsRow.classList.toggle("hidden", bgTypeSelect.value !== "video");
        if (bgCustomOptionsRow) bgCustomOptionsRow.classList.toggle("hidden", bgTypeSelect.value !== "custom");
      }
      currentCustomBgPath = launcher.customBackgroundPath || "";
      if (bgCustomPathDisplay) {
        bgCustomPathDisplay.textContent = currentCustomBgPath || "Ningún archivo seleccionado";
      }
    }

    function buildConfigFromForm() {
      const pInt = (id, def) => Number.parseInt($(id).value || def, 10) || def;
      const pFloat = (id, def) => Number.parseFloat($(id).value || def) || def;
      return {
        clientId: String($("cfg-client-id").value || "").trim(),
        launcher: {
          preferredVersions: Array.from($("cfg-preferred-versions").selectedOptions).map((o) => String(o.value).trim()).filter(Boolean),
          velocityCompatMode: Boolean($("cfg-velocity-compat").checked),
          debugLifecycle: Boolean($("cfg-debug-lifecycle").checked),
          verboseMode: String($("cfg-verbose-mode").value || "app").toLowerCase() === "all" ? "all" : "app",
          reconnectDelayMs: pInt("cfg-reconnect-delay", 650),
          authRecoveryWindowMs: pInt("cfg-auth-recovery-window", 30000),
          maxReconnectAttempts: pInt("cfg-max-reconnect-attempts", 6),
          reconnectBackoffMaxMs: pInt("cfg-reconnect-backoff-max", 4000),
          reconnectJitterRatio: pFloat("cfg-reconnect-jitter", 0.2),
          menuBackgroundMode: bgVideoModeSelect?.value || "auto",
          backgroundType: bgTypeSelect?.value || "video",
          customBackgroundPath: currentCustomBgPath || "",
          language: String($("cfg-language")?.value || "es").toLowerCase(),
        },
      };
    }

    function buildMergedConfig(base) {
      const b = base && typeof base === "object" ? base : {};
      const n = buildConfigFromForm();
      const lb = typeof b.launcher === "object" ? b.launcher : {};
      const baseDownloads = typeof lb.downloads === "object" ? lb.downloads : {};
      const mergedDownloads = normalizeLaunchOptions({
        ...baseDownloads,
        ...buildLaunchOptionsFromInputs(),
      });
      return {
        ...b, clientId: n.clientId,
        launcher: {
          ...lb, ...n.launcher,
          downloads: mergedDownloads,
        },
      };
    }

    // ── Views ────────────────────────────────────────────────────────────────
    async function openConfigView() {
      showLauncherView("config");
      if (!launcherAPI) return;
      const cfg = await launcherAPI.getConfig();
      const mode = String(cfg?.launcher?.menuBackgroundMode || "auto").toLowerCase();
      currentBgVideoMode = BG_VALID_MODES.includes(mode) ? mode : "auto";
      if (bgVideoModeSelect) bgVideoModeSelect.value = currentBgVideoMode;
      const languageSelect = $("cfg-language");
      if (languageSelect) languageSelect.value = String(cfg?.launcher?.language || "es");
      i18n?.setLanguage?.(String(cfg?.launcher?.language || "es"));
      loadConfigIntoForm(cfg || {});
    }

    async function openInfoView() {
      showLauncherView("info");
      if (!launcherAPI) return;
      const info = await launcherAPI.getInfo();
      const credits = Array.isArray(info.credits) ? info.credits.map((l) => `- ${l}`) : [];
      $("info-content").textContent = [`App: ${info.name}`, `Version: ${info.version}`, "", "Creditos:", ...credits, "", "Funcionamiento:", info.about || ""].join("\n");
    }

    async function toggleFullscreenMode() {
      if (typeof launcherAPI?.toggleFullscreen !== "function") return;
      const state = await launcherAPI.toggleFullscreen();
      const btn = $("menu-fullscreen-btn");
      if (btn && state?.ok) btn.textContent = state.isFullscreen ? t("launcher.menu.fullscreen.exit") : t("launcher.menu.fullscreen");
    }

    async function quitApplication() {
      if (typeof launcherAPI?.quitApp === "function") await launcherAPI.quitApp();
    }

    function startPanelSession() {
      if (gameStarted) return;
      gameStarted = true;
      if (launcherMenuAudio) { launcherMenuAudio.pause(); launcherMenuAudio.currentTime = 0; }
      window.location.href = "app.html";
    }

    async function bootContinue() {
      if (!launcherAPI) return startPanelSession();
      setLauncherStatus("Iniciando ultima sesion...");
      const result = await launcherAPI.startContinue();
      if (!result?.ok) return setLauncherStatus(result?.error || "No se pudo iniciar.", true);
      startPanelSession();
    }

    async function bootNewProfile() {
      if (!launcherAPI) return startPanelSession();
      const payload = {
        username: $("new-username").value.trim(),
        ip: $("new-ip").value.trim(),
        port: $("new-port").value.trim(),
        version: $("new-version").value.trim(),
      };
      setLauncherStatus("Creando perfil y arrancando bot...");
      const result = await launcherAPI.startNew(payload);
      if (!result?.ok) return setLauncherStatus(result?.error || "No se pudo crear el perfil.", true);
      startPanelSession();
    }

    // ── Init bindings ────────────────────────────────────────────────────────
    function initLauncherMenu() {
      bindClick("menu-play-btn", async () => {
        showLauncherView("play");
        switchPlayTab(activePlayTab);
        if (launcherAPI) {
          const [last, cfg] = await Promise.all([launcherAPI.getLastProfile(), launcherAPI.getConfig()]);
          if (last) {
            $("new-username").value = last.username || "";
            $("new-ip").value = last.ip || "";
            $("new-port").value = String(last.port || 25565);
            $("new-version").value = last.version || "";
          }
          loadLaunchOptionsFromConfig(cfg);
          if (!gameUsernameInput.value) gameUsernameInput.value = String(last?.username || "JugadorOffline");
          restoreRememberedDistribution();
          syncVersionTypeFiltersUI();
          updateFilterVisibilityByDistribution();
          await refreshMsSessions();
          updateAuthModeUI();
          if (activePlayTab === "java") await ensureJavaCatalogLoadedOnce();
        }
      });

      bindClick("menu-config-btn", openConfigView);
      bindClick("menu-info-btn", openInfoView);
      bindClick("menu-fullscreen-btn", toggleFullscreenMode);
      bindClick("menu-exit-btn", quitApplication);
      bindClick("play-back-btn", () => showLauncherView("main"));
      bindClick("config-back-btn", () => showLauncherView("main"));
      bindClick("info-back-btn", () => showLauncherView("main"));
      bindClick("continue-last-btn", bootContinue);
      bindClick("create-new-btn", () => $("new-profile-form").classList.remove("hidden"));
      bindClick("start-new-profile-btn", bootNewProfile);
      bindClick("game-launch-btn", launchSelectedGameFromUI);
      bindClick("game-stop-btn", async () => {
        if (!launcherAPI) return;
        const res = await launcherAPI.stopGame();
        if (!res?.ok) return setGameStatus(res?.error || "No se pudo cerrar el juego.", true);
        setGameStatus("Proceso del juego cerrado.");
      });
      bindClick("game-scan-java-btn", async () => {
        if (!launcherAPI) return;
        setGameStatus("Buscando instalaciones de Java...");
        const res = await launcherAPI.getJavaRuntimes();
        if (!res?.ok) return setGameStatus(res?.error || "No se pudo detectar Java.", true);
        const runtime = Array.isArray(res.runtimes) && res.runtimes.length ? res.runtimes[0] : null;
        if (!runtime) return setGameStatus("No se encontró Java automáticamente. Define la ruta manualmente.", true);
        if (gameJavaPathInput) gameJavaPathInput.value = runtime.path;
        await persistLaunchOptionsToConfig();
        await launcherAPI.setJavaPath(runtime.path);
        setGameStatus(`Java detectado: ${runtime.path}`);
      });
      bindClick("game-show-diagnostics-btn", showRuntimeDiagnostics);
      bindClick("ms-login-btn", async () => {
        if (typeof launcherAPI?.msLogin !== "function") return;
        setMsAuthStatus("Abriendo Microsoft Login...");
        const res = await launcherAPI.msLogin();
        if (!res?.ok) return setMsAuthStatus(res?.error || "No se pudo iniciar sesión Microsoft.", true);
        await refreshMsSessions(); setGameStatus("Sesión Microsoft iniciada."); updateAuthModeUI();
      });
      bindClick("ms-logout-btn", async () => {
        if (typeof launcherAPI?.msLogout !== "function") return;
        const res = await launcherAPI.msLogout();
        if (!res?.ok) return setMsAuthStatus(res?.error || "No se pudo cerrar sesión.", true);
        await refreshMsSessions(); setGameStatus("Sesiones Microsoft cerradas."); updateAuthModeUI();
      });
      bindClick("ms-remove-btn", async () => {
        if (typeof launcherAPI?.removeAuthSession !== "function") return;
        const active = getSelectedMsAccount();
        if (!active) return setMsAuthStatus("Selecciona una cuenta para quitar.", true);
        const res = await launcherAPI.removeAuthSession(active.id);
        if (!res?.ok) return setMsAuthStatus(res?.error || "No se pudo quitar cuenta.", true);
        await refreshMsSessions(); setGameStatus("Cuenta Microsoft eliminada."); updateAuthModeUI();
      });
      bindClick("save-config-btn", async () => {
        if (!launcherAPI) return;
        try {
          const parsed = buildMergedConfig(await launcherAPI.getConfig());
          const result = await launcherAPI.saveConfig(parsed);
          if (!result?.ok) return setLauncherStatus(translateError(result, "launcher.status.saveFailed"), true);
          currentBgVideoMode = String(parsed.launcher.menuBackgroundMode || "auto").toLowerCase();
          applyLauncherBackgroundVideo(currentBgVideoMode);
          i18n?.setLanguage?.(String(parsed?.launcher?.language || "es"));
          setLauncherStatus(t("launcher.status.saved"));
        } catch { setLauncherStatus(t("launcher.status.invalidJson"), true); }
      });

      bgVideoModeSelect?.addEventListener("change", () => applyLauncherBackgroundVideo(bgVideoModeSelect.value));
      $("cfg-language")?.addEventListener("change", () => {
        i18n?.setLanguage?.(String($("cfg-language").value || "es"));
      });
      playTabBotBtn?.addEventListener("click", () => switchPlayTab("bot"));
      playTabJavaBtn?.addEventListener("click", async () => { switchPlayTab("java"); await ensureJavaCatalogLoadedOnce(); });

      gameDistributionSelect?.addEventListener("change", async () => {
        updateFilterVisibilityByDistribution(); refreshVersionSelect(); await loadGameCatalog(true);
      });
      gameVersionSelect?.addEventListener("change", persistCurrentVersionSelection);
      gameVersionSelect?.addEventListener("dblclick", launchSelectedGameFromUI);

      // Version type filter checkboxes — same pattern, consolidated.
      [
        { el: filterRelease, key: "release" },
        { el: filterSnapshot, key: "snapshot" },
        { el: filterOldBeta, key: "old_beta" },
        { el: filterOldAlpha, key: "old_alpha" },
      ].forEach(({ el, key }) => {
        el?.addEventListener("change", async () => {
          versionTypeFilters[key] = Boolean(el.checked);
          refreshVersionSelect();
          await loadGameCatalog(true);
        });
      });

      gameAuthModeSelect?.addEventListener("change", () => {
        if (String(gameAuthModeSelect.value || "offline") === "microsoft") {
          gameAuthModeSelect.value = "offline";
          setGameStatus(t("launcher.status.msDisabled"), true);
        }
        updateAuthModeUI();
      });
      msAccountSelect?.addEventListener("change", async () => {
        if (typeof launcherAPI?.setActiveAuthSession !== "function") return;
        const id = String(msAccountSelect.value || "");
        if (!id) return;
        const res = await launcherAPI.setActiveAuthSession(id);
        if (!res?.ok) return setMsAuthStatus(translateError(res, "launcher.ms.changeFail"), true);
        msAuthState.activeAccountId = id;
        renderMsAccounts();
      });

      // Persist launch options on any input change — consolidated.
      [gameJavaPathInput, gameMinMemoryInput, gameMaxMemoryInput, gameExtraJvmArgsInput, gameExtraGameArgsInput, gamePerformanceProfileSelect].forEach((el) => {
        el?.addEventListener("change", persistLaunchOptionsToConfig);
      });

      switchPlayTab("bot");
      if (gameAuthModeSelect) gameAuthModeSelect.value = "offline";
      updateAuthModeUI();
      showLauncherView("main");
    }

    // ── Module context objects ────────────────────────────────────────────────
    // Wrappers removed where the function IS the value; direct refs used instead.
    const moduleCtx = {
      launcherAPI,
      dom: { gameVersionSelect, gameDistributionSelect, bgVideoModeSelect },
      applyVersionFilters,
      getDistributionEntries,
      getEntryVersionId,
      getVersionTypeFilters: () => versionTypeFilters,
      loadLastGameSelections,
      setGameStatus,
      setCatalogRequestSeq: (v) => { catalogRequestSeq = v; },
      getCatalogRequestSeq: () => catalogRequestSeq,
      getLastAppliedCatalogRequest: () => lastAppliedCatalogRequest,
      setLastAppliedCatalogRequest: (v) => { lastAppliedCatalogRequest = v; },
      setGameCatalog: (v) => { gameCatalog = v; },
      getGameCatalog: () => gameCatalog,
      refreshVersionSelect,
      translateError,
    };

    const navigationCtx = {
      MAIN_MENU_BUTTON_IDS,
      dom: { launcherControlsHint, launcherConfigView, launcherPlayView, launcherInfoView, launcherMainMenu },
      getCurrentLauncherView: () => currentLauncherView,
      setCurrentLauncherView: (v) => { currentLauncherView = v; },
      getLauncherViewHistory: () => [...launcherViewHistory],
      setLauncherViewHistory: (h) => { launcherViewHistory = Array.isArray(h) ? [...h] : ["main"]; },
      getActiveMainMenuIndex: () => activeMainMenuIndex,
      setActiveMainMenuIndex: (v) => { activeMainMenuIndex = v; },
      getActiveConfigIndex: () => activeConfigIndex,
      setActiveConfigIndex: (v) => { activeConfigIndex = v; },
      getActivePlayIndex: () => activePlayIndex,
      setActivePlayIndex: (v) => { activePlayIndex = v; },
      getActiveInfoIndex: () => activeInfoIndex,
      setActiveInfoIndex: (v) => { activeInfoIndex = v; },
      startMenuAudio,
      setLauncherStatus,
      toggleFullscreenMode,
    };

    const actionsCtx = {
      launcherAPI,
      dom: {
        bgVideoModeSelect, playTabBotBtn, playTabJavaBtn, gameDistributionSelect, gameVersionSelect,
        gameAuthModeSelect, msAccountSelect, gameJavaPathInput, gameMinMemoryInput, gameMaxMemoryInput,
        gameExtraJvmArgsInput, gameExtraGameArgsInput, filterRelease, filterSnapshot, filterOldBeta, filterOldAlpha, gameUsernameInput,
      },
      versionTypeFilters,
      getActivePlayTab: () => activePlayTab,
      switchPlayTab, showLauncherView, loadLaunchOptionsFromConfig, restoreRememberedDistribution,
      syncVersionTypeFiltersUI, updateFilterVisibilityByDistribution, refreshMsSessions, updateAuthModeUI,
      ensureJavaCatalogLoadedOnce, openConfigView, openInfoView, toggleFullscreenMode, quitApplication,
      bootContinue, bootNewProfile, launchSelectedGameFromUI,
      setGameStatus, persistLaunchOptionsToConfig, showRuntimeDiagnostics, buildMergedConfig, setLauncherStatus,
      setCurrentBgVideoMode: (v) => { currentBgVideoMode = v; },
      getCurrentBgVideoMode: () => currentBgVideoMode,
      applyLauncherBackgroundVideo, persistCurrentVersionSelection, loadGameCatalog, refreshVersionSelect,
      setMsAuthStatus,
      setMsActiveAccountId: (id) => { msAuthState.activeAccountId = id; },
      renderMsAccounts,
      translateError,
      applyLauncherBackground,
      browseCustomBackground,
      openFolder,
      getCurrentCustomBgPath: () => currentCustomBgPath,
      openAddServerModal,
      openEditServerModal,
      closeServerModal,
      saveServerModalForm,
      toggleServerModalPassword,
      loadAndRenderSavedServers,
    };

    // ── NS plugin overrides ──────────────────────────────────────────────────
    // Consolidated from 6 individual if-blocks to a declarative table.
    const PLUGIN_OVERRIDES = [
      ["catalog", "refreshVersionSelect", (fn) => { refreshVersionSelect = fn.bind(null, moduleCtx); }],
      ["catalog", "applyVersionFilters", (fn) => { applyVersionFilters = fn.bind(null, moduleCtx); }],
      ["catalog", "loadGameCatalog", (fn) => { loadGameCatalog = fn.bind(null, moduleCtx); }],
      ["runtime", "waitInstallCompletion", (fn) => { waitInstallCompletion = fn.bind(null, moduleCtx); }],
      ["runtime", "formatRuntimeDiagnostics", (fn) => { formatRuntimeDiagnostics = fn.bind(null, moduleCtx); }],
      ["configForm", "loadConfigIntoForm", (fn) => { loadConfigIntoForm = fn.bind(null, moduleCtx); }],
      ["navigation", "showLauncherView", (fn) => { showLauncherView = fn.bind(null, navigationCtx); }],
      ["navigation", "goBackLauncherView", (fn) => { goBackLauncherView = fn.bind(null, navigationCtx); }],
    ];
    PLUGIN_OVERRIDES.forEach(([ns, method, apply]) => {
      if (typeof NS[ns]?.[method] === "function") apply(NS[ns][method]);
    });

    if (typeof NS.actions?.init === "function") NS.actions.init(actionsCtx);
    else initLauncherMenu();

    // ── Boot sequence ────────────────────────────────────────────────────────
    menuAudioMuted = loadMenuAudioMutedPreference();
    if (launcherAudioToggle) {
      bindEvent(launcherAudioToggle, "click", () => {
        menuAudioMuted = !menuAudioMuted;
        saveMenuAudioMutedPreference();
        updateMenuAudioToggle();
        if (!menuAudioMuted) startMenuAudio(true);
      });
    }
    i18n?.setLanguage?.("es");
    i18n?.applyTranslations?.(document);
    launcherAPI?.onLanguageChanged?.((lang) => {
      i18n?.setLanguage?.(lang);
      const languageSelect = $("cfg-language");
      if (languageSelect) languageSelect.value = String(lang || "es");
      updateMenuAudioToggle();
    });
    updateMenuAudioToggle();
    startMenuAudio();
    setupMenuAudioUnlockListeners();

    if (launcherAPI) {
      launcherAPI.getConfig()
        .then((cfg) => {
          const mode = String(cfg?.launcher?.menuBackgroundMode || "auto").toLowerCase();
          currentBgVideoMode = BG_VALID_MODES.includes(mode) ? mode : "auto";
          currentBgType = String(cfg?.launcher?.backgroundType || "video").toLowerCase();
          currentCustomBgPath = String(cfg?.launcher?.customBackgroundPath || "").trim();
          i18n?.setLanguage?.(String(cfg?.launcher?.language || "es"));
          if (bgVideoModeSelect) bgVideoModeSelect.value = currentBgVideoMode;
          applyLauncherBackground(currentBgType, currentBgVideoMode, currentCustomBgPath);
        })
        .catch(() => applyLauncherBackground("video", "auto"));

      loadAndRenderSavedServers();
    } else {
      applyLauncherBackground("video", "auto");
    }

    if (launcherBgVideo) {
      bindEvent(window, "resize", () => { if (currentBgVideoMode === "auto" && currentBgType === "video") applyLauncherBackgroundVideo("auto"); });
      bindEvent(document, "fullscreenchange", () => { if (currentBgVideoMode === "auto" && currentBgType === "video") applyLauncherBackgroundVideo("auto"); });
    }

    NS.navigation?.setupKeyboard?.(navigationCtx);

    if (typeof launcherAPI?.getFullscreen === "function") {
      launcherAPI.getFullscreen()
        .then((state) => {
          const btn = $("menu-fullscreen-btn");
          if (btn && state?.ok) btn.textContent = state.isFullscreen ? t("launcher.menu.fullscreen.exit") : t("launcher.menu.fullscreen");
        })
        .catch(() => { });
    }

    revealWindowWhenMenuReady();
  };
})();
