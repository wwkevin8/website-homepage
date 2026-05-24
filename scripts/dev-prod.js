const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");

function loadEnvFile(targetEnv) {
  const envPath = path.join(root, ".env");
  if (!fs.existsSync(envPath)) {
    return;
  }

  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const eqIndex = trimmed.indexOf("=");
    if (eqIndex <= 0) {
      continue;
    }

    const key = trimmed.slice(0, eqIndex).trim();
    let value = trimmed.slice(eqIndex + 1).trim();
    if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in targetEnv)) {
      targetEnv[key] = value;
    }
  }
}

loadEnvFile(process.env);

process.env.APP_ENV = "production";
process.env.RUNTIME_MODE = "local_dev_prod_data";
process.env.ALLOW_PROD_IN_DEV = "true";

require("../dev-server");
