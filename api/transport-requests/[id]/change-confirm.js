const { EventEmitter } = require("events");
const { getSupabaseAdmin } = require("../../_lib/supabase");
const { requireAdminUser } = require("../../_lib/admin-auth");
const { ok, badRequest, methodNotAllowed, serverError, parseJsonBody } = require("../../_lib/http");
const {
  createGroupForRequest,
  getGroupByBusinessId,
  getGroupMembersWithRequests,
  syncGroupState,
  transferRequestToExistingGroup,
  removeRequestFromGroup
} = require("../../_lib/transport-group-lifecycle");
const previewHandler = require("./change-preview");
const { verifyPreviewToken } = previewHandler;

const CONFIRMABLE_FIELDS = new Set([
  "service_type",
  "airport_code",
  "airport_name",
  "terminal",
  "flight_no",
  "flight_datetime",
  "preferred_time_start",
  "preferred_time_end",
  "passenger_count",
  "luggage_count",
  "shareable"
]);

const GROUP_ACTIONS = new Set([
  "no_group_change",
  "keep_group",
  "move_out_no_group",
  "move_out_new_single",
  "transfer_existing_group"
]);

class PreviewResponse {
  constructor() {
    this.statusCode = 200;
    this.headers = {};
    this.body = "";
  }

  setHeader(key, value) {
    this.headers[String(key).toLowerCase()] = value;
  }

  getHeader(key) {
    return this.headers[String(key).toLowerCase()];
  }

  end(value) {
    this.body += value || "";
  }
}

function resolveAdminDisplayName(adminUser) {
  return adminUser?.name || adminUser?.username || adminUser?.email || "admin";
}

function normalizeText(value) {
  const text = String(value || "").trim();
  return text || null;
}

function normalizeGroupAction(value, fallback) {
  const action = String(value || fallback || "").trim();
  if (!GROUP_ACTIONS.has(action)) {
    const error = new Error(`unsupported group_action: ${action || "(empty)"}`);
    error.statusCode = 400;
    throw error;
  }
  return action;
}

function buildUpdatePayload(changedFields, operatedBy, operatedAt) {
  const payload = {
    last_operated_by: operatedBy,
    last_operated_at: operatedAt
  };

  for (const item of changedFields || []) {
    if (CONFIRMABLE_FIELDS.has(item.field)) {
      payload[item.field] = item.after;
    }
  }

  return payload;
}

function buildBeforeValues(changedFields) {
  return (changedFields || []).reduce((result, item) => {
    result[item.field] = item.before;
    return result;
  }, {});
}

function buildAfterValues(changedFields) {
  return (changedFields || []).reduce((result, item) => {
    result[item.field] = item.after;
    return result;
  }, {});
}

async function runPreview(req, id, body) {
  const previewReq = new EventEmitter();
  previewReq.method = "POST";
  previewReq.query = { id };
  previewReq.headers = req.headers || {};
  previewReq.body = body;

  const previewRes = new PreviewResponse();
  await previewHandler(previewReq, previewRes);

  let payload = null;
  try {
    payload = JSON.parse(previewRes.body || "{}");
  } catch (error) {
    const parseError = new Error("change-preview returned invalid JSON");
    parseError.statusCode = 500;
    throw parseError;
  }

  if (previewRes.statusCode >= 400 || payload?.error) {
    const error = new Error(payload?.error?.message || "change-preview failed");
    error.statusCode = previewRes.statusCode;
    error.details = payload?.error?.details || null;
    throw error;
  }

  return payload.data;
}

async function getExistingRequest(supabase, id) {
  let result = await supabase
    .from("transport_requests")
    .select("*")
    .eq("id", id)
    .limit(1);

  if (result.error && !String(result.error.message || "").includes("invalid input syntax for type uuid")) {
    throw result.error;
  }

  let request = result.error ? null : (Array.isArray(result.data) ? result.data[0] : result.data);
  if (!request) {
    result = await supabase
      .from("transport_requests")
      .select("*")
      .eq("order_no", id)
      .limit(1);

    if (result.error) {
      throw result.error;
    }
    request = Array.isArray(result.data) ? result.data[0] : result.data;
  }

  if (!request) {
    const error = new Error("request not found");
    error.statusCode = 404;
    throw error;
  }

  return request;
}

