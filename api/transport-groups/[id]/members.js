const { getSupabaseAdmin } = require("../../_lib/supabase");
const { requireAdminUser } = require("../../_lib/admin-auth");
const { ok, badRequest, parseJsonBody, methodNotAllowed, serverError } = require("../../_lib/http");
const { syncGroupStatus } = require("../../_lib/transport");

module.exports = async function handler(req, res) {
  const supabase = getSupabaseAdmin();
  const adminUser = await requireAdminUser(req, res, supabase);
  if (!adminUser) {
    return;
  }

  if (req.method !== "POST") {
    methodNotAllowed(res, ["POST"]);
    return;
  }
  const { id: groupId } = req.query;

  try {
    const body = await parseJsonBody(req);
    const requestIds = Array.isArray(body.request_ids) ? [...new Set(body.request_ids.filter(Boolean))] : [];

    const { data: group, error: groupError } = await supabase
      .from("transport_groups")
      .select("*")
      .eq("id", groupId)
      .single();

    if (groupError) {
      throw groupError;
    }

    const { data: requests, error: requestsError } = await supabase
      .from("transport_requests")
      .select("*")
      .in("id", requestIds.length ? requestIds : ["00000000-0000-0000-0000-000000000000"]);

    if (requestsError) {
      throw requestsError;
    }

    for (const request of requests || []) {
      if (request.service_type !== group.service_type) {
        badRequest(res, "request service_type must match group service_type");
        return;
      }
      if (request.airport_code !== group.airport_code) {
        badRequest(res, "request airport_code must match group airport_code");
        return;
      }
    }

    const passengerCount = (requests || []).reduce((sum, request) => sum + request.passenger_count, 0);
    if (passengerCount > group.max_passengers) {
      badRequest(res, "selected members exceed max_passengers");
      return;
    }

    const { data: existingMembers, error: existingMembersError } = await supabase
      .from("transport_group_members")
      .select("id, request_id")
      .eq("group_id", groupId);

    if (existingMembersError) {
      throw existingMembersError;
    }

    const existingIds = new Set((existingMembers || []).map(item => item.request_id));
    const nextIds = new Set(requestIds);
    const toRemove = (existingMembers || []).filter(item => !nextIds.has(item.request_id));
    const toInsert = requestIds.filter(requestId => !existingIds.has(requestId));

    if (toInsert.length) {
      const { data: conflictingMembers, error: conflictingError } = await supabase
        .from("transport_group_members")
        .select("group_id, request_id")
        .in("request_id", toInsert)
        .neq("group_id", groupId);

      if (conflictingError) {
        throw conflictingError;
      }

      if (conflictingMembers && conflictingMembers.length) {
        const conflictMap = new Map(conflictingMembers.map(item => [item.request_id, item.group_id]));
        const conflictedRequest = (requests || []).find(item => conflictMap.has(item.id));
        badRequest(res, "selected request is already matched to another confirmed transport order", {
          request_id: conflictedRequest?.id || conflictingMembers[0].request_id,
          order_no: conflictedRequest?.order_no || null,
          group_id: conflictMap.get(conflictedRequest?.id) || conflictingMembers[0].group_id
        });
        return;
      }
    }

    if (toRemove.length) {
      const { error } = await supabase
        .from("transport_group_members")
        .delete()
        .in("id", toRemove.map(item => item.id));
      if (error) {
        throw error;
      }

      const removedRequestIds = toRemove.map(item => item.request_id);
      const { error: requestError } = await supabase
        .from("transport_requests")
        .update({ status: "open" })
        .in("id", removedRequestIds)
        .eq("status", "grouped");
      if (requestError) {
        throw requestError;
      }
    }

    if (toInsert.length) {
      const { error } = await supabase
        .from("transport_group_members")
        .insert(toInsert.map(requestId => {
          const request = (requests || []).find(item => item.id === requestId);
          return {
            group_id: groupId,
            request_id: requestId,
            passenger_count_snapshot: request.passenger_count,
            luggage_count_snapshot: request.luggage_count
          };
        }));
      if (error) {
        throw error;
      }

      const { error: requestError } = await supabase
        .from("transport_requests")
        .update({ status: "grouped" })
        .in("id", toInsert);
      if (requestError) {
        throw requestError;
      }
    }

    const nextGroup = await syncGroupStatus(supabase, groupId);
    ok(res, nextGroup);
  } catch (error) {
    serverError(res, error);
  }
};
