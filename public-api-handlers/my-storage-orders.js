const { getSupabaseAdmin } = require("../api/_lib/supabase");
const { ok, methodNotAllowed, serverError, unauthorized } = require("../api/_lib/http");
const { getAuthenticatedUser } = require("../api/_lib/user-auth");
const { ACTIVE_STORAGE_STATUSES } = require("../api/_lib/storage-orders");

function mapStorageOrderForPublic(item) {
  return {
    id: item.id,
    orderNo: item.order_no,
    orderType: item.order_type,
    status: item.status,
    serviceDate: item.service_date,
    serviceTimeSlot: item.service_time_slot || item.service_time || "",
    addressFull: item.address_full || "",
    roomOrBuilding: item.room_or_building || "",
    postcode: item.postcode || "",
    estimatedBoxCount: item.estimated_box_count || 0,
    expectedStorageEndDate: item.expected_storage_end_date || "",
    customerName: item.customer_name || "",
    studentEmail: item.student_email || "",
    phone: item.phone || "",
    contactHandle: item.wechat_id || "",
    publicUserId: item.public_user_id || "",
    createdAt: item.created_at
  };
}

function extractMissingStorageOrderColumn(error) {
  const message = `${error?.message || ""} ${error?.details || ""} ${error?.hint || ""}`;
  const match = message.match(/storage_orders\.([a-z0-9_]+)\s+does not exist/i)
    || message.match(/column\s+"?([a-z0-9_]+)"?\s+does not exist/i)
    || message.match(/'([a-z0-9_]+)' column of 'storage_orders'/i);
  return match?.[1] || "";
}

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    methodNotAllowed(res, ["GET"]);
    return;
  }

  try {
    const supabase = getSupabaseAdmin();
    const siteUser = await getAuthenticatedUser(req, supabase);
    if (!siteUser) {
      unauthorized(res, "请先登录后再查看寄存订单");
      return;
    }

    const scope = String((req.query && (req.query.scope || req.query.view)) || "").trim().toLowerCase();
    const includeAllOwnOrders = scope === "all" || scope === "user-center";
    let selectedColumns = [
      "id",
      "order_no",
      "order_type",
      "status",
      "service_date",
      "service_time",
      "service_time_slot",
      "address_full",
      "room_or_building",
      "postcode",
      "estimated_box_count",
      "expected_storage_end_date",
      "customer_name",
      "student_email",
      "phone",
      "wechat_id",
      "created_at"
    ];
    let data = null;
    let error = null;

    for (let attempt = 0; attempt < 12; attempt += 1) {
      let query = supabase
        .from("storage_orders")
        .select(selectedColumns.join(", "))
        .eq("site_user_id", siteUser.id)
        .order("created_at", { ascending: false })
        .limit(includeAllOwnOrders ? 50 : 20);

      if (!includeAllOwnOrders) {
        query = query
          .eq("order_type", "storage_collection")
          .in("status", ACTIVE_STORAGE_STATUSES);
      }

      const result = await query;
      data = result.data;
      error = result.error;
      if (!error) {
        break;
      }

      const missingColumn = extractMissingStorageOrderColumn(error);
      if (missingColumn === "site_user_id") {
        ok(res, []);
        return;
      }
      if (!missingColumn || !selectedColumns.includes(missingColumn)) {
        break;
      }
      selectedColumns = selectedColumns.filter(column => column !== missingColumn);
    }

    if (error) {
      throw error;
    }

    ok(res, (data || []).map(item => mapStorageOrderForPublic({
      ...item,
      public_user_id: siteUser.public_user_id || ""
    })));
  } catch (error) {
    serverError(res, error);
  }
};
