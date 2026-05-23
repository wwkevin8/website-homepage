const { getSupabaseAdmin } = require("../_lib/supabase");
const { requireAdminUser } = require("../_lib/admin-auth");
const { ok, badRequest, parseJsonBody, methodNotAllowed, serverError } = require("../_lib/http");
const { mapRequestPayload, deriveRequestDisplayFlags, closeExpiredRequests, syncGroupStatus } = require("../_lib/transport");
const { removeRequestFromGroup, backfillMissingPickupGroups } = require("../_lib/transport-group-lifecycle");
const { logAdminOperation } = require("../_lib/orders");
const { releaseClaimOrderBinding } = require("../_lib/membership");

const AUDIT_FIELD_LABELS = {
  service_type: "服务类型",
  student_name: "姓名",
  email: "邮箱",
  phone: "手机号",
  wechat: "微信号",
  passenger_count: "登记人数",
  luggage_count: "行李数量",
  airport_code: "机场代码",
  airport_name: "机场名称",
  terminal: "航楼",
  flight_no: "航班号",
  flight_datetime: "出发/到达时间",
  location_from: "出发地",
  location_to: "目的地址",
  preferred_time_start: "接机/服务时间",
  preferred_time_end: "服务结束时间",
  shareable: "是否可拼车",
  status: "订单状态",
  notes: "备注",
  admin_note: "内部备注",
  offline_recorded: "是否已线下记录",
  closed_reason: "关闭原因",
  closed_at: "关闭时间"
};

const DATE_TIME_AUDIT_FIELDS = new Set([
  "flight_datetime",
  "preferred_time_start",
  "preferred_time_end",
  "closed_at"
]);

const SAFE_FIELD_LABELS = {
  student_name: "学生姓名",
  student_pinyin: "拼音",
  phone: "电话",
  wechat: "微信",
  contact_status: "联系状态",
  payment_collection_status: "收款状态",
  deposit_amount_gbp: "定金金额",
  admin_note: "客服备注"
};

const HIGH_RISK_SAFE_UPDATE_FIELDS = new Set([
  "airport_code",
  "airport_name",
  "terminal",
  "flight_no",
  "flight_datetime",
  "preferred_time_start",
  "preferred_time_end",
  "service_type",
  "passenger_count",
  "luggage_count",
  "shareable",
  "group_id",
  "group_ref",
  "transport_group_members"
]);

const CONTACT_STATUSES = new Set(["uncontacted", "contacted"]);
const PAYMENT_COLLECTION_STATUSES = new Set(["unpaid", "deposit_paid", "fully_paid"]);
const TIME_ADJUSTMENT_HANDLING_METHODS = new Set(["keep_group", "move_out"]);
const TIME_ADJUSTMENT_ALLOWED_FIELDS = new Set([
  "action",
  "flight_datetime",
  "preferred_time_start",
  "reason",
  "handling_method"
]);

function parsePaymentStatus(adminNote, structuredStatus) {
  const normalized = String(structuredStatus || "").trim().toLowerCase();
  if (["paid", "unpaid", "pending", "waived"].includes(normalized)) {
    return normalized === "paid" || normalized === "waived" ? "paid" : "unpaid";
  }
  const match = String(adminNote || "").match(/\[payment:(paid|unpaid)\]/i);
  return match ? match[1].toLowerCase() : "unpaid";
}

function isInvalidUuidError(error) {
  return Boolean(error?.message && error.message.includes("invalid input syntax for type uuid"));
}

function resolveAdminDisplayName(adminUser = {}) {
  return String(adminUser.name || adminUser.username || adminUser.email || "admin").trim() || "admin";
}

function normalizeAuditValue(field, value) {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  if (DATE_TIME_AUDIT_FIELDS.has(field)) {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toISOString();
  }
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    return value;
  }
  return String(value);
}

