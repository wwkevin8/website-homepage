const { getSupabaseAdmin } = require("../_lib/supabase");
const { requireAuth } = require("../_lib/auth");
const { ok, methodNotAllowed, serverError } = require("../_lib/http");
const { syncGroupStatus } = require("../_lib/transport");

module.exports = async function handler(req, res) {
  if (!requireAuth(req, res)) {
    return;
  }

  if (req.method !== "DELETE") {
    methodNotAllowed(res, ["DELETE"]);
    return;
  }

  const supabase = getSupabaseAdmin();
  const { id } = req.query;

  try {
    const { data: member, error: memberError } = await supabase
      .from("transport_group_members")
      .select("*")
      .eq("id", id)
      .single();

    if (memberError) {
      throw memberError;
    }

    const { error } = await supabase
      .from("transport_group_members")
      .delete()
      .eq("id", id);

    if (error) {
      throw error;
    }

    const { error: requestError } = await supabase
      .from("transport_requests")
      .update({ status: "open" })
      .eq("id", member.request_id)
      .eq("status", "grouped");

    if (requestError) {
      throw requestError;
    }

    const nextGroup = await syncGroupStatus(supabase, member.group_id);
    ok(res, nextGroup);
  } catch (error) {
    serverError(res, error);
  }
};
