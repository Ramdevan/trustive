const crypto = require("crypto");

function generateApiKey() {
  return crypto.randomBytes(32).toString("hex");
}

const key = generateApiKey();
console.log("--------------------------------------------------");
console.log("NEW API KEY GENERATED:");
console.log(key);
console.log("--------------------------------------------------");
console.log("\nTo use this key, insert it into the 'api_keys' table:");
console.log(`INSERT INTO api_keys (api_key, client_name) VALUES ('${key}', 'PartnerName');`);
