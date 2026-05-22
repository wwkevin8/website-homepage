const { getSupabaseAdmin } = require("../_lib/supabase");
const { requireAdminUser } = require("../_lib/admin-auth");
const { ok, created, badRequest, parseJsonBody, methodNotAllowed, serverError } = require("../_lib/http");
const { applyGroupFilters, applyEffectiveGroupCounts, mapGroupPayload, deriveDisplayGroupId } = require("../_lib/transport");
const { loadGroupStatsMap } = require("../_lib/transport-group-stats");
const { allocateGroupId } = require("../_lib/order-numbers");

function isPerfLogEnabled() {
  return process.env.NODE_ENV !== "production";
}

function nowMs() {
  return Number(process.hrtime.bigint() / 1000000n);
}

function logPerf(label, details) {
  if (!isPerfLogEnabled()) {
    return;
  }
  console.info(`[perf][transport-groups] ${label}`, details);
}

function isMissingColumnError(error, marker) {
  return Boolean(error?.message && error.message.includes(marker));
}

function parsePaymentStatus(adminNote, structuredStatus) {
  const normalized = String(structuredStatus || "").trim().toLowerCase();
  if (["paid", "unpaid", "pending", "waived"].includes(normalized)) {
    return normalized === "paid" || normalized === "waived" ? "paid" : "unpaid";
  }
  const text = String(adminNote || "");
  const match = text.match(/\[payment:(paid|unpaid)\]/i);
  return match ? match[1].toLowerCase() : "unpaid";
}

function normalizeLegacyGroupStatusInput(input = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return input;
  if (String(input.status || "").trim().toLowerCase() !== "open") return input;
  return {
    ...input,
    status: "active"
  };
}

function buildListItem(group) {
  const orderNos = Array.isArray(group.source_order_nos) ? group.source_order_nos : [];
  const studentNames = Array.isArray(group.student_names) ? group.student_names : [];
  const duplicateOrderNos = Array.isArray(group.future_duplicate_order_nos) ? group.future_duplicate_order_nos : [];
  const crossServiceOrderNos = Array.isArray(group.cross_service_future_order_nos) ? group.cross_service_future_order_nos : [];
  return {
    ...group,
    id: group.id || group.group_id,
    group_id: group.group_id || deriveDisplayGroupId(group.id || group.group_id, group.group_date),
    source_order_nos: orderNos,
    source_order_no_preview: orderNos.length > 1 ? `${orderNos[0]} +${orderNos.length - 1}` : (orderNos[0] || null),
    student_names: studentNames,
    student_name_preview: studentNames.length > 1 ? `${studentNames[0]} +${studentNames.length - 1}` : (studentNames[0] || null),
    has_future_duplicate_request: duplicateOrderNos.length > 0,
    has_future_related_request: duplicateOrderNos.length > 0 || crossServiceOrderNos.length > 0,
    future_duplicate_order_nos: duplicateOrderNos,
    same_service_future_order_nos: duplicateOrderNos,
    cross_service_future_order_nos: crossServiceOrderNos
  };
}

async function findMatchedGroupIdsBySearchTerm(supabase, searchTerm) {
  const normalizedTerm = String(searchTerm || "").trim().toUpperCase();
  if (!normalizedTerm) {
    return [];
  }

  const matchedGroupIds = new Set();
  const isUuidLike = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalizedTerm);

  const { data: directGroupMatches, error: directGroupMatchesError } = await supabase
    .from("transport_groups_public_view")
    .select("group_id, id")
    .ilike("group_id", `%${normalizedTerm}%`);

  if (directGroupMatchesError) {
    throw directGroupMatchesError;
  }

  (directGroupMatches || []).forEach(item => {
    const groupId = item.group_id || item.id;
    if (groupId) {
      matchedGroupIds.add(groupId);
    }
  });

  if (isUuidLike) {
    const { data: rawIdMatches, error: rawIdMatchesError } = await supabase
      .from("transport_groups_public_view")
      .select("group_id, id")
      .eq("id", normalizedTerm);

    if (rawIdMatchesError) {
      throw rawIdMatchesError;
    }

    (rawIdMatches || []).forEach(item => {
      const groupId = item.group_id || item.id;
      if (groupId) {
        matchedGroupIds.add(groupId);
      }
    });
  }

  const { data: requestRows, error: requestRowsError } = await supabase
    .from("transport_requests")
    .select("id")
    .ilike("order_no", `%${normalizedTerm}%`);

  if (requestRowsError) {
    throw requestRowsError;
  }

  const requestIds = (requestRows || []).map(item => item.id).filter(Boolean);
  if (requestIds.length) {
    const { data: memberMatches, error: memberMatchesError } = await supabase
      .from("transport_group_members")
      .select("group_id")
      .in("request_id", requestIds);

    if (memberMatchesError) {
      throw memberMatchesError;
    }

    (memberMatches || []).forEach(item => {
      if (item.group_id) {
        matchedGroupIds.add(item.group_id);
      }
    });
  }

  return Array.from(matchedGroupIds);
}

