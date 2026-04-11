const { getSupabaseAdmin } = require("../_lib/supabase");
const { requireAdminUser } = require("../_lib/admin-auth");
const { ok, badRequest, parseJsonBody, methodNotAllowed, serverError } = require("../_lib/http");
const { applyEffectiveGroupCounts, mapGroupPayload, getGroupPassengerCount } = require("../_lib/transport");

module.exports = async function handler(req, res) {
  const supabase = getSupabaseAdmin();
  const adminUser = await requireAdminUser(req, res, supabase);
  if (!adminUser) {
    return;
  }
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

      ok(res, { ...applyEffectiveGroupCounts(group), members: members || [] });
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

      ok(res, applyEffectiveGroupCounts(data));
      return;
    }

    if (req.method === "DELETE") {
      const { data: existingMembers, error: existingMembersError } = await supabase
        .from("transport_group_members")
        .select("request_id")
        .eq("group_id", id);

      if (existingMembersError) {
        throw existingMembersError;
      }

      const requestIds = (existingMembers || []).map(item => item.request_id).filter(Boolean);
      if (requestIds.length) {
        const { error: requestError } = await supabase
          .from("transport_requests")
          .update({ status: "open" })
          .in("id", requestIds)
          .eq("status", "grouped");

        if (requestError) {
          throw requestError;
        }
      }

      const { data: existingGroup, error: existingGroupError } = await supabase
        .from("transport_groups")
        .select("id")
        .eq("id", id)
        .single();

      if (existingGroupError) {
        throw existingGroupError;
      }

      const { error } = await supabase
        .from("transport_groups")
        .delete()
        .eq("id", id);

      if (error) {
        throw error;
      }

      ok(res, { id: existingGroup.id });
      return;
    }

    methodNotAllowed(res, ["GET", "PATCH", "DELETE"]);
  } catch (error) {
    serverError(res, error);
  }
};
