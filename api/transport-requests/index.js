const { getSupabaseAdmin } = require("../_lib/supabase");
const { requireAuth } = require("../_lib/auth");
const { ok, created, badRequest, parseJsonBody, methodNotAllowed, serverError } = require("../_lib/http");
const { applyRequestFilters, mapRequestPayload, deriveRequestFlags } = require("../_lib/transport");

module.exports = async function handler(req, res) {
  if (!requireAuth(req, res)) {
    return;
  }

  const supabase = getSupabaseAdmin();

  try {
    if (req.method === "GET") {
      let query = supabase
        .from("transport_requests")
        .select("*, transport_group_members(id, group_id)")
        .order("flight_datetime", { ascending: true });

      applyRequestFilters(query, req.query || {});

      if ((req.query || {}).grouped === "true") {
        query.not("transport_group_members", "is", null);
      }
      if ((req.query || {}).grouped === "false") {
        query.is("transport_group_members", null);
      }

      const { data, error } = await query;
      if (error) {
        throw error;
      }
      ok(res, (data || []).map(deriveRequestFlags));
      return;
    }

    if (req.method === "POST") {
      const body = await parseJsonBody(req);
      let payload;
      try {
        payload = mapRequestPayload(body);
      } catch (error) {
        badRequest(res, error.message);
        return;
      }

      const { data, error } = await supabase
        .from("transport_requests")
        .insert(payload)
        .select("*")
        .single();

      if (error) {
        throw error;
      }

      created(res, data);
      return;
    }

    methodNotAllowed(res, ["GET", "POST"]);
  } catch (error) {
    serverError(res, error);
  }
};
