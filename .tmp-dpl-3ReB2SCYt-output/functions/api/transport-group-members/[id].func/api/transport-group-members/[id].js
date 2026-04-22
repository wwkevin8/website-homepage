const { getSupabaseAdmin } = require("../_lib/supabase");
const { requireAdminUser } = require("../_lib/admin-auth");
const { ok, methodNotAllowed, serverError } = require("../_lib/http");
const { removeRequestFromGroup } = require("../_lib/transport-group-lifecycle");

module.exports = async function handler(req, res) {
  const supabase = getSupabaseAdmin();
  const adminUser = await requireAdminUser(req, res, supabase);
  if (!adminUser) {
    return;
  }

  if (req.method !== "DELETE") {
    methodNotAllowed(res, ["DELETE"]);
    return;
  }
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

    const result = await removeRequestFromGroup(supabase, member.request_id);
    ok(res, result?.affected_groups?.[0] || result?.replacement_group || { group_id: member.group_id });
  } catch (error) {
    serverError(res, error);
  }
};
