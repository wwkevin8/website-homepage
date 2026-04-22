const { getSupabaseAdmin } = require("../../_lib/supabase");
const { requireAdminUser } = require("../../_lib/admin-auth");
const { created, methodNotAllowed, serverError, badRequest } = require("../../_lib/http");
const { createPickupRequestWithGroup, removeRequestFromGroup } = require("../../_lib/transport-group-lifecycle");

const RECREATE_FIELDS = [
  "site_user_id",
  "service_type",
  "student_name",
  "phone",
  "wechat",
  "passenger_count",
  "luggage_count",
  "airport_code",
  "airport_name",
  "terminal",
  "flight_no",
  "flight_datetime",
  "location_from",
  "location_to",
  "preferred_time_start",
  "preferred_time_end",
  "shareable",
  "notes",
  "email_verified_snapshot",
  "profile_verified_snapshot"
];

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    methodNotAllowed(res, ["POST"]);
    return;
  }

  const supabase = getSupabaseAdmin();
  const adminUser = await requireAdminUser(req, res, supabase);
  if (!adminUser) {
    return;
  }

  const id = typeof req.query?.id === "string" ? req.query.id : "";

  try {
    const { data: existing, error: existingError } = await supabase
      .from("transport_requests")
      .select("*")
      .eq("id", id)
      .single();

    if (existingError) {
      throw existingError;
    }

    if (existing.status !== "closed") {
      badRequest(res, "Please close the current order before recreating a new one.");
      return;
    }

    const insertPayload = RECREATE_FIELDS.reduce((accumulator, field) => {
      accumulator[field] = existing[field] ?? null;
      return accumulator;
    }, {});

    insertPayload.admin_note = existing.admin_note || `Recreated from ${existing.order_no}`;
    await removeRequestFromGroup(supabase, existing.id);

    const { request, group } = await createPickupRequestWithGroup(supabase, insertPayload);

    created(res, {
      ...request,
      group_id: group.group_id
    });
  } catch (error) {
    serverError(res, error);
  }
};
