const { getSupabaseAdmin } = require("../_lib/supabase");
const { requireAdminUser } = require("../_lib/admin-auth");
const { ok, badRequest, parseJsonBody, methodNotAllowed, serverError } = require("../_lib/http");
const { mapRequestPayload, deriveRequestDisplayFlags, closeExpiredRequests, syncGroupStatus } = require("../_lib/transport");
const { removeRequestFromGroup, backfillMissingPickupGroups } = require("../_lib/transport-group-lifecycle");
const { sendTransportPaymentConfirmationEmail } = require("../_lib/transport-payment-email");

function parsePaymentStatus(adminNote) {
  const match = String(adminNote || "").match(/\[payment:(paid|unpaid)\]/i);
  return match ? match[1].toLowerCase() : "unpaid";
}

function isInvalidUuidError(error) {
  return Boolean(error?.message && error.message.includes("invalid input syntax for type uuid"));
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
      ok(res, await getRequestWithContext(supabase, id));
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

      const shouldClose = payload.status === "closed" && existing.status !== "closed";
      const wasPaid = parsePaymentStatus(existing.admin_note) === "paid";
      const isPaid = parsePaymentStatus(payload.admin_note) === "paid";
      const { error } = await supabase
        .from("transport_requests")
        .update(payload)
        .eq("id", existing.id);

      if (error) {
        throw error;
      }

      if (shouldClose) {
        await removeRequestFromGroup(supabase, id);
      }

      let updatedRequest = await getRequestWithContext(supabase, id);
      if (!shouldClose && updatedRequest?.group_ref) {
        await syncGroupStatus(supabase, updatedRequest.group_ref);
        updatedRequest = await getRequestWithContext(supabase, id);
      }

      let paymentEmail = null;
      if (!wasPaid && isPaid) {
        try {
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

      const { error } = await supabase
        .from("transport_requests")
        .delete()
        .eq("id", existing.id);

      if (error) {
        throw error;
      }

      ok(res, existing);
      return;
    }

    methodNotAllowed(res, ["GET", "PATCH", "DELETE"]);
  } catch (error) {
    serverError(res, error);
  }
};