function buildChangedFields(existing = {}, payload = {}) {
  return Object.entries(AUDIT_FIELD_LABELS)
    .map(([field, label]) => {
      const beforeValue = normalizeAuditValue(field, existing[field]);
      const afterValue = normalizeAuditValue(field, payload[field]);
      return beforeValue === afterValue
        ? null
        : {
            field,
            label,
            before: beforeValue,
            after: afterValue
          };
    })
    .filter(Boolean);
}

function buildSafeChangedFields(existing = {}, payload = {}) {
  return Object.entries(SAFE_FIELD_LABELS)
    .filter(([field]) => Object.prototype.hasOwnProperty.call(payload, field))
    .map(([field, label]) => {
      const beforeValue = normalizeAuditValue(field, existing[field]);
      const afterValue = normalizeAuditValue(field, payload[field]);
      return beforeValue === afterValue
        ? null
        : {
            field,
            label,
            before: beforeValue,
            after: afterValue
          };
    })
    .filter(Boolean);
}

function normalizeSafeText(value, fallback = null) {
  if (value === undefined) {
    return fallback;
  }
  if (value === null) {
    return null;
  }
  const next = String(value).trim();
  return next ? next : null;
}

function normalizeSafeRequiredText(value, fallback, field) {
  const next = normalizeSafeText(value, fallback);
  if (!next) {
    throw new Error(`${field} is required`);
  }
  return next;
}

function normalizeSafeEnum(value, fallback, allowed, field) {
  const next = String(value === undefined ? fallback : value || "").trim();
  if (!allowed.has(next)) {
    throw new Error(`${field} is invalid`);
  }
  return next;
}

function normalizeDepositAmount(value, fallback) {
  if (value === undefined) {
    return fallback ?? null;
  }
  if (value === null || value === "") {
    return null;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error("deposit_amount_gbp is invalid");
  }
  return Math.round(parsed * 100) / 100;
}

function findBlockedSafeUpdateFields(body = {}) {
  return Object.keys(body).filter(field => HIGH_RISK_SAFE_UPDATE_FIELDS.has(field));
}

function mapSafeRequestPayload(body = {}, existing = {}) {
  return {
    student_name: normalizeSafeRequiredText(body.student_name, existing.student_name, "student_name"),
    student_pinyin: normalizeSafeText(body.student_pinyin, existing.student_pinyin),
    phone: normalizeSafeText(body.phone, existing.phone),
    wechat: normalizeSafeText(body.wechat, existing.wechat),
    contact_status: normalizeSafeEnum(body.contact_status, existing.contact_status || "uncontacted", CONTACT_STATUSES, "contact_status"),
    payment_collection_status: normalizeSafeEnum(body.payment_collection_status, existing.payment_collection_status || "unpaid", PAYMENT_COLLECTION_STATUSES, "payment_collection_status"),
    deposit_amount_gbp: normalizeDepositAmount(body.deposit_amount_gbp, existing.deposit_amount_gbp),
    admin_note: normalizeSafeText(body.admin_note, existing.admin_note)
  };
}

function findUnsupportedTimeAdjustmentFields(body = {}) {
  return Object.keys(body).filter(field => !TIME_ADJUSTMENT_ALLOWED_FIELDS.has(field));
}

function normalizeTimeAdjustmentReason(value) {
  const next = String(value || "").trim();
  if (!next) {
    throw new Error("adjustment reason is required");
  }
  return next;
}

function normalizeTimeAdjustmentDateTime(value, fallback, field) {
  const source = value === undefined || value === null || value === "" ? fallback : value;
  if (!source) {
    throw new Error(`${field} is required`);
  }
  const parsed = new Date(source);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`${field} is invalid`);
  }
  return parsed.toISOString();
}

