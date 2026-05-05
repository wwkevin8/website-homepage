const { getSupabaseAdmin } = require("../api/_lib/supabase");
const {
  badRequest,
  methodNotAllowed,
  parseJsonBody,
  serverError,
  sendJson,
  unauthorized
} = require("../api/_lib/http");
const { enforceRateLimit } = require("../api/_lib/rate-limit");
const { ACTIVE_STORAGE_STATUSES, mapStorageOrderPayload } = require("../api/_lib/storage-orders");
const { allocateStorageServiceOrderNumber } = require("../api/_lib/order-numbers");
const {
  sendStorageOrderNotification,
  sendStorageStudentConfirmationEmail
} = require("../api/_lib/storage-order-notifier");
const { getAuthenticatedUser } = require("../api/_lib/user-auth");
const { getProfileCompletionState } = require("../api/_lib/user-profile");

async function findDuplicateStorageOrder(supabase, payload, siteUserId) {
  if (!siteUserId || !payload || !payload.order_type) {
    return null;
  }

  let query = supabase
    .from("storage_orders")
    .select("id, order_no, order_type, service_date, related_order_no, status")
    .eq("site_user_id", siteUserId)
    .eq("order_type", payload.order_type)
    .in("status", ACTIVE_STORAGE_STATUSES)
    .limit(1);

  if (payload.order_type === "storage_return" && payload.related_order_no) {
    query = query.eq("related_order_no", payload.related_order_no);
  } else {
    query = query
      .eq("service_date", payload.service_date)
      .eq("address_key", payload.address_key);
  }

  const { data, error } = await query.maybeSingle();
  if (error) {
    throw error;
  }
  return data || null;
}

async function countActiveStorageOrders(supabase, siteUserId) {
  const { count, error } = await supabase
    .from("storage_orders")
    .select("id", { count: "exact", head: true })
    .eq("site_user_id", siteUserId)
    .in("order_type", ["storage_collection", "storage_return"])
    .in("status", ACTIVE_STORAGE_STATUSES);

  if (error) {
    throw error;
  }
  return count || 0;
}

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
    const siteUser = await getAuthenticatedUser(req, supabase);

    if (!siteUser) {
      unauthorized(res, "请先登录后再提交预约");
      return;
    }

    const profileState = getProfileCompletionState(siteUser);
    if (!profileState.isComplete) {
      badRequest(res, `资料未完善，请先补全${profileState.missingFields.join("、")}`);
      return;
    }

    const body = await parseJsonBody(req);
    let payload;

    try {
      payload = mapStorageOrderPayload(body);
    } catch (error) {
      badRequest(res, error.message);
      return;
    }

    if (payload.order_type !== "box_delivery") {
      const activeStorageOrderCount = await countActiveStorageOrders(supabase, siteUser.id);
      if (activeStorageOrderCount >= 2) {
        badRequest(res, "当前账号已有 2 个待确认或已确认的有效寄存服务单，请先联系客服确认后再提交新的寄存预约。");
        return;
      }
    }

    const duplicateOrder = await findDuplicateStorageOrder(supabase, payload, siteUser.id);
    if (duplicateOrder) {
      badRequest(
        res,
        payload.order_type === "storage_return" && payload.related_order_no
          ? `当前账号已有同一原寄存订单号的待确认或已确认送回/取回预约：${duplicateOrder.order_no}`
          : `当前账号已有同一服务日期和地址的待确认或已确认寄存服务单：${duplicateOrder.order_no}`
      );
      return;
    }

    const orderIdentity = await allocateStorageServiceOrderNumber(supabase, payload.order_type);
    const { data: insertedOrder, error: insertError } = await supabase
      .from("storage_orders")
      .insert({
        ...payload,
        site_user_id: siteUser.id,
        student_email: siteUser.email || null,
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
    const studentEmailResult = await sendStorageStudentConfirmationEmail(req, {
      orderRecord: insertedOrder,
      recipientEmail: siteUser.email
    });

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
    const studentEmailPatch = studentEmailResult.ok
      ? {
          student_email_status: studentEmailResult.skipped ? "skipped" : "sent",
          student_email_error: null,
          student_email_sent_at: studentEmailResult.skipped ? null : new Date().toISOString()
        }
      : {
          student_email_status: "failed",
          student_email_error: studentEmailResult.error || "Student confirmation email failed"
        };

    const { data: finalOrder, error: finalUpdateError } = await supabase
      .from("storage_orders")
      .update({
        ...notificationPatch,
        ...studentEmailPatch
      })
      .eq("id", insertedOrder.id)
      .select("id, order_no, order_type, notification_status, notification_error, student_email_status, student_email_error, created_at")
      .single();

    if (finalUpdateError) {
      throw finalUpdateError;
    }

    const deliveryOk = finalOrder.notification_status === "sent" && ["sent", "skipped"].includes(finalOrder.student_email_status);

    sendJson(res, 201, {
      data: {
        id: finalOrder.id,
        orderNo: finalOrder.order_no,
        orderType: finalOrder.order_type,
        notificationStatus: finalOrder.notification_status,
        notificationError: finalOrder.notification_error,
        studentEmailStatus: finalOrder.student_email_status,
        studentEmailError: finalOrder.student_email_error,
        successTitle: deliveryOk
          ? "订单已提交，等待客服确认"
          : "订单已提交，通知可能暂未送达",
        successDescription: deliveryOk
          ? "订单已提交，需等待客服人工确认后才算正式安排。确认邮件会发送到你的账号邮箱。"
          : "订单已保存，但客服通知或确认邮件可能发送失败。请保存订单编号并联系客服确认。"
      },
      error: null
    });
  } catch (error) {
    serverError(res, error);
  }
};
