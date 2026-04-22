"use strict";

const fs = require("fs");
const http = require("http");
const https = require("https");
const path = require("path");
const { chromium } = require("playwright");
const { getSupabaseAdmin } = require("../api/_lib/supabase");
const { hashPassword } = require("../api/_lib/admin-security");
const { createUserSessionToken } = require("../api/_lib/user-auth");

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

  throw new Error("Could not find a reachable base URL. Set PLAYWRIGHT_BASE_URL or start the local dev server.");
}

function slug(value) {
  return String(value || "").replace(/[^a-zA-Z0-9_-]/g, "-");
}

function futureDateTimeLocal(daysToAdd, hour, minute) {
  const date = new Date();
  date.setDate(date.getDate() + daysToAdd);
  date.setHours(hour, minute, 0, 0);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hh}:${mm}`;
}

function futureDate(daysToAdd) {
  const date = new Date();
  date.setDate(date.getDate() + daysToAdd);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function toIsoString(localDateTime) {
  return new Date(localDateTime).toISOString();
}

async function ensureQaUser(runId, suffix) {
  const supabase = getSupabaseAdmin();
  const email = `qa_transport_${slug(runId)}_${suffix}@example.com`;
  const password = process.env.PLAYWRIGHT_QA_PASSWORD || "QaFlow123456!";
  const nickname = `QA ${suffix.toUpperCase()} ${runId.slice(-4)}`;
  const nowIso = new Date().toISOString();

  const existing = await supabase
    .from("site_users")
    .select("id, email")
    .eq("email", email)
    .maybeSingle();

  if (existing.error) {
    throw existing.error;
  }

  const payload = {
    email,
    nickname,
    phone: suffix === "u1" ? "+447700900123" : "+447700900456",
    contact_preference: "wechat",
    wechat_id: `qa_wechat_${slug(runId)}_${suffix}`,
    whatsapp_contact: "",
    nationality: "China",
    password_hash: hashPassword(password),
    email_verified_at: nowIso
  };

  if (existing.data?.id) {
    const updated = await supabase
      .from("site_users")
      .update(payload)
      .eq("id", existing.data.id)
      .select("id, email, nickname, phone, wechat_id")
      .single();

    if (updated.error) {
      throw updated.error;
    }

    return {
      ...updated.data,
      password
    };
  }

  const inserted = await supabase
    .from("site_users")
    .insert(payload)
    .select("id, email, nickname, phone, wechat_id")
    .single();

  if (inserted.error) {
    throw inserted.error;
  }

  return {
    ...inserted.data,
    password
  };
}

async function createAuthenticatedContext(browser, baseUrl, user) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 960 }
  });

  const base = new URL(baseUrl);
  await context.addCookies([
    {
      name: "ngn_user_session",
      value: createUserSessionToken(user.id),
      domain: base.hostname,
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
      secure: base.protocol === "https:"
    }
  ]);

  return context;
}

async function loginAdmin(page, baseUrl) {
  const username = process.env.ADMIN_BOOTSTRAP_USERNAME;
  const password = process.env.ADMIN_BOOTSTRAP_PASSWORD;
  if (!username || !password) {
    throw new Error("Missing admin bootstrap credentials in .env");
  }

  await page.goto(new URL("/admin-login.html?return_to=%2Ftransport-admin-requests.html", baseUrl).toString(), {
    waitUntil: "domcontentloaded",
    timeout: 30000
  });
  await page.getByRole("textbox", { name: "账号" }).fill(username);
  await page.getByRole("textbox", { name: "密码" }).fill(password);
  await page.getByRole("button", { name: "登录后台" }).click();
  await page.waitForURL("**/transport-admin-requests.html", { timeout: 15000 });
}

async function apiRequest(page, url, options = {}) {
  const currentPageUrl = page.url();
  const requestUrl = /^https?:\/\//i.test(url)
    ? url
    : new URL(
      url,
      currentPageUrl && currentPageUrl.startsWith("http")
        ? currentPageUrl
        : (process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3000")
    ).toString();

  const result = await page.evaluate(async ({ url, options }) => {
    const response = await fetch(url, {
      method: options.method || "GET",
      credentials: "include",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json"
      },
      body: options.body ? JSON.stringify(options.body) : undefined
    });
    const payload = await response.json().catch(() => null);
    return {
      ok: response.ok,
      status: response.status,
      payload
    };
  }, { url: requestUrl, options });

  if (!result.ok) {
    throw new Error(result.payload?.error?.message || `Request failed: ${requestUrl} (${result.status})`);
  }

  return result.payload?.data;
}

async function submitPickupOrder(page, baseUrl, runId, variant, screenshotPrefix) {
  await page.goto(new URL("/pickup-form.html", baseUrl).toString(), {
    waitUntil: "domcontentloaded",
    timeout: 30000
  });

  await page.getByText("已自动带入并锁定账号资料", { exact: false }).waitFor({ timeout: 10000 });

  const dateTime = futureDateTimeLocal(30, 10, variant.minute);
  const preferredTime = futureDateTimeLocal(30, 10, variant.minute + 10);
  const deadlineDate = futureDate(2);
  const flightNo = `${variant.flightPrefix}${String(Date.now()).slice(-4)}`;

  await page.locator('input[name="service_mode"][value="pickup"]').check();
  await page.locator('select[name="airport_name"]').selectOption({ index: 1 });
  await page.locator('input[name="terminal"]').fill("T1");
  await page.locator('input[name="flight_no"]').fill(flightNo);
  await page.locator('input[name="flight_datetime"]').fill(dateTime);
  await page.locator('input[name="preferred_time"]').fill(preferredTime);
  await page.locator('input[name="deadline_date"]').fill(deadlineDate);
  await page.locator('input[name="share_goal"][value="2"]').check();
  await page.locator('input[name="luggage_option"]').first().check();
  await page.locator('input[name="nottingham_address"]').fill(variant.address);
  await page.locator('input[name="fallback_accept"][value="accept"]').check();
  await page.locator('input[name="agreement"]').check();

  await page.screenshot({
    path: path.join(outputDir, `${screenshotPrefix}-form.png`),
    fullPage: true
  });

  const submitResponsePromise = page.waitForResponse(
    response => response.url().includes("/api/public/transport-request-submit") && response.request().method() === "POST",
    { timeout: 20000 }
  );

  await page.getByRole("button", { name: "提交" }).click();
  const submitResponse = await submitResponsePromise;
  const submitPayload = await submitResponse.json().catch(() => null);

  if (!submitResponse.ok() || !submitPayload?.data?.orderNo || !submitPayload?.data?.groupId) {
    const errorMessage = submitPayload?.error?.message || `submit failed with status ${submitResponse.status()}`;
    throw new Error(errorMessage);
  }

  await page.locator("#carpoolSubmitMessage").getByText("提交成功", { exact: false }).first().waitFor({ timeout: 15000 });

  await page.screenshot({
    path: path.join(outputDir, `${screenshotPrefix}-submit.png`),
    fullPage: true
  });

  return {
    orderNo: submitPayload.data.orderNo,
    groupId: submitPayload.data.groupId,
    flightDateTimeIso: toIsoString(dateTime),
    preferredTimeIso: toIsoString(preferredTime),
    flightNo,
    address: variant.address
  };
}

async function fetchMyRequestByOrder(page, orderNo) {
  const requests = await apiRequest(page, "/api/public/my-transport-requests");
  const match = (requests || []).find(item => item.order_no === orderNo);
  if (!match) {
    throw new Error(`Could not find ${orderNo} in my-transport-requests`);
  }
  return match;
}

async function verifyServiceCenter(page, baseUrl, user, targetText, screenshotPath) {
  await page.goto(new URL("/service-center.html", baseUrl).toString(), {
    waitUntil: "domcontentloaded",
    timeout: 30000
  });

  await page.getByText(user.nickname, { exact: false }).first().waitFor({ timeout: 10000 });
  await page.getByText(targetText, { exact: false }).first().waitFor({ timeout: 10000 });

  await page.screenshot({
    path: screenshotPath,
    fullPage: true
  });
}

async function verifyDatabase(user, orderInfo) {
  const supabase = getSupabaseAdmin();
  const requestResult = await supabase
    .from("transport_requests")
    .select("id, order_no, site_user_id, location_to, flight_no")
    .eq("order_no", orderInfo.orderNo)
    .maybeSingle();

  if (requestResult.error) {
    throw requestResult.error;
  }

  const request = requestResult.data;
  if (!request) {
    throw new Error(`Order ${orderInfo.orderNo} was not persisted`);
  }

  const memberResult = await supabase
    .from("transport_group_members")
    .select("group_id")
    .eq("request_id", request.id)
    .maybeSingle();

  if (memberResult.error) {
    throw memberResult.error;
  }

  const groupId = memberResult.data?.group_id || null;
  if (request.site_user_id !== user.id || groupId !== orderInfo.groupId) {
    throw new Error(`Database verification failed for ${orderInfo.orderNo}`);
  }

  return {
    requestId: request.id,
    groupId,
    locationTo: request.location_to,
    flightNo: request.flight_no
  };
}

async function verifyRequestDeleted(requestId) {
  const supabase = getSupabaseAdmin();
  const requestResult = await supabase
    .from("transport_requests")
    .select("id")
    .eq("id", requestId)
    .maybeSingle();

  if (requestResult.error) {
    throw requestResult.error;
  }

  if (requestResult.data) {
    throw new Error(`Request ${requestId} still exists after deletion`);
  }

  const memberResult = await supabase
    .from("transport_group_members")
    .select("request_id")
    .eq("request_id", requestId);

  if (memberResult.error) {
    throw memberResult.error;
  }

  if ((memberResult.data || []).length) {
    throw new Error(`Membership rows for request ${requestId} still exist after deletion`);
  }
}

async function verifyGroupDeleted(groupId) {
  const supabase = getSupabaseAdmin();
  const groupResult = await supabase
    .from("transport_groups")
    .select("id")
    .eq("group_id", groupId)
    .maybeSingle();

  if (groupResult.error && !String(groupResult.error.message || "").includes("transport_groups.group_id")) {
    throw groupResult.error;
  }

  if (groupResult.data) {
    throw new Error(`Group ${groupId} still exists after deletion`);
  }

  const memberResult = await supabase
    .from("transport_group_members")
    .select("group_id")
    .eq("group_id", groupId);

  if (memberResult.error) {
    throw memberResult.error;
  }

  if ((memberResult.data || []).length) {
    throw new Error(`Membership rows for group ${groupId} still exist after deletion`);
  }
}

async function verifyGroupMemberships(requestIds, expectedGroupId) {
  const supabase = getSupabaseAdmin();
  const membershipResult = await supabase
    .from("transport_group_members")
    .select("request_id, group_id")
    .in("request_id", requestIds);

  if (membershipResult.error) {
    throw membershipResult.error;
  }

  const memberships = membershipResult.data || [];
  const missing = requestIds.filter(requestId => !memberships.some(item => item.request_id === requestId && item.group_id === expectedGroupId));
  if (missing.length) {
    throw new Error(`Group membership verification failed for requests: ${missing.join(", ")}`);
  }
}

async function verifyMyRequestAbsent(page, orderNo) {
  const requests = await apiRequest(page, "/api/public/my-transport-requests");
  if ((requests || []).some(item => item.order_no === orderNo)) {
    throw new Error(`Order ${orderNo} is still visible in personal center`);
  }
}

async function verifyAdminRequestAbsent(page, baseUrl, orderNo, screenshotPrefix) {
  await page.goto(new URL("/transport-admin-requests.html", baseUrl).toString(), {
    waitUntil: "domcontentloaded",
    timeout: 30000
  });
  await page.locator('input[name="order_no"]').fill(orderNo);
  await page.locator('select[name="status"]').selectOption("active");
  await page.locator("#transportRequestFilters").evaluate(form => form.requestSubmit());
  await page.waitForTimeout(1200);

  const bodyText = await page.locator("body").innerText();
  if (bodyText.includes(orderNo)) {
    throw new Error(`Deleted order ${orderNo} is still visible on admin requests page`);
  }

  await page.screenshot({
    path: path.join(outputDir, `${screenshotPrefix}-admin-request-deleted.png`),
    fullPage: true
  });
}

async function createJoinPayloadFromBoardItem(targetItem, runId) {
  const terminal = Array.isArray(targetItem.terminal_values) && targetItem.terminal_values.length
    ? targetItem.terminal_values[0]
    : (targetItem.terminal || "T1");

  return {
    target_request_id: targetItem.id,
    airport_code: targetItem.airport_code,
    airport_name: targetItem.airport_name,
    terminal,
    flight_no: `QJ${String(Date.now()).slice(-4)}`,
    flight_datetime: targetItem.flight_datetime,
    preferred_time_start: targetItem.preferred_time_start || targetItem.flight_datetime,
    passenger_count: 1,
    luggage_count: 1,
    location_from: targetItem.location_from,
    location_to: targetItem.location_to,
    notes: `QA join flow ${runId}`
  };
}

async function verifyAdminSearchPages(page, baseUrl, orderNo, groupId, screenshotPrefix, options = {}) {
  const requestStatus = options.requestStatus || "active";

  await page.goto(new URL("/transport-admin-requests.html", baseUrl).toString(), {
    waitUntil: "domcontentloaded",
    timeout: 30000
  });
  await page.locator('input[name="order_no"]').fill(orderNo);
  await page.locator('select[name="status"]').selectOption(requestStatus);
  await page.locator("#transportRequestFilters").evaluate(form => form.requestSubmit());
  await page.getByText(orderNo, { exact: false }).first().waitFor({ timeout: 10000 });
  await page.screenshot({
    path: path.join(outputDir, `${screenshotPrefix}-admin-requests.png`),
    fullPage: true
  });

  await page.goto(new URL(`/transport-admin-group-edit.html?id=${encodeURIComponent(groupId)}`, baseUrl).toString(), {
    waitUntil: "domcontentloaded",
    timeout: 30000
  });
  await page.getByText(groupId, { exact: false }).first().waitFor({ timeout: 10000 });
  await page.screenshot({
    path: path.join(outputDir, `${screenshotPrefix}-admin-groups.png`),
    fullPage: true
  });
}

async function main() {
  loadEnvFile(path.join(projectRoot, ".env"));
  ensureDir(outputDir);

  const runId = `pw_flow_${Date.now()}`;
  const baseUrl = await resolveBaseUrl();
  process.env.PLAYWRIGHT_BASE_URL = baseUrl;
  const user1 = await ensureQaUser(runId, "u1");
  const user2 = await ensureQaUser(runId, "u2");
  const user3 = await ensureQaUser(runId, "u3");
  const user4 = await ensureQaUser(runId, "u4");
  const user5 = await ensureQaUser(runId, "u5");
  const browser = await chromium.launch({
    headless: process.env.PLAYWRIGHT_HEADED !== "true"
  });

  try {
    const userContext1 = await createAuthenticatedContext(browser, baseUrl, user1);
    const userContext2 = await createAuthenticatedContext(browser, baseUrl, user2);
    const userContext3 = await createAuthenticatedContext(browser, baseUrl, user3);
    const userContext4 = await createAuthenticatedContext(browser, baseUrl, user4);
    const userContext5 = await createAuthenticatedContext(browser, baseUrl, user5);
    const userPage1 = await userContext1.newPage();
    const userPage2 = await userContext2.newPage();
    const userPage3 = await userContext3.newPage();
    const userPage4 = await userContext4.newPage();
    const userPage5 = await userContext5.newPage();

    const orderInfo1 = await submitPickupOrder(userPage1, baseUrl, runId, {
      minute: 30,
      flightPrefix: "QA",
      address: `QA Flow ${runId} Flat 28, Orbital`
    }, `transport-flow-${slug(runId)}-u1`);
    const orderInfo2 = await submitPickupOrder(userPage2, baseUrl, runId, {
      minute: 40,
      flightPrefix: "QB",
      address: `QA Flow ${runId} Flat 28, Orbital`
    }, `transport-flow-${slug(runId)}-u2`);
    const orderInfo3 = await submitPickupOrder(userPage3, baseUrl, runId, {
      minute: 50,
      flightPrefix: "QC",
      address: `QA Flow ${runId} Flat 30, Orbital`
    }, `transport-flow-${slug(runId)}-u3`);
    const orderInfo4 = await submitPickupOrder(userPage4, baseUrl, runId, {
      minute: 55,
      flightPrefix: "QD",
      address: `QA Flow ${runId} Flat 32, Orbital`
    }, `transport-flow-${slug(runId)}-u4`);

    await verifyServiceCenter(
      userPage1,
      baseUrl,
      user1,
      orderInfo1.groupId,
      path.join(outputDir, `transport-flow-${slug(runId)}-u1-service-center-initial.png`)
    );
    await verifyServiceCenter(
      userPage2,
      baseUrl,
      user2,
      orderInfo2.groupId,
      path.join(outputDir, `transport-flow-${slug(runId)}-u2-service-center-initial.png`)
    );
    await verifyServiceCenter(
      userPage3,
      baseUrl,
      user3,
      orderInfo3.groupId,
      path.join(outputDir, `transport-flow-${slug(runId)}-u3-service-center-initial.png`)
    );
    await verifyServiceCenter(
      userPage4,
      baseUrl,
      user4,
      orderInfo4.groupId,
      path.join(outputDir, `transport-flow-${slug(runId)}-u4-service-center-initial.png`)
    );

    const dbRecord1 = await verifyDatabase(user1, orderInfo1);
    const dbRecord2 = await verifyDatabase(user2, orderInfo2);
    const dbRecord3 = await verifyDatabase(user3, orderInfo3);
    const dbRecord4 = await verifyDatabase(user4, orderInfo4);

    const initialRequest1 = await fetchMyRequestByOrder(userPage1, orderInfo1.orderNo);
    const initialRequest2 = await fetchMyRequestByOrder(userPage2, orderInfo2.orderNo);

    if (Number(initialRequest1.current_passenger_count || 0) !== 1 || Number(initialRequest2.current_passenger_count || 0) !== 1) {
      throw new Error("Initial personal-center passenger counts are not 1");
    }
    if (String(initialRequest1.group_id || "") === String(initialRequest2.group_id || "")) {
      throw new Error("Initial orders unexpectedly landed in the same group");
    }

    const adminContext = await browser.newContext({
      viewport: { width: 1440, height: 960 }
    });
    const adminPage = await adminContext.newPage();
    await loginAdmin(adminPage, baseUrl);

    await apiRequest(adminPage, `/api/transport-groups/${encodeURIComponent(orderInfo1.groupId)}/members`, {
      method: "POST",
      body: {
        request_ids: [dbRecord1.requestId, dbRecord2.requestId]
      }
    });

    const regroupResult = await apiRequest(adminPage, `/api/transport-groups/${encodeURIComponent(orderInfo1.groupId)}`);
    const regroupedPassengerCount = Number(regroupResult.current_passenger_count || regroupResult.summary?.current_passenger_count || 0);
    if (regroupedPassengerCount !== 2) {
      throw new Error("Regroup did not result in 2 passengers");
    }

    await verifyGroupMemberships([dbRecord1.requestId, dbRecord2.requestId], orderInfo1.groupId);

    const regroupedRequest1 = await fetchMyRequestByOrder(userPage1, orderInfo1.orderNo);
    const regroupedRequest2 = await fetchMyRequestByOrder(userPage2, orderInfo2.orderNo);
    const regroupedPrice = Number(regroupedRequest1.current_average_price_gbp || 0);
    if (
      Number(regroupedRequest1.current_passenger_count || 0) !== 2 ||
      Number(regroupedRequest2.current_passenger_count || 0) !== 2 ||
      String(regroupedRequest2.group_id || "") !== String(orderInfo1.groupId) ||
      !regroupedPrice ||
      regroupedPrice !== Number(regroupedRequest2.current_average_price_gbp || 0)
    ) {
      throw new Error("Personal center data did not sync after regroup");
    }

    await verifyServiceCenter(
      userPage1,
      baseUrl,
      user1,
      orderInfo1.groupId,
      path.join(outputDir, `transport-flow-${slug(runId)}-u1-service-center-regrouped.png`)
    );
    await verifyServiceCenter(
      userPage2,
      baseUrl,
      user2,
      orderInfo1.groupId,
      path.join(outputDir, `transport-flow-${slug(runId)}-u2-service-center-regrouped.png`)
    );

    const updatedFlightDateTime = futureDateTimeLocal(31, 11, 20);
    const updatedPreferredTime = futureDateTimeLocal(31, 11, 35);
    const updatedRequest = await apiRequest(adminPage, `/api/transport-requests/${encodeURIComponent(dbRecord2.requestId)}`, {
      method: "PATCH",
      body: {
        flight_datetime: toIsoString(updatedFlightDateTime),
        preferred_time_start: toIsoString(updatedPreferredTime)
      }
    });

    const updatedUser2Request = await fetchMyRequestByOrder(userPage2, orderInfo2.orderNo);
    if (new Date(updatedUser2Request.flight_datetime).getTime() !== new Date(updatedRequest.flight_datetime).getTime()) {
      throw new Error("User personal center did not reflect updated request time");
    }

    const updatedGroupPreferredTime = futureDateTimeLocal(31, 11, 50);
    const updatedGroup = await apiRequest(adminPage, `/api/transport-groups/${encodeURIComponent(orderInfo1.groupId)}`, {
      method: "PATCH",
      body: {
        group_date: futureDate(31),
        preferred_time_start: toIsoString(updatedGroupPreferredTime)
      }
    });

    const publicBoard = await apiRequest(adminPage, `/api/public/transport-board?group_id=${encodeURIComponent(orderInfo1.groupId)}&page=1&limit=20`);
    const publicGroupItem = (publicBoard.items || []).find(item => item.group_id === orderInfo1.groupId);
    if (!publicGroupItem) {
      throw new Error("Public transport board does not include regrouped group");
    }
    if (new Date(publicGroupItem.preferred_time_start).getTime() !== new Date(updatedGroup.preferred_time_start).getTime()) {
      throw new Error("Public transport board did not reflect updated group preferred time");
    }
    if (Number(publicGroupItem.current_average_price_gbp || 0) !== regroupedPrice || Number(publicGroupItem.current_passenger_count || 0) !== 2) {
      throw new Error("Public transport board price/count did not stay in sync");
    }

    const updatedMaxPassengers = 4;
    const groupAfterCapacityUpdate = await apiRequest(adminPage, `/api/transport-groups/${encodeURIComponent(orderInfo1.groupId)}`, {
      method: "PATCH",
      body: {
        max_passengers: updatedMaxPassengers
      }
    });
    const boardAfterCapacityUpdate = await apiRequest(adminPage, `/api/public/transport-board?group_id=${encodeURIComponent(orderInfo1.groupId)}&page=1&limit=20`);
    const capacityItem = (boardAfterCapacityUpdate.items || []).find(item => item.group_id === orderInfo1.groupId);
    if (
      Number(groupAfterCapacityUpdate.max_passengers || groupAfterCapacityUpdate.summary?.max_passengers || 0) !== updatedMaxPassengers ||
      Number(capacityItem?.remaining_passenger_count || 0) !== updatedMaxPassengers - 2
    ) {
      throw new Error("Max passengers update did not sync to public board remaining seats");
    }

    await apiRequest(adminPage, `/api/transport-groups/${encodeURIComponent(orderInfo1.groupId)}/members`, {
      method: "POST",
      body: {
        request_ids: [dbRecord1.requestId]
      }
    });

    const groupAfterRemoval = await apiRequest(adminPage, `/api/transport-groups/${encodeURIComponent(orderInfo1.groupId)}`);
    if (Number(groupAfterRemoval.current_passenger_count || groupAfterRemoval.summary?.current_passenger_count || 0) !== 1) {
      throw new Error("Removing member did not reduce group passenger count to 1");
    }

    const requestAfterRemoval1 = await fetchMyRequestByOrder(userPage1, orderInfo1.orderNo);
    const requestAfterRemoval2 = await fetchMyRequestByOrder(userPage2, orderInfo2.orderNo);
    if (Number(requestAfterRemoval1.current_passenger_count || 0) !== 1) {
      throw new Error("User1 personal center did not reflect member removal");
    }
    if (String(requestAfterRemoval2.group_id || "") === String(orderInfo1.groupId)) {
      throw new Error("User2 still points to removed group after member removal");
    }

    const closedGroup = await apiRequest(adminPage, `/api/transport-groups/${encodeURIComponent(orderInfo1.groupId)}`, {
      method: "PATCH",
      body: {
        status: "closed",
        max_passengers: updatedMaxPassengers,
        group_date: futureDate(31),
        preferred_time_start: toIsoString(updatedGroupPreferredTime)
      }
    });
    const boardAfterClose = await apiRequest(adminPage, `/api/public/transport-board?group_id=${encodeURIComponent(orderInfo1.groupId)}&page=1&limit=20`);
    const closedBoardItem = (boardAfterClose.items || []).find(item => item.group_id === orderInfo1.groupId);
    if (String(closedGroup.status || "") !== "closed" || closedBoardItem) {
      throw new Error("Closed group is still visible on public board or did not close");
    }

    await verifyAdminSearchPages(adminPage, baseUrl, orderInfo1.orderNo, orderInfo1.groupId, `transport-flow-${slug(runId)}`, {
      requestStatus: "expired"
    });

    await userPage5.goto(new URL("/transport-board.html", baseUrl).toString(), {
      waitUntil: "domcontentloaded",
      timeout: 30000
    });
    const joinBoard = await apiRequest(userPage5, `/api/public/transport-board?group_id=${encodeURIComponent(orderInfo3.groupId)}&page=1&limit=20`);
    const joinTargetItem = (joinBoard.items || []).find(item => item.group_id === orderInfo3.groupId);
    if (!joinTargetItem) {
      throw new Error("Could not find join target on public board");
    }

    const joinPayload = await createJoinPayloadFromBoardItem(joinTargetItem, runId);
    const joinPreview = await apiRequest(userPage5, "/api/public/transport-join-preview", {
      method: "POST",
      body: joinPayload
    });
    if (!joinPreview?.evaluation?.joinable) {
      throw new Error(`Join preview unexpectedly rejected target group: ${joinPreview?.evaluation?.reason || "unknown"}`);
    }

    const joinSubmit = await apiRequest(userPage5, "/api/public/transport-join-submit", {
      method: "POST",
      body: joinPayload
    });
    if (String(joinSubmit.groupId || "") !== String(orderInfo3.groupId) || Number(joinSubmit.nextPassengerCount || 0) !== 2) {
      throw new Error("Join submit did not return expected target group or passenger count");
    }

    const joinedOrderInfo = {
      orderNo: joinSubmit.orderNo,
      groupId: joinSubmit.groupId
    };
    const dbRecord5 = await verifyDatabase(user5, joinedOrderInfo);
    const joinedRequest3 = await fetchMyRequestByOrder(userPage3, orderInfo3.orderNo);
    const joinedRequest5 = await fetchMyRequestByOrder(userPage5, joinedOrderInfo.orderNo);
    if (
      Number(joinedRequest3.current_passenger_count || 0) !== 2 ||
      Number(joinedRequest5.current_passenger_count || 0) !== 2 ||
      String(joinedRequest5.group_id || "") !== String(orderInfo3.groupId)
    ) {
      throw new Error("Front-end join flow did not sync to personal center");
    }

    await verifyServiceCenter(
      userPage5,
      baseUrl,
      user5,
      joinedOrderInfo.groupId,
      path.join(outputDir, `transport-flow-${slug(runId)}-u5-service-center-joined.png`)
    );

    const boardAfterJoin = await apiRequest(userPage5, `/api/public/transport-board?group_id=${encodeURIComponent(orderInfo3.groupId)}&page=1&limit=20`);
    const joinedBoardItem = (boardAfterJoin.items || []).find(item => item.group_id === orderInfo3.groupId);
    if (!joinedBoardItem || Number(joinedBoardItem.current_passenger_count || 0) !== 2) {
      throw new Error("Public board did not reflect joined passenger count");
    }

    await apiRequest(adminPage, `/api/transport-requests/${encodeURIComponent(dbRecord4.requestId)}`, {
      method: "DELETE"
    });
    await verifyRequestDeleted(dbRecord4.requestId);
    await verifyMyRequestAbsent(userPage4, orderInfo4.orderNo);
    await verifyAdminRequestAbsent(adminPage, baseUrl, orderInfo4.orderNo, `transport-flow-${slug(runId)}-u4`);

    await apiRequest(adminPage, `/api/transport-groups/${encodeURIComponent(orderInfo3.groupId)}`, {
      method: "DELETE"
    });
    await verifyGroupDeleted(orderInfo3.groupId);

    const regroupedAfterDelete3 = await fetchMyRequestByOrder(userPage3, orderInfo3.orderNo);
    const regroupedAfterDelete5 = await fetchMyRequestByOrder(userPage5, joinedOrderInfo.orderNo);
    if (
      String(regroupedAfterDelete3.group_id || "") === String(orderInfo3.groupId) ||
      String(regroupedAfterDelete5.group_id || "") === String(orderInfo3.groupId) ||
      String(regroupedAfterDelete3.group_id || "") === String(regroupedAfterDelete5.group_id || "") ||
      Number(regroupedAfterDelete3.current_passenger_count || 0) !== 1 ||
      Number(regroupedAfterDelete5.current_passenger_count || 0) !== 1
    ) {
      throw new Error("Deleting a group did not recreate separate single-member groups correctly");
    }

    const boardAfterDeleteGroup = await apiRequest(userPage5, `/api/public/transport-board?group_id=${encodeURIComponent(orderInfo3.groupId)}&page=1&limit=20`);
    if ((boardAfterDeleteGroup.items || []).some(item => item.group_id === orderInfo3.groupId)) {
      throw new Error("Deleted group is still visible on public board");
    }

    await verifyServiceCenter(
      userPage3,
      baseUrl,
      user3,
      regroupedAfterDelete3.group_id,
      path.join(outputDir, `transport-flow-${slug(runId)}-u3-service-center-regrouped.png`)
    );
    await verifyServiceCenter(
      userPage5,
      baseUrl,
      user5,
      regroupedAfterDelete5.group_id,
      path.join(outputDir, `transport-flow-${slug(runId)}-u5-service-center-regrouped.png`)
    );

    await adminContext.close();
    await userContext1.close();
    await userContext2.close();
    await userContext3.close();
    await userContext4.close();
    await userContext5.close();

    const summary = {
      ok: true,
      runId,
      baseUrl,
      users: [
        {
          id: user1.id,
          email: user1.email,
          nickname: user1.nickname,
          password: user1.password
        },
        {
          id: user2.id,
          email: user2.email,
          nickname: user2.nickname,
          password: user2.password
        },
        {
          id: user3.id,
          email: user3.email,
          nickname: user3.nickname,
          password: user3.password
        },
        {
          id: user4.id,
          email: user4.email,
          nickname: user4.nickname,
          password: user4.password
        },
        {
          id: user5.id,
          email: user5.email,
          nickname: user5.nickname,
          password: user5.password
        }
      ],
      orders: {
        user1: {
          orderNo: orderInfo1.orderNo,
          groupId: orderInfo1.groupId,
          requestId: dbRecord1.requestId,
          flightNo: dbRecord1.flightNo,
          destination: dbRecord1.locationTo
        },
        user2: {
          orderNo: orderInfo2.orderNo,
          initialGroupId: orderInfo2.groupId,
          finalGroupId: orderInfo1.groupId,
          requestId: dbRecord2.requestId,
          flightNo: dbRecord2.flightNo,
          destination: dbRecord2.locationTo
        },
        user3: {
          orderNo: orderInfo3.orderNo,
          initialGroupId: orderInfo3.groupId,
          regroupedAfterDeleteGroupId: regroupedAfterDelete3.group_id,
          requestId: dbRecord3.requestId,
          flightNo: dbRecord3.flightNo,
          destination: dbRecord3.locationTo
        },
        user4: {
          orderNo: orderInfo4.orderNo,
          deleted: true,
          requestId: dbRecord4.requestId,
          flightNo: dbRecord4.flightNo,
          destination: dbRecord4.locationTo
        },
        user5: {
          orderNo: joinedOrderInfo.orderNo,
          joinedGroupId: joinedOrderInfo.groupId,
          regroupedAfterDeleteGroupId: regroupedAfterDelete5.group_id,
          requestId: dbRecord5.requestId,
          flightNo: dbRecord5.flightNo,
          destination: dbRecord5.locationTo
        }
      },
      syncChecks: {
        initialPassengerCount: 1,
        regroupedPassengerCount: 2,
        regroupedAveragePriceGbp: regroupedPrice,
        updatedMaxPassengers,
        remainingSeatsAfterCapacityUpdate: updatedMaxPassengers - 2,
        passengerCountAfterRemoval: 1,
        updatedRequestFlightDatetime: updatedRequest.flight_datetime,
        updatedGroupPreferredTimeStart: updatedGroup.preferred_time_start,
        closedGroupStatus: closedGroup.status,
        joinPreviewAllowed: true,
        joinSubmitPassengerCount: Number(joinSubmit.nextPassengerCount || 0),
        joinedGroupPassengerCount: Number(joinedBoardItem.current_passenger_count || 0),
        deletedOrderRemovedFromPersonalCenter: true,
        deletedGroupRemovedFromPublicBoard: true,
        recreatedGroupPassengerCountUser3: Number(regroupedAfterDelete3.current_passenger_count || 0),
        recreatedGroupPassengerCountUser5: Number(regroupedAfterDelete5.current_passenger_count || 0)
      },
      screenshots: [
        path.join("output", "playwright", `transport-flow-${slug(runId)}-u1-form.png`),
        path.join("output", "playwright", `transport-flow-${slug(runId)}-u1-submit.png`),
        path.join("output", "playwright", `transport-flow-${slug(runId)}-u2-form.png`),
        path.join("output", "playwright", `transport-flow-${slug(runId)}-u2-submit.png`),
        path.join("output", "playwright", `transport-flow-${slug(runId)}-u3-form.png`),
        path.join("output", "playwright", `transport-flow-${slug(runId)}-u3-submit.png`),
        path.join("output", "playwright", `transport-flow-${slug(runId)}-u4-form.png`),
        path.join("output", "playwright", `transport-flow-${slug(runId)}-u4-submit.png`),
        path.join("output", "playwright", `transport-flow-${slug(runId)}-u1-service-center-initial.png`),
        path.join("output", "playwright", `transport-flow-${slug(runId)}-u2-service-center-initial.png`),
        path.join("output", "playwright", `transport-flow-${slug(runId)}-u3-service-center-initial.png`),
        path.join("output", "playwright", `transport-flow-${slug(runId)}-u4-service-center-initial.png`),
        path.join("output", "playwright", `transport-flow-${slug(runId)}-u1-service-center-regrouped.png`),
        path.join("output", "playwright", `transport-flow-${slug(runId)}-u2-service-center-regrouped.png`),
        path.join("output", "playwright", `transport-flow-${slug(runId)}-u5-service-center-joined.png`),
        path.join("output", "playwright", `transport-flow-${slug(runId)}-u3-service-center-regrouped.png`),
        path.join("output", "playwright", `transport-flow-${slug(runId)}-u5-service-center-regrouped.png`),
        path.join("output", "playwright", `transport-flow-${slug(runId)}-admin-requests.png`),
        path.join("output", "playwright", `transport-flow-${slug(runId)}-admin-groups.png`),
        path.join("output", "playwright", `transport-flow-${slug(runId)}-u4-admin-request-deleted.png`)
      ]
    };

    const outputPath = path.join(outputDir, `transport-flow-${slug(runId)}.json`);
    fs.writeFileSync(outputPath, JSON.stringify(summary, null, 2), "utf8");
    console.log(JSON.stringify(summary, null, 2));
  } finally {
    await browser.close();
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
