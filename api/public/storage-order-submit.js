const { getSupabaseAdmin } = require("../_lib/supabase");
const { badRequest, methodNotAllowed, parseJsonBody, serverError, sendJson } = require("../_lib/http");
const { enforceRateLimit } = require("../_lib/rate-limit");
const {
  mapStorageOrderPayload
} = require("../_lib/storage-orders");
const { allocateOrderNumber } = require("../_lib/order-numbers");
const { sendStorageOrderNotification } = require("../_lib/storage-order-notifier");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    methodNotAllowed(res, ["POST"]);
    return;
  }

  const rateLimit = enforceRateLimit(req, {
    keyPrefix: "storage-order-submit",
    limit: 5,
    windowMs: 10 * 60 * 1000
  });

  if (!rateLimit.allowed) {
    res.setHeader("Retry-After", String(rateLimit.retryAfterSeconds));
    sendJson(res, 429, {
      data: null,
      error: {
        message: "Too many requests, please try again later"
      }
    });
    return;
  }

  try {
    const supabase = getSupabaseAdmin();
    const body = await parseJsonBody(req);
    let payload;

    try {
      payload = mapStorageOrderPayload(body);
    } catch (error) {
      badRequest(res, error.message);
      return;
    }

    const orderIdentity = await allocateOrderNumber(supabase, "storage");
    const { data: insertedOrder, error: insertError } = await supabase
      .from("storage_orders")
      .insert({
        ...payload,
        order_no: orderIdentity.orderNo,
        order_type: orderIdentity.orderType,
        business_date: orderIdentity.businessDate
      })
      .select("*")
      .single();

    if (insertError) {
      throw insertError;
    }

    const notificationResult = await sendStorageOrderNotification(insertedOrder);
    const notificationPatch = notificationResult.ok
      ? {
          notification_status: "sent",
          notification_error: null,
          notification_sent_at: new Date().toISOString(),
          webhook_payload_json: notificationResult.payload || null
        }
      : {
          notification_status: "failed",
          notification_error: notificationResult.error || "Notification delivery failed",
          webhook_payload_json: notificationResult.payload || null
        };

    const { data: finalOrder, error: finalUpdateError } = await supabase
      .from("storage_orders")
      .update(notificationPatch)
      .eq("id", insertedOrder.id)
      .select("id, order_no, notification_status, notification_error, created_at")
      .single();

    if (finalUpdateError) {
      throw finalUpdateError;
    }

    sendJson(res, 201, {
      data: {
        id: finalOrder.id,
        orderNo: finalOrder.order_no,
        notificationStatus: finalOrder.notification_status,
        notificationError: finalOrder.notification_error,
        successTitle: finalOrder.notification_status === "sent"
          ? "已提交并已通知客服"
          : "已提交成功，但通知失败，进入人工确认队列",
        successDescription: finalOrder.notification_status === "sent"
          ? "客服将通过微信或电话联系确认"
          : "客服将稍后通过微信或电话联系确认"
      },
      error: null
    });
  } catch (error) {
    serverError(res, error);
  }
};
