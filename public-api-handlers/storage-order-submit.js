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
  bindClaimToOrder,
  calculateMembershipDiscount,
  getActiveClaim,
  getCurrentMembershipCycle
} = require("../api/_lib/membership");
const {
  sendStorageStudentConfirmationEmail
} = require("../api/_lib/storage-order-notifier");
const { getAuthenticatedUser } = require("../api/_lib/user-auth");
const { getProfileCompletionState } = require("../api/_lib/user-profile");

const OPTIONAL_STORAGE_ORDER_COLUMNS = [
  "site_user_id",
  "student_email",
  "business_date",
  "address_key",
  "related_order_no",
  "postcode",
  "room_or_building",
  "storage_start_date",
  "expected_storage_end_date",
  "has_lift",
  "needs_upstairs",
  "item_description",
  "service_time_slot",
  "parent_order_no",
  "box_order_no",
  "storage_pickup_order_no",
  "box_delivery_date",
  "box_delivery_time_slot",
  "box_delivery_method",
  "purchased_boxes",
  "storage_intake_date",
  "storage_end_date",
  "need_moving_help",
  "estimated_total_price",
  "estimate_summary_json",
  "customer_form_json",
  "calculator_snapshot_json",
  "service_flags_json",
  "notification_status",
  "notification_error",
  "notification_sent_at",
  "webhook_payload_json",
  "student_email_status",
  "student_email_error",
  "student_email_sent_at",
  "membership_benefit_claim_id",
  "membership_discount_amount",
  "extra_charge_amount",
  "final_price",
  "membership_discount_breakdown_json"
];

async function getStorageOrderColumnSupport(supabase) {
  const entries = await Promise.all(OPTIONAL_STORAGE_ORDER_COLUMNS.map(async column => {
    const { error } = await supabase
      .from("storage_orders")
      .select(column, { head: true })
      .limit(1);
    return [column, !error];
  }));
  return Object.fromEntries(entries);
}

function omitUnsupportedStorageOrderColumns(payload, columnSupport = {}) {
  return Object.fromEntries(
    Object.entries(payload).filter(([key]) => columnSupport[key] !== false)
  );
}

function getStorageDuplicateLimitLabel(orderType) {
  if (orderType === "storage_collection") {
    return "预约寄存订单";
  }
  if (orderType === "storage_return") {
    return "取寄存订单";
  }
  return "寄存服务订单";
}

async function findRecentStorageServiceOrder(supabase, siteUserId, orderType, columnSupport) {
  if (!siteUserId) {
    return null;
  }
  if (!["storage_collection", "storage_return"].includes(orderType)) {
    return null;
  }
  if (columnSupport?.site_user_id === false) {
    return null;
  }

  const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from("storage_orders")
    .select("id, order_no, order_type, service_date, status, created_at")
    .eq("site_user_id", siteUserId)
    .eq("order_type", orderType)
    .in("status", ACTIVE_STORAGE_STATUSES)
    .gte("created_at", oneWeekAgo)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    if (isMissingStorageOrderColumn(error, ["site_user_id"])) {
      return null;
    }
    throw error;
  }
  return data || null;
}

async function countActiveStorageOrders(supabase, siteUserId, columnSupport) {
  if (columnSupport?.site_user_id === false) {
    return 0;
  }

  const { count, error } = await supabase
    .from("storage_orders")
    .select("id", { count: "exact", head: true })
    .eq("site_user_id", siteUserId)
    .in("order_type", ["storage_collection", "storage_return"])
    .in("status", ACTIVE_STORAGE_STATUSES);

  if (error) {
    if (isMissingStorageOrderColumn(error, ["site_user_id"])) {
      return 0;
    }
    throw error;
  }
  return count || 0;
}

