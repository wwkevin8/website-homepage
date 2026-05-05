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
    phone: item.phone || "",
    contactHandle: item.wechat_id || "",
    createdAt: item.created_at
  };
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

    const { data, error } = await supabase
      .from("storage_orders")
      .select("id, order_no, order_type, status, service_date, service_time, service_time_slot, address_full, room_or_building, postcode, estimated_box_count, expected_storage_end_date, customer_name, phone, wechat_id, created_at")
      .eq("site_user_id", siteUser.id)
      .eq("order_type", "storage_collection")
      .in("status", ACTIVE_STORAGE_STATUSES)
      .order("created_at", { ascending: false })
      .limit(20);

    if (error) {
      throw error;
    }

    ok(res, (data || []).map(mapStorageOrderForPublic));
  } catch (error) {
    serverError(res, error);
  }
};
