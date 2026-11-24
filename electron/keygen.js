const crypto = require("crypto");

const SECRET =
  process.env.SCHOOL_LICENSE_SECRET || "CHANGE_THIS_TO_A_STRONG_PRIVATE_SECRET";

const org = process.argv[2] || "Sample School";
const exp = process.argv[3] || null; // e.g., "2027-12-31" or omit for lifetime

const payloadB64 = Buffer.from(JSON.stringify({ org, exp }), "utf8").toString(
  "base64url"
);
const sig = crypto
  .createHmac("sha256", SECRET)
  .update(payloadB64)
  .digest("base64url")
  .slice(0, 16)
  .toUpperCase();

console.log(`SM1-${payloadB64}.${sig}`);

