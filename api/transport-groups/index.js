const { getSupabaseAdmin } = require("../_lib/supabase");
const { requireAuth } = require("../_lib/auth");
const { ok, created, badRequest, parseJsonBody, methodNotAllowed, serverError } = require("../_lib/http");
const { applyGroupFilters, mapGroupPayload } = require("../_lib/transport");

module.exports = async function handler(req, res) {
  if (!requireAuth(req, res)) {
    return;
  }

  const supabase = getSupabaseAdmin();

  try {
    if (req.method === "GET") {
      let query = supabase
        .from("transport_groups_public_view")
        .select("*")
        .order("group_date", { ascending: true })
        .order("preferred_time_start", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: false });

      applyGroupFilters(query, req.query || {});

      const { data, error } = await query;
      if (error) {
        throw error;
      }

      ok(res, data || []);
      return;
    }

    if (req.method === "POST") {
      const body = await parseJsonBody(req);
      let payload;
      try {
        payload = mapGroupPayload(body);
      } catch (error) {
        badRequest(res, error.message);
        return;
      }

      const { data, error } = await supabase
        .from("transport_groups")
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