async function buildStorageReturnHistoryCheck(supabase, payload, siteUserId, columnSupport) {
  if (payload.order_type !== "storage_return" || !siteUserId) {
    return null;
  }
  if (columnSupport?.site_user_id === false) {
    return {
      matched: false,
      matched_order_no: null,
      matched_order_nos: [],
      checked_at: new Date().toISOString(),
      skipped_reason: "missing_storage_orders_column:site_user_id"
    };
  }

  let query = supabase
    .from("storage_orders")
    .select("id, order_no, service_date, status, created_at")
    .eq("site_user_id", siteUserId)
    .eq("order_type", "storage_collection")
    .in("status", ACTIVE_STORAGE_STATUSES)
    .order("created_at", { ascending: false })
    .limit(10);

  if (payload.related_order_no) {
    query = query.eq("order_no", payload.related_order_no);
  }

  const { data, error } = await query;
  if (error) {
    if (isMissingStorageOrderColumn(error, ["site_user_id", "related_order_no"])) {
      return {
        matched: false,
        matched_order_no: null,
        matched_order_nos: [],
        checked_at: new Date().toISOString(),
        skipped_reason: `missing_storage_orders_column:${getMissingStorageOrderColumn(error)}`
      };
    }
    throw error;
  }

  const matchedOrders = data || [];
  return {
    matched: matchedOrders.length > 0,
    matched_order_no: matchedOrders[0]?.order_no || null,
    matched_order_nos: matchedOrders.map(item => item.order_no).filter(Boolean),
    checked_at: new Date().toISOString()
  };
}

function getMissingStorageOrderColumn(error) {
  const message = `${error?.message || ""} ${error?.details || ""} ${error?.hint || ""}`;
  const schemaCacheMatch = message.match(/'([a-z0-9_]+)' column of 'storage_orders'/i);
  if (schemaCacheMatch) {
    return schemaCacheMatch[1];
  }
  const schemaCacheFindMatch = message.match(/Could not find the '([a-z0-9_]+)' column of 'storage_orders'/i);
  if (schemaCacheFindMatch) {
    return schemaCacheFindMatch[1];
  }
  const relationMatch = message.match(/storage_orders\.([a-z0-9_]+)\s+does not exist/i);
  if (relationMatch) {
    return relationMatch[1];
  }
  const columnMatch = message.match(/column\s+"?([a-z0-9_]+)"?\s+does not exist/i);
  return columnMatch ? columnMatch[1] : "";
}

function isMissingStorageOrderColumn(error, columnNames) {
  const missingColumn = getMissingStorageOrderColumn(error);
  return Array.isArray(columnNames) && columnNames.includes(missingColumn);
}

function isStorageOrderTypeConstraintError(error) {
  const message = `${error?.message || ""} ${error?.details || ""} ${error?.hint || ""}`;
  return error?.code === "23514"
    && (
      error?.constraint === "storage_orders_order_type_check"
      || message.includes("storage_orders_order_type_check")
    );
}

function formatStorageSubOrderNo(prefix, orderIdentity) {
  const businessDateCode = String(orderIdentity?.businessDate || "").replace(/-/g, "").slice(2);
  const sequence = Number(orderIdentity?.sequence || 0);
  if (!prefix || !businessDateCode || !sequence) {
    return null;
  }
  return `${prefix}-${businessDateCode}-${String(sequence).padStart(4, "0")}`;
}

async function insertStorageOrderWithCompatibility(supabase, insertPayload, columnSupport) {
  let currentPayload = omitUnsupportedStorageOrderColumns({ ...insertPayload }, columnSupport);
  const removedColumns = [];
  let usedLegacyOrderType = false;

  for (let attempt = 0; attempt < 40; attempt += 1) {
    const { data, error } = await supabase
      .from("storage_orders")
      .insert(currentPayload)
      .select("*")
      .single();

    if (!error) {
      return { data, removedColumns, usedLegacyOrderType };
    }

    if (isStorageOrderTypeConstraintError(error) && currentPayload.order_type !== "storage") {
      currentPayload = omitUnsupportedStorageOrderColumns({
        ...currentPayload,
        order_type: "storage",
        customer_form_json: {
          ...(currentPayload.customer_form_json || {}),
          originalOrderType: insertPayload.order_type,
          schemaCompatibilityFallback: "storage_orders_order_type_check"
        },
        service_flags_json: {
          ...(currentPayload.service_flags_json || {}),
          [insertPayload.order_type]: true,
          legacy_order_type_fallback: true
        }
      }, columnSupport);
      usedLegacyOrderType = true;
      continue;
    }

    const missingColumn = getMissingStorageOrderColumn(error);
    if (!missingColumn || !Object.prototype.hasOwnProperty.call(currentPayload, missingColumn)) {
      throw error;
    }

    delete currentPayload[missingColumn];
    removedColumns.push(missingColumn);
  }

  throw new Error(`storage_orders schema compatibility retry limit exceeded after removing: ${removedColumns.join(", ") || "none"}`);
}