async function getMemberships(supabase, requestId) {
  const { data, error } = await supabase
    .from("transport_group_members")
    .select("id,group_id,request_id,passenger_count_snapshot,luggage_count_snapshot,is_initiator")
    .eq("request_id", requestId);

  if (error) {
    throw error;
  }

  return data || [];
}

async function assertNoDuplicateMembership(supabase, requestId) {
  const memberships = await getMemberships(supabase, requestId);
  const uniqueGroupIds = new Set(memberships.map(item => item.group_id).filter(Boolean));
  if (memberships.length !== uniqueGroupIds.size || memberships.length > 1) {
    const error = new Error("request has duplicate or multiple group memberships after change-confirm");
    error.statusCode = 409;
    error.memberships = memberships;
    throw error;
  }
  return memberships;
}

async function logAdminOperation(supabase, payload) {
  const { data, error } = await supabase
    .from("admin_operation_logs")
    .insert(payload)
    .select("id,created_at")
    .single();

  if (error) {
    throw error;
  }

  return data;
}

async function insertChangeLog(supabase, preview, body, adminUser, groupAction, oldGroupId, targetGroupId) {
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("order_change_logs")
    .insert({
      request_id: preview.request_id,
      order_no: preview.order_no,
      change_type: preview.classification,
      status: "draft",
      reason: normalizeText(body.reason) || preview.reason || null,
      preview_token: preview.preview_token,
      source_snapshot_hash: preview.source_snapshot_hash,
      old_values: buildBeforeValues(preview.changed_fields),
      new_values: buildAfterValues(preview.changed_fields),
      pricing_before: preview.pricing_before || {},
      pricing_after: preview.pricing_after || {},
      old_price_gbp: preview.old_price_gbp,
      new_price_gbp: preview.new_price_gbp,
      price_delta_gbp: preview.price_delta_gbp,
      paid_amount_gbp: preview.paid_amount_gbp,
      balance_due_gbp: preview.balance_due_gbp,
      refund_due_gbp: preview.refund_due_gbp,
      group_action: groupAction,
      old_group_id: oldGroupId || null,
      new_group_id: targetGroupId || null,
      created_by_admin_id: adminUser.id || null,
      created_by_admin_name: resolveAdminDisplayName(adminUser),
      metadata: {
        requested_group_action: body.group_action || null,
        target_group_id: targetGroupId || null,
        risks: preview.risks || [],
        created_by: "change-confirm"
      },
      created_at: now,
      updated_at: now
    })
    .select("id,preview_token,status,created_at")
    .single();

  if (error) {
    if (error.code === "23505") {
      const duplicateError = new Error("preview_token already confirmed or used; please run change-preview again");
      duplicateError.statusCode = 409;
      throw duplicateError;
    }
    throw error;
  }

  return data;
}

async function updateChangeLog(supabase, logId, payload) {
  const { data, error } = await supabase
    .from("order_change_logs")
    .update({
      ...payload,
      updated_at: new Date().toISOString()
    })
    .eq("id", logId)
    .select("id,status,confirmed_at")
    .single();

  if (error) {
    throw error;
  }

  return data;
}

function getCandidateGroupIds(preview) {
  return new Set((preview.group_context?.candidate_groups || []).flatMap(group => {
    return [group.group_id, group.group_ref, group.id].filter(Boolean).map(String);
  }));
}