function buildGroupsBaseQuery(supabase, queryParams, options = {}) {
  const normalizedQueryParams = normalizeLegacyGroupStatusInput(queryParams);
  const query = supabase
    .from("transport_groups_public_view")
    .select("*", options.count ? { count: options.count } : undefined)
    .gt("current_passenger_count", 0)
    .order("group_date", { ascending: true })
    .order("preferred_time_start", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false });

  applyGroupFilters(query, normalizedQueryParams);
  if (Array.isArray(normalizedQueryParams._matched_group_ids) && normalizedQueryParams._matched_group_ids.length) {
    query.in("group_id", normalizedQueryParams._matched_group_ids);
  }
  return query;
}

async function enrichGroupsBatch(supabase, groups, metrics = {}) {
  const groupIds = groups.map(item => item.group_id || item.id).filter(Boolean);
  if (!groupIds.length) {
    return [];
  }

  const memberQueryStartedAt = nowMs();
  const { data: memberRows, error: memberRowsError } = await supabase
    .from("transport_group_members")
    .select("group_id, request_id, passenger_count_snapshot, created_at, transport_requests(id, order_no, student_name, site_user_id, service_type, passenger_count, status, terminal, flight_datetime, airport_code, flight_no, notes, luggage_count, admin_note, manual_payment_status)")
    .in("group_id", groupIds)
    .order("created_at", { ascending: true });
  metrics.memberQueryMs = (metrics.memberQueryMs || 0) + (nowMs() - memberQueryStartedAt);

  if (memberRowsError) {
    throw memberRowsError;
  }

  const memberOrderMap = new Map();
  const memberStudentMap = new Map();
  const memberUserMap = new Map();
  const paymentSummaryMap = new Map();
  (memberRows || []).forEach(item => {
    const orderNos = memberOrderMap.get(item.group_id) || [];
    const studentNames = memberStudentMap.get(item.group_id) || [];
    const userIds = memberUserMap.get(item.group_id) || [];
    const paymentSummary = paymentSummaryMap.get(item.group_id) || {
      total_member_count: 0,
      paid_member_count: 0,
      unpaid_member_count: 0,
      all_members_paid: false,
      member_payments: []
    };
    const orderNo = item.transport_requests?.order_no || null;
    const studentName = item.transport_requests?.student_name || null;
    const siteUserId = item.transport_requests?.site_user_id || null;
    const paymentStatus = parsePaymentStatus(item.transport_requests?.admin_note, item.transport_requests?.manual_payment_status);

    if (orderNo) {
      orderNos.push(orderNo);
    }
    if (studentName) {
      studentNames.push(studentName);
    }
    if (siteUserId) {
      userIds.push(siteUserId);
    }

    if (item.transport_requests?.id || item.request_id) {
      paymentSummary.total_member_count += 1;
      if (paymentStatus === "paid") {
        paymentSummary.paid_member_count += 1;
      } else {
        paymentSummary.unpaid_member_count += 1;
      }
      paymentSummary.member_payments.push({
        request_id: item.transport_requests?.id || item.request_id,
        order_no: orderNo || "--",
        student_name: studentName || "--",
        payment_status: paymentStatus,
        admin_note: item.transport_requests?.admin_note || ""
      });
    }

    memberOrderMap.set(item.group_id, orderNos);
    memberStudentMap.set(item.group_id, studentNames);
    memberUserMap.set(item.group_id, userIds);
    paymentSummaryMap.set(item.group_id, paymentSummary);
  });

  paymentSummaryMap.forEach(summary => {
    summary.all_members_paid = summary.total_member_count > 0 && summary.unpaid_member_count === 0;
  });

  const duplicateOrderMap = new Map();
  const crossServiceOrderMap = new Map();
  const allSiteUserIds = Array.from(new Set(Array.from(memberUserMap.values()).flat().filter(Boolean)));
  const duplicateFutureStartedAt = nowMs();
  if (allSiteUserIds.length) {
      const { data: activeFutureRows, error: activeFutureRowsError } = await supabase
        .from("transport_requests")
        .select("site_user_id, order_no, status, flight_datetime, service_type")
      .in("site_user_id", allSiteUserIds)
      .in("status", ["published", "matched"])
      .gt("flight_datetime", new Date().toISOString())
      .order("flight_datetime", { ascending: true });

    if (activeFutureRowsError) {
      throw activeFutureRowsError;
    }

    const groupedByUser = new Map();
    (activeFutureRows || []).forEach(row => {
      const current = groupedByUser.get(row.site_user_id) || [];
      current.push(row);
      groupedByUser.set(row.site_user_id, current);
    });

    groupIds.forEach(groupId => {
      const currentOrderNos = new Set(memberOrderMap.get(groupId) || []);
      const duplicateOrderNos = new Set();
      const crossServiceOrderNos = new Set();
      const siteUserIds = Array.from(new Set(memberUserMap.get(groupId) || []));
      const currentServiceTypes = new Set(
        (memberRows || [])
          .filter(item => item.group_id === groupId)
          .map(item => item.transport_requests?.service_type)
          .filter(Boolean)
      );

      siteUserIds.forEach(siteUserId => {
        const rows = groupedByUser.get(siteUserId) || [];
        if (rows.length <= 1) {
          return;
        }

        rows.forEach(row => {
          if (row.order_no && !currentOrderNos.has(row.order_no)) {
            if (currentServiceTypes.has(row.service_type)) {
              duplicateOrderNos.add(row.order_no);
            } else {
              crossServiceOrderNos.add(row.order_no);
            }
          }
        });
      });

      duplicateOrderMap.set(groupId, Array.from(duplicateOrderNos));
      crossServiceOrderMap.set(groupId, Array.from(crossServiceOrderNos));
    });
  }
  metrics.duplicateFutureMs = (metrics.duplicateFutureMs || 0) + (nowMs() - duplicateFutureStartedAt);

  const statsStartedAt = nowMs();
  const groupStatsById = await loadGroupStatsMap(supabase, groupIds, {
    groups,
    members: memberRows || [],
    metrics
  });
  metrics.statsMs = (metrics.statsMs || 0) + (nowMs() - statsStartedAt);

  return groups.map(group => {
    const groupRef = group.group_id || group.id;
    const groupStats = groupStatsById.get(groupRef) || {};
    return buildListItem({
      ...group,
      ...groupStats,
      id: group.id || groupRef,
      group_id: group.group_id || deriveDisplayGroupId(groupRef, group.group_date),
      source_order_nos: memberOrderMap.get(groupRef) || [],
      student_names: memberStudentMap.get(groupRef) || [],
      payment_summary: paymentSummaryMap.get(groupRef) || {
        total_member_count: 0,
        paid_member_count: 0,
        unpaid_member_count: 0,
        all_members_paid: false,
        member_payments: []
      },
      future_duplicate_order_nos: duplicateOrderMap.get(groupRef) || [],
      cross_service_future_order_nos: crossServiceOrderMap.get(groupRef) || []
    });
  }).filter(group => Number(group.current_passenger_count || 0) > 0);
}

