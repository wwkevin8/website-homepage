const { getSupabaseAdmin } = require("./_lib/supabase");
const { requireAdminUser } = require("./_lib/admin-auth");
const { ok, methodNotAllowed, serverError } = require("./_lib/http");
const { runStorageSyncAudit } = require("./_lib/storage-sync-audit");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    methodNotAllowed(res, ["POST"]);
    return;
  }

  const supabase = getSupabaseAdmin();
  const adminUser = await requireAdminUser(req, res, supabase);
  if (!adminUser) return;

  try {
    const report = await runStorageSyncAudit(supabase, {
      sampleSize: req.query?.sample_size
    });
    ok(res, report);
  } catch (error) {
    serverError(res, error);
  }
};
