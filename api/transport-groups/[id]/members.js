const { getSupabaseAdmin } = require("../../_lib/supabase");
const { requireAdminUser } = require("../../_lib/admin-auth");
const { ok, badRequest, parseJsonBody, methodNotAllowed, serverError } = require("../../_lib/http");
const { syncGroupStatus } = require("../../_lib/transport");
const { removeRequestFromGroup } = require("../../_lib/transport-group-lifecycle");

const GROUP_MEMBER_REQUEST_SELECT = [
  "id",
  "service_type",
  "airport_code",
  "passenger_count",
  "luggage_count",
  "status"
].join(", ");

function isMissingColumnError(error, marker) {
  return Boolean(error?.message && error.message.includes(marker));
}

async function fetchSingleGroupRow(supabase, groupId) {
  async function fetchFirstBy(column, value) {
    const result = await supabase
      .from("transport_groups")
      .select("*")
      .eq(column, value)
      .limit(1);

    if (result.error) {
      throw result.error;
    }

    return Array.isArray(result.data) ? (result.data[0] || null) : (result.data || null);
  }

  try {
    const byGroupId = await fetchFirstBy("group_id", groupId);
    if (byGroupId) return byGroupId;
  } catch (error) {
    if (!isMissingColumnError(error, "transport_groups.group_id")) {
      throw error;
    }
  }

  return fetchFirstBy("id", groupId);
}

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

    const group = await fetchSingleGroupRow(supabase, groupId);
    if (!group) {
      badRequest(res, "未找到目标拼车组。");
      return;
    }

    const { data: requests, error: requestsError } = await supabase
      .from("transport_requests")
      .select(GROUP_MEMBER_REQUEST_SELECT)
      .in("id", requestIds.length ? requestIds : ["00000000-0000-0000-0000-000000000000"]);

    if (requestsError) {
      throw requestsError;
    }

    for (const request of requests || []) {
      if (request.service_type !== group.service_type) {
        badRequest(res, "当前订单的服务类型与目标拼车组不一致，接机单和送机单不能混加。");
        return;
      }
      if (request.airport_code !== group.airport_code) {
        badRequest(res, "当前订单的机场与目标拼车组不一致，无法加入该拼车组。");
        return;
      }
    }

    const passengerCount = (requests || []).reduce((sum, request) => sum + request.passenger_count, 0);
    if (passengerCount > group.max_passengers) {
      badRequest(res, "所选成员加入后会超过拼车组人数上限。");
      return;
    }

    const { data: existingMembers, error: existingMembersError } = await supabase
      .from("transport_group_members")
      .select("id, request_id")
      .eq("group_id", group.group_id || group.id);

    if (existingMembersError) {
      throw existingMembersError;
    }

    const existingIds = new Set((existingMembers || []).map(item => item.request_id));
    const nextIds = new Set(requestIds);
    const toRemove = (existingMembers || []).filter(item => !nextIds.has(item.request_id));
    const toInsert = requestIds.filter(requestId => !existingIds.has(requestId));

    if (toRemove.length) {
      for (const member of toRemove) {
        await removeRequestFromGroup(supabase, member.request_id, { regroup: false });
      }
    }

    if (toInsert.length) {
      const { data: conflictingMembers, error: conflictingError } = await supabase
        .from("transport_group_members")
        .select("group_id, request_id")
        .in("request_id", toInsert)
        .neq("group_id", group.group_id || group.id);

      if (conflictingError) {
        throw conflictingError;
      }

      for (const conflict of conflictingMembers || []) {
        await removeRequestFromGroup(supabase, conflict.request_id, { regroup: false });
      }

      const { error } = await supabase
        .from("transport_group_members")
        .insert(toInsert.map(requestId => {
          const request = (requests || []).find(item => item.id === requestId);
          return {
            group_id: group.group_id || group.id,
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
        .update({ status: "matched" })
        .in("id", toInsert);
      if (requestError) {
        throw requestError;
      }
    }

    const nextGroup = await syncGroupStatus(supabase, group.group_id || group.id);
    ok(res, nextGroup);
  } catch (error) {
    serverError(res, error);
  }
};
