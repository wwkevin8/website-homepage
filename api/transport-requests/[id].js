const { getSupabaseAdmin } = require("../_lib/supabase");
const { requireAdminUser } = require("../_lib/admin-auth");
const { ok, badRequest, parseJsonBody, methodNotAllowed, serverError } = require("../_lib/http");
const { mapRequestPayload, deriveRequestDisplayFlags } = require("../_lib/transport");

module.exports = async function handler(req, res) {
  const supabase = getSupabaseAdmin();
  const adminUser = await requireAdminUser(req, res, supabase);
  if (!adminUser) {
    return;
  }
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

      let relatedGroup = null;
      let isSourceOrder = false;
      const groupId = data.transport_group_members?.[0]?.group_id || null;
      if (groupId) {
        const [{ data: group }, { data: members }] = await Promise.all([
          supabase
            .from("transport_groups")
            .select("id, status, group_date, preferred_time_start, flight_time_reference")
            .eq("id", groupId)
            .single(),
          supabase
            .from("transport_group_members")
            .select("request_id, created_at")
            .eq("group_id", groupId)
            .order("created_at", { ascending: true })
        ]);
        relatedGroup = group || null;
        isSourceOrder = Boolean(members?.[0]?.request_id === data.id);
      }

      ok(res, deriveRequestDisplayFlags(data, { group: relatedGroup, isSourceOrder }));
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

      let relatedGroup = null;
      let isSourceOrder = false;
      const nextGroupId = nextData.transport_group_members?.[0]?.group_id || null;
      if (nextGroupId) {
        const [{ data: group }, { data: members }] = await Promise.all([
          supabase
            .from("transport_groups")
            .select("id, status, group_date, preferred_time_start, flight_time_reference")
            .eq("id", nextGroupId)
            .single(),
          supabase
            .from("transport_group_members")
            .select("request_id, created_at")
            .eq("group_id", nextGroupId)
            .order("created_at", { ascending: true })
        ]);
        relatedGroup = group || null;
        isSourceOrder = Boolean(members?.[0]?.request_id === nextData.id);
      }

      ok(res, deriveRequestDisplayFlags(nextData, { group: relatedGroup, isSourceOrder }));
      return;
    }

    if (req.method === "DELETE") {
      const { data: existing, error: existingError } = await supabase
        .from("transport_requests")
        .select("id, order_no, student_name")
        .eq("id", id)
        .single();

      if (existingError) {
        throw existingError;
      }

      const { error } = await supabase
        .from("transport_requests")
        .delete()
        .eq("id", id);

      if (error) {
        throw error;
      }

      ok(res, {
        id: existing.id,
        order_no: existing.order_no || null,
        student_name: existing.student_name || null
      });
      return;
    }

    methodNotAllowed(res, ["GET", "PATCH", "DELETE"]);
  } catch (error) {
    serverError(res, error);
  }
};
