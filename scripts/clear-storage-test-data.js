const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

const root = path.resolve(__dirname, "..");
const TEST_ORDER_PREFIX = "TEST-ST";
const TEST_NAME_PREFIX = "测试-";
const TEST_NOTE_MARKER = "本地测试数据";

function loadEnvFile() {
  const envPath = path.join(root, ".env");
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIndex = trimmed.indexOf("=");
    if (eqIndex <= 0) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    let value = trimmed.slice(eqIndex + 1).trim();
    if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

function assertLocalSupabaseUrl(url) {
  const text = String(url || "").trim();
  if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\b/.test(text)) {
    throw new Error(`Refusing to modify non-local Supabase URL: ${text || "(empty)"}`);
  }
  return text;
}

function getLocalSupabaseAdmin() {
  loadEnvFile();
  const url = assertLocalSupabaseUrl(process.env.LOCAL_SUPABASE_URL);
  const key = String(process.env.LOCAL_SUPABASE_SERVICE_ROLE_KEY || "").trim();
  if (!key) {
    throw new Error("Missing LOCAL_SUPABASE_SERVICE_ROLE_KEY");
  }
  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });
}

function isTestStorageOrder(row = {}) {
  const orderNo = String(row.order_no || "");
  const customerName = String(row.customer_name || "");
  const formJson = row.customer_form_json && typeof row.customer_form_json === "object" ? row.customer_form_json : {};
  const serviceNotes = String(formJson.admin?.service_notes || "");
  return orderNo.startsWith(TEST_ORDER_PREFIX)
    || customerName.startsWith(TEST_NAME_PREFIX)
    || serviceNotes.includes(TEST_NOTE_MARKER);
}

async function clearStorageTestData(supabase = getLocalSupabaseAdmin()) {
  const { data, error } = await supabase
    .from("storage_orders")
    .select("id, order_no, customer_name, customer_form_json")
    .limit(5000);
  if (error) throw error;

  const testRows = (data || []).filter(isTestStorageOrder);
  const ids = testRows.map(row => row.id).filter(Boolean);
  if (!ids.length) {
    return { deleted: 0, orderNos: [] };
  }

  await supabase.from("admin_operation_logs").delete().in("target_id", ids);
  await supabase.from("orders").delete().eq("source_table", "storage_orders").in("source_id", ids);
  const { error: deleteError } = await supabase.from("storage_orders").delete().in("id", ids);
  if (deleteError) throw deleteError;

  return {
    deleted: ids.length,
    orderNos: testRows.map(row => row.order_no).filter(Boolean)
  };
}

async function main() {
  const result = await clearStorageTestData();
  console.log(`[storage-test-clear] deleted ${result.deleted} local test storage order(s).`);
  if (result.orderNos.length) {
    console.log(result.orderNos.join("\n"));
  }
}

if (require.main === module) {
  main().catch(error => {
    console.error("[storage-test-clear] failed:", error.message);
    process.exit(1);
  });
}

module.exports = {
  clearStorageTestData,
  getLocalSupabaseAdmin,
  assertLocalSupabaseUrl,
  TEST_ORDER_PREFIX,
  TEST_NAME_PREFIX,
  TEST_NOTE_MARKER
};