function normalizeTimeAdjustmentPayload(body = {}, existing = {}) {
  const nextFlightDatetime = normalizeTimeAdjustmentDateTime(body.flight_datetime, existing.flight_datetime, "flight_datetime");
  return {
    flight_datetime: nextFlightDatetime,
    preferred_time_start: normalizeTimeAdjustmentDateTime(
      body.preferred_time_start,
      existing.preferred_time_start || nextFlightDatetime,
      "preferred_time_start"
    )
  };
}

function normalizeTimeAdjustmentHandling(value, isGrouped) {
  const next = String(value || "").trim();
  if (!isGrouped) {
    if (next && !TIME_ADJUSTMENT_HANDLING_METHODS.has(next) && next !== "direct") {
      throw new Error("handling_method is invalid");
    }
    return "direct";
  }
  if (!TIME_ADJUSTMENT_HANDLING_METHODS.has(next)) {
    throw new Error("handling_method is required for grouped requests");
  }
  return next;
}

function normalizeManualPaymentStatus(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return ["paid", "unpaid", "pending", "waived"].includes(normalized) ? normalized : null;
}

function replacePaymentMarker(adminNote, paymentStatus) {
  const compatibleStatus = paymentStatus === "paid" || paymentStatus === "waived" ? "paid" : "unpaid";
  const marker = `[payment:${compatibleStatus}]`;
  const text = String(adminNote || "").trim();
  if (/\[payment:(paid|unpaid)\]/i.test(text)) {
    return text.replace(/\[payment:(paid|unpaid)\]/i, marker);
  }
  return [marker, text].filter(Boolean).join(" ");
}

async function fetchRequestOperationLogs(supabase, requestId) {
  const { data, error } = await supabase
    .from("admin_operation_logs")
    .select("id, action, before_data, after_data, metadata, created_at, admin_user_id, admin_user:admin_users(id, name, username, email)")
    .eq("target_type", "transport_request")
    .eq("target_id", requestId)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    throw error;
  }

  return data || [];
}

async function getRequestWithContext(supabase, id) {
  let result = await supabase
    .from("transport_requests")
    .select("*, transport_group_members(*), site_users(email)")
    .eq("id", id)
    .limit(1);

  if (result.error && !isInvalidUuidError(result.error)) {
    throw result.error;
  }

  let data = result.error ? null : (Array.isArray(result.data) ? (result.data[0] || null) : (result.data || null));

  if (!data) {
    result = await supabase
      .from("transport_requests")
      .select("*, transport_group_members(*), site_users(email)")
      .eq("order_no", id)
      .limit(1);

    if (result.error) {
      throw result.error;
    }

    data = Array.isArray(result.data) ? (result.data[0] || null) : (result.data || null);
  }

  if (!data) {
    throw new Error("request not found");
  }

  return deriveRequestDisplayFlags(data);
}

async function getRequestDetailWithLogs(supabase, id) {
  const request = await getRequestWithContext(supabase, id);
  const operationLogs = await fetchRequestOperationLogs(supabase, request.id);
  return {
    ...request,
    operation_logs: operationLogs
  };
}

async function getExistingRequestRow(supabase, id) {
  let result = await supabase
    .from("transport_requests")
    .select("*")
    .eq("id", id)
    .limit(1);

  if (result.error && !isInvalidUuidError(result.error)) {
    throw result.error;
  }

  let data = result.error ? null : (Array.isArray(result.data) ? (result.data[0] || null) : (result.data || null));

  if (!data) {
    result = await supabase
      .from("transport_requests")
      .select("*")
      .eq("order_no", id)
      .limit(1);

    if (result.error) {
      throw result.error;
    }

    data = Array.isArray(result.data) ? (result.data[0] || null) : (result.data || null);
  }

  if (!data) {
    throw new Error("request not found");
  }

  return data;
}

async function getRequestGroupMemberships(supabase, requestId) {
  const { data, error } = await supabase
    .from("transport_group_members")
    .select("id, group_id, request_id, is_initiator")
    .eq("request_id", requestId);

  if (error) {
    throw error;
  }

  return Array.isArray(data) ? data : [];
}

