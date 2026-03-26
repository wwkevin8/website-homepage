const { getSupabaseAdmin } = require("../_lib/supabase");
const { requireAuth } = require("../_lib/auth");
const { ok, badRequest, parseJsonBody, methodNotAllowed, serverError } = require("../_lib/http");
const { mapRequestPayload, deriveRequestFlags } = require("../_lib/transport");

module.exports = async function handler(req, res) {
  if (!requireAuth(req, res)) {
    return;
  }

  const supabase = getSupabaseAdmin();
  const { id } = req.query;

  try {
    if (req.method === "GET") {
      const { data, error } = await supabase
        .from("transport_requests")
        .select("*, transport_group_members(id, group_id)")
        .eq("id", id)
        .single();

      if (error) {
        throw error;
      }

      ok(res, deriveRequestFlags(data));
      return;
    }

    if (req.method === "PATCH") {
      const { data: existing, error: existingError } = await supabase
        .from("transport_requests")
        .select("*")
        .eq("id", id)
        .single();

      if (existingError) {
        throw existingError;
      }

      const body = await parseJsonBody(req);
      let payload;
      try {
        payload = mapRequestPayload(body, existing);
      } catch (error) {
        badRequest(res, error.message);
        return;
      }

      const { data, error } = await supabase
        .from("transport_requests")
        .update(payload)
        .eq("id", id)
        .select("*")
        .single();

      if (error) {
        throw error;
      }

      const { data: nextData, error: nextError } = await supabase
        .from("transport_requests")
        .select("*, transport_group_members(id, group_id)")
        .eq("id", id)
        .single();

      if (nextError) {
        throw nextError;
      }

      ok(res, deriveRequestFlags(nextData));
      return;
    }

    methodNotAllowed(res, ["GET", "PATCH"]);
  } catch (error) {
    serverError(res, error);
  }
};
