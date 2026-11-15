(function (global) {
  // prettier-ignore
  const MOJIBAKE_REPLACEMENTS = [
    ["├í", "á"], ["├®", "é"], ["├¡", "í"], ["├│", "ó"], ["├║", "ú"],
    ["├▒", "ñ"], ["├æ", "Ñ"], ["├ü", "Á"], ["├ë", "É"], ["├ì", "Í"],
    ["├ô", "Ó"], ["├Ü", "Ú"], ["├£", "Ü"], ["├╝", "ü"],
    ["┬í", "¡"], ["┬┐", "¿"],
    ["ÔÇª", "…"], ["ÔÇó", "•"], ["ÔÇ£", "\u201C"], ["ÔÇ¥", "\u201D"],
    ["ÔÇÿ", "—"], ["ÔÇô", "–"], ["ÔÇÖ", "\u2019"], ["ÔÇØ", '"'], ["ÔÇ", ""],
  ];

  // Box-drawing noise and known garbled byte patterns
  const RE_BOX = /[╔╗╚╝╠╣╦╩╬═║┌┐└┘├┤┬┴┼]+/g;
  const RE_GARBLE = /ß┤[A-Za-z0-9]|[ÛøÛ½]+/g;
  const RE_CTRL = /[\u0000-\u001F\u007F]/g;
  const RE_FFFD = /\uFFFD+/g;
  const RE_SPACE = /\s+/g;

  function normalizeMojibake(text) {
    let out = String(text ?? "");
    for (const [bad, good] of MOJIBAKE_REPLACEMENTS) out = out.split(bad).join(good);
    return out.replace(RE_BOX, " ").replace(RE_GARBLE, " ");
  }

  function sanitizeVisibleText(value) {
    return normalizeMojibake(value)
      .replace(RE_FFFD, "")
      .replace(RE_CTRL, " ")
      .replace(RE_SPACE, " ")
      .trim();
  }

  function formatVital(value) {
    const n = Number(value);
    return Number.isFinite(n) ? `${Math.max(0, Math.min(20, Math.round(n)))}/20` : "--/20";
  }

  function showToast(message, type = "info", duration = 3500) {
    let container = document.getElementById("bao-toast-container");
    if (!container) {
      container = document.createElement("div");
      container.id = "bao-toast-container";
      container.className = "bao-toast-container";
      document.body.appendChild(container);
    }

    const toast = document.createElement("div");
    toast.className = `bao-toast ${type}`;

    let iconHtml = "<span>ℹ️</span>";
    if (type === "success") iconHtml = "<span>✅</span>";
    else if (type === "error") iconHtml = "<span>⚠️</span>";

    toast.innerHTML = `${iconHtml}<span>${message}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
      toast.classList.add("leaving");
      setTimeout(() => {
        toast.remove();
      }, 250);
    }, duration);
  }

  global.MCShared = { sanitizeVisibleText, formatVital, showToast };
})(window);