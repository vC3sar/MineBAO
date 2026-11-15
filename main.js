const { app, BrowserWindow, dialog } = require("electron");
const { GameLauncherService } = require("./src/game-launcher");
const configManager = require("./src/main/config");
const windowManager = require("./src/main/window");
const botManager = require("./src/main/bot");
const { setupIpcHandlers } = require("./src/main/ipc");

console.log("[Main] main.js - main process is running");

const SENTRY_DSN =
  "https://502f8bb23f8a93c42a22eafe1d9aedde@o4511440032890880.ingest.us.sentry.io/4511440044621824";
let Sentry = null;
try {
  Sentry = require("@sentry/electron/main");
  Sentry.init({
    dsn: SENTRY_DSN,
    environment: app.isPackaged ? "production" : "development",
    debug: !app.isPackaged || process.env.SENTRY_DEBUG === "1",
    attachStacktrace: true,
    tracesSampleRate: 1.0,
    initialScope: {
      tags: {
        process: "main",
        app_name: "minebao",
      },
    },
  });
  console.log("[Main] Sentry initialized");
} catch (error) {
  Sentry = null;
  console.error("[Main] Sentry init failed. Continuing without telemetry.", error);
}

function isNetworkOrTimeoutError(errorLike) {
  const message = String(errorLike?.message || errorLike || "").toLowerCase();
  const code = String(errorLike?.code || "").toLowerCase();
  return (
    code === "etimedout" ||
    code === "econnrefused" ||
    code === "enotfound" ||
    code === "ehostunreach" ||
    code === "enetunreach" ||
    code === "econnreset" ||
    code === "epipe" ||
    message.includes("etimedout") ||
    message.includes("econnrefused") ||
    message.includes("enotfound") ||
    message.includes("ehostunreach") ||
    message.includes("enetunreach") ||
    message.includes("econnreset") ||
    message.includes("client timed out after") ||
    message.includes("connect etimedout")
  );
}

let gameLauncher = null;

app.whenReady().then(() => {
  try {
    console.log("[Main] app.whenReady()");

    // Inicializa la config por defecto
    const initialCfg = configManager.mergeLauncherDefaults(
      configManager.loadConfig(),
    );
    configManager.saveConfig(initialCfg);

    // Instancia el servicio del launcher
    gameLauncher = new GameLauncherService({
      appRoot: __dirname,
      loadConfig: () =>
        configManager.mergeLauncherDefaults(configManager.loadConfig()),
      saveConfig: (cfg) =>
        configManager.saveConfig(configManager.mergeLauncherDefaults(cfg)),
      stopBotSession: () => botManager.stopBotSession(),
      onInstallUpdate: () => {},
    });

    // Registra todos los handlers de IPC
    setupIpcHandlers(gameLauncher);

    // Crea la ventana principal
    windowManager.createWindow();

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        windowManager.createWindow();
      }
    });
  } catch (error) {
    const message = error?.message || String(error);
    console.error("[Main] startup failed:", error);
    Sentry?.captureException?.(error, {
      tags: { stage: "startup" },
      level: "fatal",
    });
    dialog.showErrorBox(
      "MineBAO - Startup Error",
      `La app no pudo iniciar.\n\n${message}`,
    );
    app.quit();
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

process.on("uncaughtException", (error) => {
  if (isNetworkOrTimeoutError(error)) {
    console.warn(
      "[Main] Handled network timeout/disconnect error:",
      error?.message || error,
    );
    return;
  }
  console.error("[Main] uncaughtException:", error);
  Sentry?.captureException?.(error, {
    tags: { handler: "uncaughtException" },
    level: "fatal",
  });
});

process.on("unhandledRejection", (reason) => {
  if (isNetworkOrTimeoutError(reason)) {
    console.warn(
      "[Main] Handled network timeout/disconnect rejection:",
      reason?.message || reason,
    );
    return;
  }
  console.error("[Main] unhandledRejection:", reason);
  Sentry?.captureException?.(
    reason instanceof Error ? reason : new Error(String(reason)),
    {
      tags: { handler: "unhandledRejection" },
      level: "error",
      extra: { reason },
    },
  );
});
