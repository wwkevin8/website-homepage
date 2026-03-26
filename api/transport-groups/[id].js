const { getSupabaseAdmin } = require("../_lib/supabase");
const { requireAuth } = require("../_lib/auth");
const { ok, badRequest, parseJsonBody, methodNotAllowed, serverError } = require("../_lib/http");
const { mapGroupPayload, getGroupPassengerCount } = require("../_lib/transport");

module.exports = async function handler(req, res) {
  if (!requireAuth(req, res)) {
    return;
  }

  const supabase = getSupabaseAdmin();
  const { id } = req.query;

  try {
    if (req.method === "GET") {
      const { data: group, error: groupError } = await supabase
        .from("transport_groups_public_view")
        .select("*")
        .eq("id", id)
        .single();

      if (groupError) {
        throw groupError;
      }

      const { data: members, error: membersError } = await supabase
        .from("transport_group_members")
        .select("id, group_id, request_id, passenger_count_snapshot, luggage_count_snapshot, created_at, transport_requests(*)")
        .eq("group_id", id)
        .order("created_at", { ascending: true });

      if (membersError) {
        throw membersError;
      }

      ok(res, { ...group, members: members || [] });
      return;
    }

    if (req.method === "PATCH") {
      const { data: existing, error: existingError } = await supabase
        .from("transport_groups")
        .select("*")
        .eq("id", id)
        .single();

      if (existingError) {
        throw existingError;
      }

      const body = await parseJsonBody(req);
      let payload;
      try {
        payload = mapGroupPayload(body, existing);
      } catch (error) {
        badRequest(res, error.message);
        return;
      }

      const currentPassengerCount = await getGroupPassengerCount(supabase, id);
      if (payload.max_passengers < currentPassengerCount) {
        badRequest(res, "max_passengers cannot be smaller than current passenger count");
        return;
      }

      const { data, error } = await supabase
        .from("transport_groups")
        .update(payload)
        .eq("id", id)
        .select("*")
        .single();

      if (error) {
        throw error;
      }

      ok(res, data);
      return;
    }

    methodNotAllowed(res, ["GET", "PATCH"]);
  } catch (error) {
    serverError(res, error);
  }
};
