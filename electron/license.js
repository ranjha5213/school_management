const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

// Set via environment variable in production/CI; fallback only for local dev testing
const SECRET =
  process.env.SCHOOL_LICENSE_SECRET || "CHANGE_THIS_TO_A_STRONG_PRIVATE_SECRET";

function signPayload(payloadB64) {
  return crypto
    .createHmac("sha256", SECRET)
    .update(payloadB64)
    .digest("base64url")
    .slice(0, 16)
    .toUpperCase();
}

/**
 * Key format: SM1-<PAYLOAD_BASE64URL>.<SIG16>
 * Payload JSON: { org: "GHS Dhori", exp: "2027-12-31" | null }
 */
function verifyLicenseKey(rawKey) {
  if (!rawKey || typeof rawKey !== "string") {
    return { valid: false, reason: "License key is empty." };
  }

  const trimmed = rawKey.trim();
  if (!trimmed.startsWith("SM1-") || !trimmed.includes(".")) {
    return { valid: false, reason: "Invalid license key format." };
  }

  const withoutPrefix = trimmed.slice(4);
  const dotIdx = withoutPrefix.lastIndexOf(".");
  const payloadB64 = withoutPrefix.slice(0, dotIdx);
  const sig = withoutPrefix.slice(dotIdx + 1).toUpperCase();

  const expectedSig = signPayload(payloadB64);
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expectedSig);

  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return { valid: false, reason: "Invalid license signature." };
  }

  let data;
  try {
    data = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8"));
  } catch {
    return { valid: false, reason: "Corrupted license payload." };
  }

  if (data.exp) {
    const today = new Date().toISOString().slice(0, 10);
    if (today > data.exp) {
      return { valid: false, reason: `License expired on ${data.exp}.` };
    }
  }

  return {
    valid: true,
    org: data.org || "Licensed Institution",
    expires: data.exp || "Lifetime",
  };
}

function getLicenseFilePath(userDataDir) {
  return path.join(userDataDir, "license.json");
}

function loadSavedLicense(userDataDir) {
  const filePath = getLicenseFilePath(userDataDir);
  if (!fs.existsSync(filePath)) return null;

  try {
    const stored = JSON.parse(fs.readFileSync(filePath, "utf8"));
    const check = verifyLicenseKey(stored.key);
    if (!check.valid) return null;
    return { key: stored.key, ...check };
  } catch {
    return null;
  }
}

function saveLicenseKey(userDataDir, key) {
  const check = verifyLicenseKey(key);
  if (!check.valid) return check;

  fs.mkdirSync(userDataDir, { recursive: true });
  fs.writeFileSync(
    getLicenseFilePath(userDataDir),
    JSON.stringify({ key: key.trim(), activatedAt: new Date().toISOString() }, null, 2),
    "utf8"
  );
  return check;
}

module.exports = {
  verifyLicenseKey,
  loadSavedLicense,
  saveLicenseKey,
};

