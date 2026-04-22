"use strict";

const fs = require("fs");
const http = require("http");
const https = require("https");
const path = require("path");
const { chromium } = require("playwright");

const projectRoot = path.resolve(__dirname, "..");
const outputDir = path.join(projectRoot, "output", "playwright");

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return;
  }

  const content = fs.readFileSync(filePath, "utf8");
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const equalsIndex = line.indexOf("=");
    if (equalsIndex === -1) {
      continue;
    }

    const key = line.slice(0, equalsIndex).trim();
    if (!key || Object.prototype.hasOwnProperty.call(process.env, key)) {
      continue;
    }

    let value = line.slice(equalsIndex + 1).trim();
    if (
      (value.startsWith("\"") && value.endsWith("\"")) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function probeUrl(url) {
  return new Promise(resolve => {
    const client = url.startsWith("https://") ? https : http;
    const request = client.get(url, response => {
      response.resume();
      resolve(response.statusCode >= 200 && response.statusCode < 500);
    });

    request.on("error", () => resolve(false));
    request.setTimeout(3000, () => {
      request.destroy();
      resolve(false);
    });
  });
}

async function resolveBaseUrl() {
  if (process.env.PLAYWRIGHT_BASE_URL) {
    return process.env.PLAYWRIGHT_BASE_URL;
  }

  const candidates = [
    "http://localhost:3000",
    "http://localhost:3106",
    "https://ngn.best"
  ];

  for (const candidate of candidates) {
    const ok = await probeUrl(new URL("/pickup.html", candidate).toString());
    if (ok) {
      return candidate;
    }
  }

  throw new Error(
    "Could not find a reachable base URL. Set PLAYWRIGHT_BASE_URL or start the local dev server."
  );
}

async function assertPageOk(page, url, expectedText, screenshotName) {
  const response = await page.goto(url, {
    waitUntil: "domcontentloaded",
    timeout: 30000
  });

  if (!response || !response.ok()) {
    throw new Error(`Open ${url} failed with status ${response ? response.status() : "unknown"}`);
  }

  if (expectedText) {
    const expectedTexts = Array.isArray(expectedText) ? expectedText : [expectedText];
    let matched = false;
    let lastError = null;
    for (const text of expectedTexts) {
      try {
        await page.getByText(text, { exact: false }).first().waitFor({ timeout: 5000 });
        matched = true;
        break;
      } catch (error) {
        lastError = error;
      }
    }

    if (!matched && lastError) {
      throw lastError;
    }
  }

  await page.screenshot({
    path: path.join(outputDir, screenshotName),
    fullPage: true
  });
}

async function loginAdmin(page, baseUrl) {
  const username = process.env.ADMIN_BOOTSTRAP_USERNAME;
  const password = process.env.ADMIN_BOOTSTRAP_PASSWORD;

  if (!username || !password) {
    throw new Error("Missing ADMIN_BOOTSTRAP_USERNAME or ADMIN_BOOTSTRAP_PASSWORD in environment/.env");
  }

  const loginUrl = new URL("/admin-login.html?return_to=%2Ftransport-admin-groups.html", baseUrl).toString();
  const response = await page.goto(loginUrl, {
    waitUntil: "domcontentloaded",
    timeout: 30000
  });

  if (!response || !response.ok()) {
    throw new Error(`Open admin login failed with status ${response ? response.status() : "unknown"}`);
  }

  await page.getByRole("textbox", { name: "账号" }).fill(username);
  await page.getByRole("textbox", { name: "密码" }).fill(password);
  await page.getByRole("button", { name: "登录后台" }).click();
  await page.waitForURL("**/transport-admin-groups.html", { timeout: 15000 });
  await page.getByText("拼车组管理", { exact: false }).first().waitFor({ timeout: 10000 });
  await page.screenshot({
    path: path.join(outputDir, "smoke-admin-groups.png"),
    fullPage: true
  });
}

async function main() {
  loadEnvFile(path.join(projectRoot, ".env"));
  ensureDir(outputDir);

  const baseUrl = await resolveBaseUrl();
  const browser = await chromium.launch({
    headless: process.env.PLAYWRIGHT_HEADED !== "true"
  });

  try {
    const publicPage = await browser.newPage({
      viewport: { width: 1440, height: 960 }
    });

    await assertPageOk(
      publicPage,
      new URL("/pickup.html", baseUrl).toString(),
      ["诺丁汉 NGN 接送机与拼车服务", "接送机与拼车服务", "最新拼车信息"],
      "smoke-pickup-home.png"
    );

    await assertPageOk(
      publicPage,
      new URL("/transport-board.html", baseUrl).toString(),
      "最新接送机拼车信息",
      "smoke-transport-board.png"
    );

    const adminPage = await browser.newPage({
      viewport: { width: 1440, height: 960 }
    });
    await loginAdmin(adminPage, baseUrl);

    console.log(
      JSON.stringify(
        {
          ok: true,
          baseUrl,
          screenshots: [
            path.join("output", "playwright", "smoke-pickup-home.png"),
            path.join("output", "playwright", "smoke-transport-board.png"),
            path.join("output", "playwright", "smoke-admin-groups.png")
          ]
        },
        null,
        2
      )
    );
  } finally {
    await browser.close();
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
