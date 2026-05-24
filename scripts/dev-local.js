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

if (process.env.LOCAL_SUPABASE_URL) {
  process.env.SUPABASE_URL = process.env.LOCAL_SUPABASE_URL;
}
if (process.env.LOCAL_SUPABASE_ANON_KEY) {
  process.env.SUPABASE_ANON_KEY = process.env.LOCAL_SUPABASE_ANON_KEY;
}
if (process.env.LOCAL_SUPABASE_SERVICE_ROLE_KEY) {
  process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.LOCAL_SUPABASE_SERVICE_ROLE_KEY;
}

require("../dev-server");
