const { spawn, spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const env = { ...process.env };

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
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    targetEnv[key] = value;
  }
}

function preferLocalSupabase(targetEnv) {
  if (targetEnv.DOCKER_SUPABASE_URL) {
    targetEnv.SUPABASE_URL = targetEnv.DOCKER_SUPABASE_URL;
  } else if (targetEnv.LOCAL_SUPABASE_URL) {
    targetEnv.SUPABASE_URL = targetEnv.LOCAL_SUPABASE_URL;
  }

  if (targetEnv.LOCAL_SUPABASE_ANON_KEY) {
    targetEnv.SUPABASE_ANON_KEY = targetEnv.LOCAL_SUPABASE_ANON_KEY;
  }

  if (targetEnv.LOCAL_SUPABASE_SERVICE_ROLE_KEY) {
    targetEnv.SUPABASE_SERVICE_ROLE_KEY = targetEnv.LOCAL_SUPABASE_SERVICE_ROLE_KEY;
  }
}

function normalizeWindowsEnv(targetEnv) {
  if (process.platform !== "win32") {
    return;
  }

  targetEnv.ComSpec = targetEnv.ComSpec || "C:\\Windows\\System32\\cmd.exe";
  targetEnv.Path = targetEnv.Path || targetEnv.PATH || "";
  targetEnv.PATH = targetEnv.PATH || targetEnv.Path || "";
}

loadEnvFile(env);
preferLocalSupabase(env);
normalizeWindowsEnv(env);

const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const node = process.execPath;

const build = spawnSync(npm, ["run", "build"], {
  cwd: root,
  env,
  shell: process.platform === "win32",
  stdio: "inherit"
});

if (build.error) {
  throw build.error;
}

if (build.status !== 0) {
  process.exit(build.status || 1);
}

const server = spawn(node, ["dev-server.js"], {
  cwd: root,
  env,
  stdio: "inherit"
});

server.on("error", error => {
  throw error;
});

server.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code || 0);
});
