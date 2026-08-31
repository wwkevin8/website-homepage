"use strict";

const assert = require("assert/strict");
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const root = path.resolve(__dirname, "..");

function loadLocalUrl() {
  const content = fs.readFileSync(path.join(root, ".env"), "utf8");
  const match = content.match(/^LOCAL_SUPABASE_URL\s*=\s*["']?([^\r\n"']+)/m);
  assert.ok(match, "Missing LOCAL_SUPABASE_URL in .env");
  const url = new URL(match[1].trim());
  assert.ok(["127.0.0.1", "localhost", "::1"].includes(url.hostname), "Refusing non-local Supabase target");
}

function run(sqlFile) {
  loadLocalUrl();
  const sql = fs.readFileSync(path.join(root, "scripts", sqlFile), "utf8");
  const result = spawnSync("docker", ["exec", "-i", "supabase_db_webside", "psql", "-U", "postgres", "-d", "postgres", "-X", "-v", "ON_ERROR_STOP=1"], {
    cwd: root,
    input: sql,
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"]
  });
  process.stdout.write(result.stdout || "");
  process.stderr.write(result.stderr || "");
  if (result.status !== 0) process.exit(result.status || 1);
}

module.exports = { run };
