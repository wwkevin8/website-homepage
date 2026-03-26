const { getSupabaseAdmin } = require("../_lib/supabase");
const { ok, methodNotAllowed, serverError } = require("../_lib/http");

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    methodNotAllowed(res, ["GET"]);
    return;
  }

  const supabase = getSupabaseAdmin();

  try {
    let query = supabase
      .from("transport_groups_public_view")
      .select("*")
      .eq("visible_on_frontend", true)
      .eq("status", "open")
      .order("group_date", { ascending: true })
      .order("preferred_time_start", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: false });

    if ((req.query || {}).service_type) {
      query.eq("service_type", req.query.service_type);
    }
    if ((req.query || {}).airport_code) {
      query.eq("airport_code", req.query.airport_code);
    } else if ((req.query || {}).airport_name) {
      query.eq("airport_name", req.query.airport_name);
    }
    if ((req.query || {}).date_from) {
      query.gte("group_date", req.query.date_from);
    }
    if ((req.query || {}).date_to) {
      query.lte("group_date", req.query.date_to);
    }

    const { data, error } = await query;
    if (error) {
      throw error;
    }

    ok(res, data || []);
  } catch (error) {
    serverError(res, error);
  }
};