module.exports = async function handler(req, res) {
  const supabase = getSupabaseAdmin();
  const adminUser = await requireAdminUser(req, res, supabase);
  if (!adminUser) {
    return;
  }

  const id = typeof req.query?.id === "string" ? req.query.id : "";

  try {
    if (req.method === "GET") {
      await backfillMissingPickupGroups(supabase);
      await closeExpiredRequests(supabase);
      ok(res, await getRequestDetailWithLogs(supabase, id));
      return;
    }

    if (req.method === "PATCH") {
      const body = await parseJsonBody(req);
      if (body.action === "update_safe_fields") {
        const existing = await getExistingRequestRow(supabase, id);
        const blockedFields = findBlockedSafeUpdateFields(body);
        if (blockedFields.length) {
          badRequest(res, `该字段涉及拼车逻辑，暂不可在客服工作台直接修改。Blocked fields: ${blockedFields.join(", ")}`);
          return;
        }

        let payload;
        try {
          payload = mapSafeRequestPayload(body, existing);
        } catch (error) {
          badRequest(res, error.message);
          return;
        }

        payload.last_operated_by = resolveAdminDisplayName(adminUser);
        payload.last_operated_at = new Date().toISOString();
        const changedFields = buildSafeChangedFields(existing, payload);

        const { error } = await supabase
          .from("transport_requests")
          .update(payload)
          .eq("id", existing.id);

        if (error) {
          throw error;
        }

        if (changedFields.length) {
          try {
            await logAdminOperation(supabase, {
              admin_user_id: adminUser.id || null,
              target_type: "transport_request",
              target_id: existing.id,
              action: "update_transport_request_safe_fields",
              before_data: changedFields.reduce((result, item) => {
                result[item.field] = item.before;
                return result;
              }, {}),
              after_data: changedFields.reduce((result, item) => {
                result[item.field] = item.after;
                return result;
              }, {}),
              metadata: {
                order_no: existing.order_no,
                admin_name: resolveAdminDisplayName(adminUser),
                changed_fields: changedFields
              }
            });
          } catch (logError) {
            console.warn("transport_request_safe_operation_log_failed", {
              request_id: existing.id,
              message: logError?.message || String(logError)
            });
          }
        }

        ok(res, await getRequestDetailWithLogs(supabase, id));
        return;
      }

      if (body.action === "adjust_flight_time") {
        const existing = await getExistingRequestRow(supabase, id);
        const unsupportedFields = findUnsupportedTimeAdjustmentFields(body);
        if (unsupportedFields.length) {
          badRequest(res, `time adjustment payload contains unsupported fields: ${unsupportedFields.join(", ")}`);
          return;
        }

        const memberships = await getRequestGroupMemberships(supabase, existing.id);
        const isGrouped = memberships.length > 0;

        let reason;
        let timePayload;
        let handlingMethod;
        try {
          reason = normalizeTimeAdjustmentReason(body.reason);
          timePayload = normalizeTimeAdjustmentPayload(body, existing);
          handlingMethod = normalizeTimeAdjustmentHandling(body.handling_method, isGrouped);
        } catch (error) {
          badRequest(res, error.message);
          return;
        }

        const operatedBy = resolveAdminDisplayName(adminUser);
        const operatedAt = new Date().toISOString();
        const payload = {
          ...timePayload,
          last_operated_by: operatedBy,
          last_operated_at: operatedAt
        };
        const beforeTimes = {
          flight_datetime: normalizeAuditValue("flight_datetime", existing.flight_datetime),
          preferred_time_start: normalizeAuditValue("preferred_time_start", existing.preferred_time_start),
          group_ids: memberships.map(member => member.group_id).filter(Boolean)
        };
        const afterTimes = {
          flight_datetime: normalizeAuditValue("flight_datetime", payload.flight_datetime),
          preferred_time_start: normalizeAuditValue("preferred_time_start", payload.preferred_time_start),
          handling_method: handlingMethod,
          reason
        };

        const { error: updateError } = await supabase
          .from("transport_requests")
          .update(payload)
          .eq("id", existing.id);

        if (updateError) {
          throw updateError;
        }

        let groupLifecycle = null;
        if (isGrouped && handlingMethod === "move_out") {
          try {
            groupLifecycle = await removeRequestFromGroup(supabase, existing.id, {
              regroup: true,
              closeRequest: false
            });
          } catch (removeError) {
            console.warn("transport_request_time_adjustment_group_remove_failed", {
              request_id: existing.id,
              message: removeError?.message || String(removeError)
            });
            try {
              await supabase
                .from("transport_requests")
                .update({
                  flight_datetime: existing.flight_datetime,
                  preferred_time_start: existing.preferred_time_start,
                  last_operated_by: existing.last_operated_by,
                  last_operated_at: existing.last_operated_at
                })
                .eq("id", existing.id);
            } catch (rollbackError) {
              console.warn("transport_request_time_adjustment_rollback_failed", {
                request_id: existing.id,
                message: rollbackError?.message || String(rollbackError)
              });
            }
            throw removeError;
          }
        }

        try {
          await logAdminOperation(supabase, {
            admin_user_id: adminUser.id || null,
            target_type: "transport_request",
            target_id: existing.id,
            action: "adjust_transport_request_time",
            before_data: beforeTimes,
            after_data: {
              ...afterTimes,
              new_group_id: groupLifecycle?.replacement_group?.group_id || null,
              group_lifecycle: groupLifecycle
            },
            metadata: {
              order_no: existing.order_no,
              admin_name: operatedBy,
              was_grouped: isGrouped,
              group_ids: beforeTimes.group_ids,
              new_group_id: groupLifecycle?.replacement_group?.group_id || null,
              handling_method: handlingMethod,
              reason
            }
          });
        } catch (logError) {
          console.warn("transport_request_time_adjustment_log_failed", {
            request_id: existing.id,
            message: logError?.message || String(logError)
          });
        }

        const detail = await getRequestDetailWithLogs(supabase, id);
        ok(res, {
          ...detail,
          group_lifecycle: groupLifecycle
        });
        return;
      }

      await backfillMissingPickupGroups(supabase);
      await closeExpiredRequests(supabase);
      const existing = await getExistingRequestRow(supabase, id);

      let payload;
      try {
        payload = mapRequestPayload(body, existing);
      } catch (error) {
        badRequest(res, error.message);
        return;
      }

      if (payload.status === "closed" && !payload.closed_at) {
        payload.closed_at = new Date().toISOString();
        payload.closed_reason = payload.closed_reason || "admin_closed";
      }
      if (payload.status !== "closed") {
        payload.closed_at = null;
        payload.closed_reason = null;
      }
      const manualPaymentStatus = normalizeManualPaymentStatus(body.manual_payment_status);
      if (manualPaymentStatus) {
        payload.manual_payment_status = manualPaymentStatus;
        payload.admin_note = replacePaymentMarker(payload.admin_note, manualPaymentStatus);
      }
      if (body.manual_price_gbp !== undefined && body.manual_price_gbp !== null && body.manual_price_gbp !== "") {
        const parsedPrice = Number(body.manual_price_gbp);
        if (!Number.isNaN(parsedPrice)) {
          payload.manual_price_gbp = Math.round(parsedPrice * 100) / 100;
        }
      }
      payload.last_operated_by = resolveAdminDisplayName(adminUser);
      payload.last_operated_at = new Date().toISOString();
      const changedFields = buildChangedFields(existing, payload);
      if (payload.manual_payment_status !== undefined && normalizeAuditValue("manual_payment_status", existing.manual_payment_status) !== normalizeAuditValue("manual_payment_status", payload.manual_payment_status)) {
        changedFields.push({
          field: "manual_payment_status",
          label: "结构化付款状态",
          before: normalizeAuditValue("manual_payment_status", existing.manual_payment_status),
          after: normalizeAuditValue("manual_payment_status", payload.manual_payment_status)
        });
      }
      if (payload.manual_price_gbp !== undefined && normalizeAuditValue("manual_price_gbp", existing.manual_price_gbp) !== normalizeAuditValue("manual_price_gbp", payload.manual_price_gbp)) {
        changedFields.push({
          field: "manual_price_gbp",
          label: "补录价格",
          before: normalizeAuditValue("manual_price_gbp", existing.manual_price_gbp),
          after: normalizeAuditValue("manual_price_gbp", payload.manual_price_gbp)
        });
      }

      const shouldClose = payload.status === "closed" && existing.status !== "closed";
      const wasPaid = parsePaymentStatus(existing.admin_note, existing.manual_payment_status) === "paid";
      const isPaid = parsePaymentStatus(payload.admin_note, payload.manual_payment_status) === "paid";
      const { error } = await supabase
        .from("transport_requests")
        .update(payload)
        .eq("id", existing.id);

      if (error) {
        throw error;
      }

      if (changedFields.length) {
        try {
          await logAdminOperation(supabase, {
            admin_user_id: adminUser.id || null,
            target_type: "transport_request",
            target_id: existing.id,
            action: "update_transport_request",
            before_data: changedFields.reduce((result, item) => {
              result[item.field] = item.before;
              return result;
            }, {}),
            after_data: changedFields.reduce((result, item) => {
              result[item.field] = item.after;
              return result;
            }, {}),
            metadata: {
              order_no: existing.order_no,
              admin_name: resolveAdminDisplayName(adminUser),
              changed_fields: changedFields
            }
          });
        } catch (logError) {
          console.warn("transport_request_operation_log_failed", {
            request_id: existing.id,
            message: logError?.message || String(logError)
          });
        }
      }

      if (shouldClose) {
        await removeRequestFromGroup(supabase, id);
      }

      let updatedRequest = await getRequestDetailWithLogs(supabase, id);
      if (!shouldClose && updatedRequest?.group_ref) {
        await syncGroupStatus(supabase, updatedRequest.group_ref);
        updatedRequest = await getRequestDetailWithLogs(supabase, id);
      }

      let paymentEmail = null;
      if (!wasPaid && isPaid) {
        try {
          const { sendTransportPaymentConfirmationEmail } = require("../_lib/transport-payment-email");
          paymentEmail = await sendTransportPaymentConfirmationEmail(supabase, updatedRequest);
        } catch (emailError) {
          paymentEmail = {
            skipped: false,
            error: emailError && emailError.message ? emailError.message : "Failed to send payment confirmation email"
          };
        }
      }

      ok(res, {
        ...updatedRequest,
        payment_email: paymentEmail
      });
      return;
    }

    if (req.method === "DELETE") {
      await backfillMissingPickupGroups(supabase);
      await closeExpiredRequests(supabase);
      const existing = await getExistingRequestRow(supabase, id);
      const groupLifecycle = await removeRequestFromGroup(supabase, existing.id, {
        regroup: false
      });

      const { error } = await supabase
        .from("transport_requests")
        .delete()
        .eq("id", existing.id);

      if (error) {
        throw error;
      }

      const releasedMembershipClaim = await releaseClaimOrderBinding(supabase, {
        claim_id: existing.membership_benefit_claim_id,
        order_table: "transport_requests",
        order_id: existing.id,
        order_no: existing.order_no,
        admin_user_id: adminUser.id || null,
        reason: "transport_request_deleted"
      });

      ok(res, {
        ...existing,
        group_lifecycle: groupLifecycle,
        released_membership_claim: releasedMembershipClaim
      });
      return;
    }

    methodNotAllowed(res, ["GET", "PATCH", "DELETE"]);
  } catch (error) {
    serverError(res, error);
  }
};