function validateGroupAction(preview, groupAction, targetGroupId) {
  if (preview.classification === "ordinary_time_adjustment") {
    const error = new Error("ordinary time adjustments must continue to use adjust_flight_time");
    error.statusCode = 400;
    throw error;
  }

  const groupContext = preview.group_context || {};
  const changedFields = new Set((preview.changed_fields || []).map(item => item.field));

  if (groupAction === "keep_group" && !groupContext.can_keep_original_group) {
    const error = new Error("current group cannot be kept; please choose a move or transfer action");
    error.statusCode = 400;
    throw error;
  }

  if (
    groupAction === "keep_group"
    && (changedFields.has("airport_code") || changedFields.has("terminal") || changedFields.has("shareable"))
  ) {
    const error = new Error("airport, terminal, or shareable changes cannot keep the original group");
    error.statusCode = 400;
    throw error;
  }

  if (changedFields.has("flight_datetime") || changedFields.has("preferred_time_start")) {
    const serviceDateChanged = (preview.group_context?.keep_original_group_reasons || []).includes("service_date_changed");
    if (serviceDateChanged && groupAction === "keep_group") {
      const error = new Error("service date changes cannot keep the original group");
      error.statusCode = 400;
      throw error;
    }
  }

  if (changedFields.has("shareable")) {
    const shareableChange = (preview.changed_fields || []).find(item => item.field === "shareable");
    if (shareableChange?.after === false && groupAction !== "move_out_no_group") {
      const error = new Error("non-shareable changes must use move_out_no_group");
      error.statusCode = 400;
      throw error;
    }
  }

  if (groupAction === "transfer_existing_group") {
    if (!targetGroupId) {
      const error = new Error("target_group_id is required for transfer_existing_group");
      error.statusCode = 400;
      throw error;
    }
    if (!getCandidateGroupIds(preview).has(String(targetGroupId))) {
      const error = new Error("target_group_id must come from backend change-preview candidates");
      error.statusCode = 400;
      throw error;
    }
  }
}

async function updateRequest(supabase, requestId, payload) {
  const { error } = await supabase
    .from("transport_requests")
    .update(payload)
    .eq("id", requestId);

  if (error) {
    throw error;
  }
}

async function restoreRequestFields(supabase, requestId, beforeValues, previousMeta) {
  const payload = {
    ...beforeValues,
    last_operated_by: previousMeta.last_operated_by || null,
    last_operated_at: previousMeta.last_operated_at || null
  };
  const { error } = await supabase
    .from("transport_requests")
    .update(payload)
    .eq("id", requestId);

  return {
    step: "restore_transport_request",
    ok: !error,
    message: error?.message || null
  };
}

async function updateCurrentMembershipSnapshot(supabase, requestId, requestPayload) {
  const memberships = await getMemberships(supabase, requestId);
  if (!memberships.length) {
    return [];
  }

  const updates = [];
  for (const membership of memberships) {
    const { error } = await supabase
      .from("transport_group_members")
      .update({
        passenger_count_snapshot: requestPayload.passenger_count,
        luggage_count_snapshot: requestPayload.luggage_count
      })
      .eq("id", membership.id);
    if (error) {
      throw error;
    }
    updates.push(membership.group_id);
  }

  return updates;
}

async function applyGroupAction(supabase, groupAction, existing, requestPayload, preview, adminUser, targetGroupId, operatedAt) {
  const oldGroupId = preview.group_context?.current_group_id || null;
  const requestAfter = { ...existing, ...requestPayload };

  if (groupAction === "no_group_change") {
    await updateRequest(supabase, existing.id, requestPayload);
    return { old_group_id: oldGroupId, new_group_id: null, old_group: null, new_group: null };
  }

  if (groupAction === "keep_group") {
    await updateRequest(supabase, existing.id, requestPayload);
    const affectedGroupIds = await updateCurrentMembershipSnapshot(supabase, existing.id, requestAfter);
    const syncedGroups = [];
    for (const groupId of affectedGroupIds) {
      syncedGroups.push(await syncGroupState(supabase, groupId));
    }
    return {
      old_group_id: oldGroupId,
      new_group_id: oldGroupId,
      old_group: syncedGroups[0] || null,
      new_group: syncedGroups[0] || null
    };
  }

  if (groupAction === "move_out_no_group") {
    await updateRequest(supabase, existing.id, requestPayload);
    const lifecycle = await removeRequestFromGroup(supabase, existing.id, {
      regroup: false,
      closeRequest: false
    });
    return {
      old_group_id: oldGroupId,
      new_group_id: null,
      old_group: lifecycle?.affected_groups?.[0] || null,
      new_group: null,
      lifecycle
    };
  }

  if (groupAction === "move_out_new_single") {
    await updateRequest(supabase, existing.id, requestPayload);
    const lifecycle = await removeRequestFromGroup(supabase, existing.id, {
      regroup: true,
      closeRequest: false
    });
    return {
      old_group_id: oldGroupId,
      new_group_id: lifecycle?.replacement_group?.group_id || null,
      old_group: lifecycle?.affected_groups?.[0] || null,
      new_group: lifecycle?.replacement_group || null,
      lifecycle
    };
  }

  if (groupAction === "transfer_existing_group") {
    await updateRequest(supabase, existing.id, requestPayload);
    const transferTimes = {
      flight_datetime: requestAfter.flight_datetime,
      preferred_time_start: requestAfter.preferred_time_start || requestAfter.flight_datetime
    };
    const lifecycle = await transferRequestToExistingGroup(supabase, requestAfter, targetGroupId, transferTimes, {
      operatedBy: resolveAdminDisplayName(adminUser),
      operatedAt
    });
    await updateCurrentMembershipSnapshot(supabase, existing.id, requestAfter);
    return {
      old_group_id: lifecycle.old_group_id || oldGroupId,
      new_group_id: lifecycle.new_group_ref || lifecycle.new_group_id || targetGroupId,
      old_group: lifecycle.old_group || null,
      new_group: lifecycle.new_group || null,
      lifecycle
    };
  }

  const error = new Error(`unsupported group_action: ${groupAction}`);
  error.statusCode = 400;
  throw error;
}

