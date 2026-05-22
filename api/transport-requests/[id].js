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

module.exports = async function handler(req, res) {
  const supabase = getSupabaseAdmin();
  const adminUser = await requireAdminUser(req, res, supabase);
  if (!adminUser) {
    return;
  }

  const id = typeof req.query?.id === "string" ? req.query.id : "";

  try {
    await backfillMissingPickupGroups(supabase);
    await closeExpiredRequests(supabase);

    if (req.method === "GET") {
      ok(res, await getRequestDetailWithLogs(supabase, id));
      return;
    }

    if (req.method === "PATCH") {
      const existing = await getExistingRequestRow(supabase, id);

      const body = await parseJsonBody(req);
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
