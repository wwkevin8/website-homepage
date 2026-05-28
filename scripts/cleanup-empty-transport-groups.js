const { createClient } = require("@supabase/supabase-js");

function loadEnvFile() {
  try {
    const fs = require("fs");
    const text = fs.readFileSync(".env", "utf8");
    text.split(/\r?\n/).forEach(line => {
      const match = line.match(/^\s*([^#][^=]+)=(.*)$/);
      if (!match) return;
      const key = match[1].trim();
      if (process.env[key]) return;
      process.env[key] = match[2].trim().replace(/^"|"$/g, "");
    });
  } catch (error) {
    // Running in CI/Vercel can rely on real environment variables.
  }
}

function parseArgs(argv) {
  const args = new Set(argv.slice(2));
  const valueAfter = name => {
    const index = argv.indexOf(name);
    return index >= 0 ? argv[index + 1] : null;
  };
  return {
    apply: args.has("--apply"),
    confirmProduction: args.has("--confirm-production"),
    limit: Math.min(Math.max(Number(valueAfter("--limit") || 1000), 1), 5000),
    graceMinutes: Math.max(Number(valueAfter("--grace-minutes") || 10), 0)
  };
}

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }
  return value;
}

function refCandidates(group) {
  return Array.from(new Set([
    group.group_id,
    group.id
  ].map(value => String(value || "").trim()).filter(Boolean)));
}

async function fetchCandidateGroups(supabase, cutoffIso, limit) {
  const { data, error } = await supabase
    .from("transport_groups")
    .select("id, group_id, created_at, updated_at, status, service_type, group_date, preferred_time_start")
    .or(`updated_at.lte.${cutoffIso},and(updated_at.is.null,created_at.lte.${cutoffIso})`)
    .order("updated_at", { ascending: true, nullsFirst: true })
    .limit(limit);

  if (error) {
    throw error;
  }
  return data || [];
}

async function filterEmptyGroups(supabase, groups) {
  const refs = Array.from(new Set(groups.flatMap(refCandidates)));
  if (!refs.length) {
    return [];
  }

  const { data, error } = await supabase
    .from("transport_group_members")
    .select("group_id, passenger_count_snapshot, transport_requests(id, status, passenger_count)")
    .in("group_id", refs);

  if (error) {
    throw error;
  }

  const memberCounts = new Map();
  const activeMemberCounts = new Map();
  const activePassengerCounts = new Map();
  (data || []).forEach(row => {
    const groupId = String(row.group_id || "");
    memberCounts.set(groupId, (memberCounts.get(groupId) || 0) + 1);
    const requestStatus = String(row.transport_requests?.status || "").toLowerCase();
    const isActive = row.transport_requests && !["closed", "cancelled"].includes(requestStatus);
    if (isActive) {
      activeMemberCounts.set(groupId, (activeMemberCounts.get(groupId) || 0) + 1);
      activePassengerCounts.set(groupId, (activePassengerCounts.get(groupId) || 0) + Number(row.transport_requests?.passenger_count || row.passenger_count_snapshot || 0));
    }
  });

  return groups
    .map(group => {
      const memberCount = refCandidates(group).reduce((sum, ref) => sum + Number(memberCounts.get(ref) || 0), 0);
      const activeMemberCount = refCandidates(group).reduce((sum, ref) => sum + Number(activeMemberCounts.get(ref) || 0), 0);
      const activePassengerCount = refCandidates(group).reduce((sum, ref) => sum + Number(activePassengerCounts.get(ref) || 0), 0);
      return {
        ...group,
        member_count: memberCount,
        active_member_count: activeMemberCount,
        active_passenger_count: activePassengerCount
      };
    })
    .filter(group => group.active_member_count === 0);
}

async function deleteEmptyGroups(supabase, groups) {
  const deleted = [];
  for (const group of groups) {
    const refs = refCandidates(group);
    const memberDelete = await supabase
      .from("transport_group_members")
      .delete()
      .in("group_id", refs);
    if (memberDelete.error) {
      throw memberDelete.error;
    }

    const groupDelete = await supabase
      .from("transport_groups")
      .delete()
      .eq("id", group.id)
      .select("id, group_id");
    if (groupDelete.error) {
      throw groupDelete.error;
    }
    deleted.push(...(groupDelete.data || []));
  }
  return deleted;
}

async function main() {
  loadEnvFile();
  const options = parseArgs(process.argv);
  const supabase = createClient(requiredEnv("SUPABASE_URL"), requiredEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const cutoffIso = new Date(Date.now() - options.graceMinutes * 60 * 1000).toISOString();
  const candidateGroups = await fetchCandidateGroups(supabase, cutoffIso, options.limit);
  const emptyGroups = await filterEmptyGroups(supabase, candidateGroups);

  const preview = emptyGroups.map(group => ({
    id: group.id,
    group_id: group.group_id,
    status: group.status,
    service_type: group.service_type,
    group_date: group.group_date,
    preferred_time_start: group.preferred_time_start,
    created_at: group.created_at,
    updated_at: group.updated_at,
    member_count: group.member_count,
    active_member_count: group.active_member_count,
    active_passenger_count: group.active_passenger_count
  }));

  console.log(JSON.stringify({
    mode: options.apply ? "apply" : "dry-run",
    cutoffIso,
    scanned_group_count: candidateGroups.length,
    delete_candidate_count: preview.length,
    delete_candidates: preview
  }, null, 2));

  if (!options.apply) {
    return;
  }
  if (!options.confirmProduction) {
    throw new Error("Refusing to delete without --confirm-production");
  }

  const deleted = await deleteEmptyGroups(supabase, emptyGroups);
  console.log(JSON.stringify({
    deleted_count: deleted.length,
    deleted
  }, null, 2));
}

main().catch(error => {
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