async function listPaginatedGroups(supabase, queryParams, page, pageSize, perfContext = {}) {
  const startedAt = nowMs();
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  const queryStartedAt = nowMs();
  const query = buildGroupsBaseQuery(supabase, queryParams, { count: "exact" }).range(from, to);
  const { data, error, count } = await query;
  const queryMs = nowMs() - queryStartedAt;
  if (error) {
    throw error;
  }

  const enrichmentStartedAt = nowMs();
  const enrichMetrics = {};
  const items = await enrichGroupsBatch(supabase, (data || []).map(applyEffectiveGroupCounts), enrichMetrics);
  const enrichmentMs = nowMs() - enrichmentStartedAt;
  const total = count || 0;

  logPerf("listPaginatedGroups", {
    authMs: perfContext.authMs,
    page,
    pageSize,
    returned: items.length,
    rows: items.length,
    total,
    baseQueryMs: queryMs,
    queryMs,
    countMs: queryMs,
    enrichGroupsMs: enrichmentMs,
    enrichmentMs,
    statsMs: enrichMetrics.statsMs || 0,
    duplicateFutureMs: enrichMetrics.duplicateFutureMs || 0,
    memberQueryMs: enrichMetrics.memberQueryMs || 0,
    totalMs: nowMs() - startedAt,
    handlerTotalMs: perfContext.startedAt ? nowMs() - perfContext.startedAt : undefined,
    countMode: "exact",
    cacheHit: null
  });

  return {
    items,
    pagination: {
      page,
      page_size: pageSize,
      total,
      total_pages: total ? Math.ceil(total / pageSize) : 0
    }
  };
}