async function buildGroupSummary(supabase, groupId) {
  if (!groupId) {
    return null;
  }
  try {
    const group = await getGroupByBusinessId(supabase, groupId);
    const members = await getGroupMembersWithRequests(supabase, groupId);
    return {
      group_id: group.group_id || group.id || groupId,
      status: group.status || null,
      member_count: members.length,
      member_order_nos: members.map(member => member.transport_requests?.order_no).filter(Boolean)
    };
  } catch (error) {
    return {
      group_id: groupId,
      summary_error: error?.message || String(error)
    };
  }
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    methodNotAllowed(res, ["POST"]);
    return;
  }

  const supabase = getSupabaseAdmin();
  const adminUser = await requireAdminUser(req, res, supabase);
  if (!adminUser) {
    return;
  }

  const id = typeof req.query?.id === "string" ? req.query.id : "";

  try {
    const body = req.body && typeof req.body === "object" ? req.body : await parseJsonBody(req);
    const suppliedPreviewToken = normalizeText(body.preview_token);
    const suppliedSnapshotHash = normalizeText(body.source_snapshot_hash);
    if (!suppliedPreviewToken || !suppliedSnapshotHash) {
      badRequest(res, "preview_token and source_snapshot_hash are required");
      return;
    }

    const tokenVerification = verifyPreviewToken(suppliedPreviewToken);
    if (!tokenVerification.valid) {
      badRequest(res, tokenVerification.reason === "expired_preview_token"
        ? "preview_token is expired; please run change-preview again"
        : "preview_token is invalid; please run change-preview again");
      return;
    }
    if (tokenVerification.source_snapshot_hash !== suppliedSnapshotHash) {
      badRequest(res, "preview_token does not match source_snapshot_hash; please run change-preview again");
      return;
    }

    const preview = await runPreview(req, id, body);
    if (preview.source_snapshot_hash !== suppliedSnapshotHash) {
      badRequest(res, "preview is stale; please run change-preview again before confirming");
      return;
    }

    const groupAction = normalizeGroupAction(body.group_action, preview.group_context?.required_group_action);
    const targetGroupId = normalizeText(body.target_group_id);
    validateGroupAction(preview, groupAction, targetGroupId);

    const existing = await getExistingRequest(supabase, preview.request_id);
    const operatedBy = resolveAdminDisplayName(adminUser);
    const operatedAt = new Date().toISOString();
    const requestPayload = buildUpdatePayload(preview.changed_fields, operatedBy, operatedAt);
    const beforeValues = buildBeforeValues(preview.changed_fields);
    const previousMeta = {
      last_operated_by: existing.last_operated_by,
      last_operated_at: existing.last_operated_at
    };
    const oldGroupId = preview.group_context?.current_group_id || null;
    const logRow = await insertChangeLog(supabase, preview, body, adminUser, groupAction, oldGroupId, targetGroupId);
    let groupLifecycle = null;
    let compensation = [];

    try {
      groupLifecycle = await applyGroupAction(
        supabase,
        groupAction,
        existing,
        requestPayload,
        preview,
        adminUser,
        targetGroupId,
        operatedAt
      );
      await assertNoDuplicateMembership(supabase, existing.id);
    } catch (mutationError) {
      compensation = mutationError.compensation || [];
      if (!compensation.length) {
        compensation.push(await restoreRequestFields(supabase, existing.id, beforeValues, previousMeta));
      }
      if (oldGroupId) {
        try {
          compensation.push({ step: "sync_old_group_after_failure", result: await syncGroupState(supabase, oldGroupId) });
        } catch (syncError) {
          compensation.push({ step: "sync_old_group_after_failure", ok: false, message: syncError?.message || String(syncError) });
        }
      }
      await updateChangeLog(supabase, logRow.id, {
        status: "cancelled",
        metadata: {
          failed: true,
          error: mutationError?.message || String(mutationError),
          compensation
        }
      });
      throw mutationError;
    }

    const adminOperation = await logAdminOperation(supabase, {
      admin_user_id: adminUser.id || null,
      target_type: "transport_request",
      target_id: existing.id,
      action: "confirm_transport_order_change",
      before_data: beforeValues,
      after_data: {
        ...buildAfterValues(preview.changed_fields),
        group_action: groupAction,
        old_group_id: groupLifecycle?.old_group_id || oldGroupId || null,
        new_group_id: groupLifecycle?.new_group_id || targetGroupId || null,
        old_price_gbp: preview.old_price_gbp,
        new_price_gbp: preview.new_price_gbp,
        price_delta_gbp: preview.price_delta_gbp,
        balance_due_gbp: preview.balance_due_gbp,
        refund_due_gbp: preview.refund_due_gbp
      },
      metadata: {
        order_no: preview.order_no,
        admin_name: operatedBy,
        preview_token: preview.preview_token,
        source_snapshot_hash: preview.source_snapshot_hash,
        order_change_log_id: logRow.id,
        group_lifecycle: groupLifecycle
      }
    });

    const confirmedLog = await updateChangeLog(supabase, logRow.id, {
      status: "confirmed",
      confirmed_by_admin_id: adminUser.id || null,
      confirmed_by_admin_name: operatedBy,
      confirmed_at: new Date().toISOString(),
      new_group_id: groupLifecycle?.new_group_id || targetGroupId || null,
      metadata: {
        confirmed: true,
        admin_operation_log_id: adminOperation.id,
        group_lifecycle: groupLifecycle
      }
    });

    const { data: updatedRequest, error: updatedRequestError } = await supabase
      .from("transport_requests")
      .select("id,order_no,status,service_type,airport_code,airport_name,terminal,flight_no,flight_datetime,preferred_time_start,preferred_time_end,passenger_count,luggage_count,shareable,payment_collection_status,deposit_amount_gbp,last_operated_by,last_operated_at")
      .eq("id", existing.id)
      .single();

    if (updatedRequestError) {
      throw updatedRequestError;
    }

    ok(res, {
      request: updatedRequest,
      group: {
        action: groupAction,
        old_group: await buildGroupSummary(supabase, groupLifecycle?.old_group_id || oldGroupId),
        new_group: await buildGroupSummary(supabase, groupLifecycle?.new_group_id || targetGroupId)
      },
      pricing: {
        old_price_gbp: preview.old_price_gbp,
        new_price_gbp: preview.new_price_gbp,
        price_delta_gbp: preview.price_delta_gbp,
        paid_amount_gbp: preview.paid_amount_gbp,
        balance_due_gbp: preview.balance_due_gbp,
        refund_due_gbp: preview.refund_due_gbp,
        pricing_before: preview.pricing_before,
        pricing_after: preview.pricing_after
      },
      order_change_log_id: confirmedLog.id,
      admin_operation_log_id: adminOperation.id,
      preview_token: preview.preview_token
    });
  } catch (error) {
    if (error?.statusCode && error.statusCode < 500) {
      badRequest(res, error.message, error.details || error.compensation || null);
      return;
    }
    serverError(res, error);
  }
};