async function updateStorageOrderNotificationWithCompatibility(supabase, orderId, patch, columnSupport) {
  let currentPatch = omitUnsupportedStorageOrderColumns({ ...patch }, columnSupport);
  const removedColumns = [];

  if (Object.keys(currentPatch).length === 0) {
    return { data: null, removedColumns };
  }

  for (let attempt = 0; attempt < 25; attempt += 1) {
    const { data, error } = await supabase
      .from("storage_orders")
      .update(currentPatch)
      .eq("id", orderId)
      .select("*")
      .single();

    if (!error) {
      return { data, removedColumns };
    }

    const missingColumn = getMissingStorageOrderColumn(error);
    if (!missingColumn || !Object.prototype.hasOwnProperty.call(currentPatch, missingColumn)) {
      throw error;
    }

    delete currentPatch[missingColumn];
    removedColumns.push(missingColumn);
  }

  throw new Error(`storage_orders notification compatibility retry limit exceeded after removing: ${removedColumns.join(", ") || "none"}`);
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

    const storageOrderColumnSupport = await getStorageOrderColumnSupport(supabase);

    if (payload.order_type !== "box_delivery") {
      const activeStorageOrderCount = await countActiveStorageOrders(supabase, siteUser.id, storageOrderColumnSupport);
      if (activeStorageOrderCount >= 2) {
        badRequest(res, "当前账号已有 2 个待确认或已确认的有效寄存服务单，请先联系客服确认后再提交新的寄存预约。");
        return;
      }
    }

    const storageReturnHistoryCheck = await buildStorageReturnHistoryCheck(supabase, payload, siteUser.id, storageOrderColumnSupport);
    if (storageReturnHistoryCheck) {
      payload.customer_form_json = {
        ...(payload.customer_form_json || {}),
        storage_return_history_check: storageReturnHistoryCheck
      };
    }

    payload.customer_form_json = {
      ...(payload.customer_form_json || {}),
      publicUserId: siteUser.public_user_id || null,
      userSnapshot: {
        siteUserId: siteUser.id,
        publicUserId: siteUser.public_user_id || null,
        email: siteUser.email || null,
        name: siteUser.nickname || null,
        phone: siteUser.phone || null,
        contactPreference: siteUser.contact_preference || null,
        wechatId: siteUser.wechat_id || null,
        whatsappContact: siteUser.whatsapp_contact || null
      }
    };

    const duplicateOrder = payload.order_type === "box_delivery"
      ? null
      : await findRecentStorageServiceOrder(supabase, siteUser.id, payload.order_type, storageOrderColumnSupport);
    if (duplicateOrder) {
      const duplicateLimitLabel = getStorageDuplicateLimitLabel(payload.order_type);
      badRequest(
        res,
        `当前账号一周内只能提交一次${duplicateLimitLabel}。如需更改请联系客服。已有订单：${duplicateOrder.order_no}`
      );
      return;
    }

    const orderIdentity = await allocateStorageServiceOrderNumber(supabase, payload.order_type);
    if (payload.order_type === "storage_collection") {
      payload.parent_order_no = orderIdentity.orderNo;
      payload.storage_pickup_order_no = formatStorageSubOrderNo("ST-P", orderIdentity);
      const purchasedBoxes = Array.isArray(payload.purchased_boxes) ? payload.purchased_boxes : [];
      const purchasedQuantity = purchasedBoxes.reduce((sum, item) => sum + Math.max(0, Number(item?.quantity || 0)), 0);
      if (purchasedQuantity > 0) {
        payload.box_order_no = formatStorageSubOrderNo("ST-B", orderIdentity);
      }
    }

    const membershipClaim = payload.order_type === "storage_collection"
      ? await getActiveClaim(supabase, siteUser.id, getCurrentMembershipCycle())
      : null;
    const membershipDiscount = membershipClaim?.benefit_type === "storage" && ["selected", "reserved"].includes(membershipClaim.status)
      ? calculateMembershipDiscount(payload, membershipClaim)
      : null;
    const membershipPatch = membershipDiscount?.eligible
      ? {
          membership_benefit_claim_id: membershipClaim.id,
          membership_discount_amount: membershipDiscount.membershipDiscountAmount,
          extra_charge_amount: membershipDiscount.extraChargeAmount,
          final_price: membershipDiscount.finalPrice,
          membership_discount_breakdown_json: membershipDiscount.breakdown
        }
      : {};

    const insertResult = await insertStorageOrderWithCompatibility(supabase, {
      ...payload,
      ...membershipPatch,
      site_user_id: siteUser.id,
      student_email: siteUser.email || null,
      order_no: orderIdentity.orderNo,
      order_type: orderIdentity.orderType,
      business_date: orderIdentity.businessDate
    }, storageOrderColumnSupport);
    const insertedOrder = insertResult.data;

    let boundMembershipClaim = null;
    if (membershipDiscount?.eligible && membershipClaim?.id) {
      try {
        boundMembershipClaim = await bindClaimToOrder(
          supabase,
          membershipClaim.id,
          "storage_orders",
          insertedOrder.id,
          insertedOrder.order_no,
          membershipDiscount
        );
      } catch (bindError) {
        try {
          await supabase.from("storage_orders").delete().eq("id", insertedOrder.id);
        } catch (cleanupError) {
          console.warn("[membership] failed to cleanup storage order after claim bind conflict", cleanupError);
        }
        badRequest(res, bindError.message || "Membership benefit is no longer available for this order");
        return;
      }
    }

    const studentEmailResult = await sendStorageStudentConfirmationEmail(req, {
      orderRecord: insertedOrder,
      recipientEmail: siteUser.email
    });

    const notificationPatch = {
      notification_status: "skipped",
      notification_error: "Customer service notification disabled",
      webhook_payload_json: null
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

    const finalUpdateResult = await updateStorageOrderNotificationWithCompatibility(supabase, insertedOrder.id, {
      ...notificationPatch,
      ...studentEmailPatch
    }, storageOrderColumnSupport).catch(error => ({
      data: {
        ...insertedOrder,
        notification_status: notificationPatch.notification_status,
        notification_error: notificationPatch.notification_error || error?.message || null,
        student_email_status: studentEmailPatch.student_email_status,
        student_email_error: studentEmailPatch.student_email_error || null
      },
      removedColumns: []
    }));
    const finalOrder = finalUpdateResult.data || {
      ...insertedOrder,
      notification_status: notificationPatch.notification_status,
      notification_error: notificationPatch.notification_error || null,
      student_email_status: studentEmailPatch.student_email_status,
      student_email_error: studentEmailPatch.student_email_error || null
    };

    const finalNotificationStatus = finalOrder.notification_status || notificationPatch.notification_status || "skipped";
    const finalStudentEmailStatus = finalOrder.student_email_status || studentEmailPatch.student_email_status || "skipped";
    const studentEmailOk = ["sent", "skipped"].includes(finalStudentEmailStatus);

    sendJson(res, 201, {
      data: {
        id: finalOrder.id,
        orderNo: finalOrder.order_no,
        parentOrderNo: finalOrder.parent_order_no || payload.parent_order_no || null,
        boxOrderNo: finalOrder.box_order_no || payload.box_order_no || null,
        storagePickupOrderNo: finalOrder.storage_pickup_order_no || payload.storage_pickup_order_no || null,
        orderType: payload.order_type,
        membershipBenefitClaimId: boundMembershipClaim?.id || null,
        membershipDiscountAmount: membershipDiscount?.membershipDiscountAmount || 0,
        extraChargeAmount: membershipDiscount?.extraChargeAmount || 0,
        finalPrice: membershipDiscount?.finalPrice ?? null,
        notificationStatus: finalNotificationStatus,
        notificationError: finalOrder.notification_error || notificationPatch.notification_error || null,
        studentEmailStatus: finalStudentEmailStatus,
        studentEmailError: finalOrder.student_email_error || studentEmailPatch.student_email_error || null,
        successTitle: "订单已提交，请联系客服确认",
        successDescription: studentEmailOk
          ? "系统已生成订单编号，并会向你的账号邮箱发送确认邮件。此订单必须联系人工客服确认后才算正式安排。"
          : "系统已生成订单编号，但确认邮件可能发送失败。请保存订单编号，并必须联系人工客服确认后才算正式安排。"
      },
      error: null
    });
  } catch (error) {
    serverError(res, error);
  }
};