module.exports = async function handler(req, res) {
  const handlerStartedAt = nowMs();
  const supabase = getSupabaseAdmin();
  const authStartedAt = nowMs();
  const adminUser = await requireAdminUser(req, res, supabase);
  const authMs = nowMs() - authStartedAt;
  if (!adminUser) {
    return;
  }

  try {
    if (req.method === "GET") {
      const queryParams = req.query || {};
      const orderNo = String(queryParams.order_no || "").trim().toUpperCase();
      const paginate = String(queryParams.paginate || "").toLowerCase() === "true";
      const page = Math.max(Number.parseInt(queryParams.page, 10) || 1, 1);
      const pageSize = Math.min(Math.max(Number.parseInt(queryParams.page_size, 10) || 10, 1), 100);
      const effectiveQueryParams = { ...queryParams };

      if (orderNo) {
        const matchedGroupIds = await findMatchedGroupIdsBySearchTerm(supabase, orderNo);
        if (!matchedGroupIds.length) {
          if (!paginate) {
            ok(res, []);
            return;
          }

          ok(res, {
            items: [],
            pagination: {
              page,
              page_size: pageSize,
              total: 0,
              total_pages: 0
            }
          });
          return;
        }

        effectiveQueryParams.group_id = "";
        effectiveQueryParams._matched_group_ids = matchedGroupIds;
      }

      if (paginate) {
        const response = await listPaginatedGroups(supabase, effectiveQueryParams, page, pageSize, {
          authMs,
          startedAt: handlerStartedAt
        });
        ok(res, response);
        return;
      }

      const query = buildGroupsBaseQuery(supabase, effectiveQueryParams);
      const queryStartedAt = nowMs();
      const { data, error } = await query;
      const queryMs = nowMs() - queryStartedAt;
      if (error) {
        throw error;
      }

      const enrichmentStartedAt = nowMs();
      const enrichMetrics = {};
      const items = await enrichGroupsBatch(supabase, (data || []).map(applyEffectiveGroupCounts), enrichMetrics);
      const enrichmentMs = nowMs() - enrichmentStartedAt;
      logPerf("list", {
        authMs,
        baseQueryMs: queryMs,
        queryMs,
        countMs: 0,
        enrichGroupsMs: enrichmentMs,
        enrichmentMs,
        statsMs: enrichMetrics.statsMs || 0,
        duplicateFutureMs: enrichMetrics.duplicateFutureMs || 0,
        memberQueryMs: enrichMetrics.memberQueryMs || 0,
        totalMs: nowMs() - handlerStartedAt,
        rows: items.length,
        countMode: "none",
        cacheHit: null
      });
      ok(res, items);
      return;
    }

    if (req.method === "POST") {
      const body = await parseJsonBody(req);
      let payload;
      try {
        payload = mapGroupPayload(normalizeLegacyGroupStatusInput(body));
      } catch (error) {
        badRequest(res, error.message);
        return;
      }

      let result = await supabase
        .from("transport_groups")
        .insert({
          ...payload,
          group_id: await allocateGroupId(supabase)
        })
        .select("*")
        .single();

      if (result.error && isMissingColumnError(result.error, "transport_groups.group_id")) {
        result = await supabase
          .from("transport_groups")
          .insert({
            ...payload
          })
          .select("*")
          .single();
      }

      if (result.error) {
        throw result.error;
      }

      created(res, {
        ...applyEffectiveGroupCounts(result.data),
        id: result.data.id,
        group_id: result.data.group_id || deriveDisplayGroupId(result.data.id, result.data.group_date)
      });
      return;
    }

    methodNotAllowed(res, ["GET", "POST"]);
  } catch (error) {
    serverError(res, error);
  }
};
