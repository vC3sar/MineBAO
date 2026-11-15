"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { app } = require("electron");

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;

let cachedKey = null;

function getKeyFilePath() {
  const baseDir = app?.isPackaged
    ? path.join(app.getPath("userData"), "data")
    : path.join(__dirname, "../../");
  return path.join(baseDir, ".minebao_key");
}

function getOrCreateKey() {
  if (cachedKey) return cachedKey;

  const keyPath = getKeyFilePath();
  try {
    if (fs.existsSync(keyPath)) {
      const hex = fs.readFileSync(keyPath, "utf8").trim();
      if (hex.length === 64) {
        cachedKey = Buffer.from(hex, "hex");
        return cachedKey;
      }
    }
  } catch (err) {
    console.warn("[Crypto] Could not read existing key, regenerating:", err.message);
  }

  // Generate new 32-byte key
  cachedKey = crypto.randomBytes(32);
  try {
    fs.mkdirSync(path.dirname(keyPath), { recursive: true });
    fs.writeFileSync(keyPath, cachedKey.toString("hex"), { encoding: "utf8", mode: 0o600 });
  } catch (err) {
    console.warn("[Crypto] Could not persist key to file:", err.message);
  }

  return cachedKey;
}

function encryptPassword(plainText) {
  if (!plainText || typeof plainText !== "string") return "";
  try {
    const key = getOrCreateKey();
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

    let encrypted = cipher.update(plainText, "utf8", "hex");
    encrypted += cipher.final("hex");
    const tag = cipher.getAuthTag().toString("hex");

    return `enc:v1:${iv.toString("hex")}:${tag}:${encrypted}`;
  } catch (err) {
    console.error("[Crypto] Encryption failed:", err);
    return plainText;
  }
}

function decryptPassword(cipherText) {
  if (!cipherText || typeof cipherText !== "string") return "";
  if (!cipherText.startsWith("enc:v1:")) return cipherText; // Return plain text as fallback

  try {
    const parts = cipherText.split(":");
    if (parts.length !== 5) return "";

    const [, , ivHex, tagHex, dataHex] = parts;
    const key = getOrCreateKey();
    const iv = Buffer.from(ivHex, "hex");
    const tag = Buffer.from(tagHex, "hex");

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);

    let decrypted = decipher.update(dataHex, "hex", "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
  } catch (err) {
    console.error("[Crypto] Decryption failed:", err.message);
    return "";
  }
}

module.exports = {
  encryptPassword,
  decryptPassword,
};
