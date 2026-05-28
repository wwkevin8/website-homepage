const { getSupabaseAdmin } = require("../_lib/supabase");
const { requireAdminUser } = require("../_lib/admin-auth");
const { ok, created, badRequest, parseJsonBody, methodNotAllowed, serverError } = require("../_lib/http");
const { applyGroupFilters, applyEffectiveGroupCounts, mapGroupPayload, deriveDisplayGroupId } = require("../_lib/transport");
const { loadGroupStatsMap } = require("../_lib/transport-group-stats");
const { cleanupEmptyTransportGroups } = require("../_lib/transport-group-lifecycle");
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

function uniqueNonEmpty(values) {
  return Array.from(new Set((values || []).map(value => String(value || "").trim()).filter(Boolean)));
}

function buildTimeRange(values) {
  const timestamps = (values || [])
    .filter(Boolean)
    .map(value => new Date(value).getTime())
    .filter(value => !Number.isNaN(value))
    .sort((a, b) => a - b);

  if (!timestamps.length) {
    return { earliest: null, latest: null, span_minutes: 0 };
  }

  return {
    earliest: new Date(timestamps[0]).toISOString(),
    latest: new Date(timestamps[timestamps.length - 1]).toISOString(),
    span_minutes: timestamps.length > 1 ? Math.round((timestamps[timestamps.length - 1] - timestamps[0]) / 60000) : 0
  };
}

function buildDispatchMemberDetails(memberRows) {
  return (memberRows || []).map(member => {
    const request = member.transport_requests || {};
    const passengerCount = Number(request.passenger_count || member.passenger_count_snapshot || 0);
    const luggageCount = Number(request.luggage_count || 0);
    return {
      member_id: member.id || null,
      request_id: request.id || member.request_id || null,
      order_no: request.order_no || "--",
      student_name: request.student_name || "--",
      phone: request.phone || "",
      wechat: request.wechat || "",
      service_type: request.service_type || "",
      status: request.status || "",
      airport_code: request.airport_code || "",
      airport_name: request.airport_name || "",
      terminal: request.terminal || "",
      flight_no: request.flight_no || "",
      flight_datetime: request.flight_datetime || null,
      preferred_time_start: request.preferred_time_start || null,
      passenger_count: passengerCount,
      luggage_count: luggageCount,
      location_from: request.location_from || "",
      location_to: request.location_to || "",
      admin_note: request.admin_note || "",
      manual_payment_status: request.manual_payment_status || "",
      payment_collection_status: request.payment_collection_status || "",
      deposit_amount_gbp: request.deposit_amount_gbp ?? null,
      manual_price_gbp: request.manual_price_gbp ?? null,
      offline_recorded: Boolean(request.offline_recorded),
      contact_status: request.contact_status || ""
    };
  });
}

function buildDispatchRisks(group, memberDetails) {
  const risks = [];
  const maxPassengers = Number(group.max_passengers || 0);
  const currentPassengers = Number(group.current_passenger_count || 0);
  const terminals = uniqueNonEmpty(memberDetails.map(member => member.terminal));
  const timeRange = buildTimeRange(memberDetails.map(member => member.flight_datetime || member.preferred_time_start));
  const visibleOnFrontend = group.visible_on_frontend === true;

  if (!memberDetails.length) {
    risks.push({ code: "empty_group", label: "0 members" });
  }
  if (terminals.length > 1) {
    risks.push({ code: "cross_terminal", label: "Different terminals" });
  }
  if (timeRange.span_minutes > 180) {
    risks.push({ code: "time_gap_large", label: "Time gap over 3h" });
  }
  if (memberDetails.some(member => !member.flight_no)) {
    risks.push({ code: "missing_flight_no", label: "Missing flight no" });
  }
  if (memberDetails.some(member => !member.terminal)) {
    risks.push({ code: "missing_terminal", label: "Missing terminal" });
  }
  if (memberDetails.some(member => !member.phone && !member.wechat)) {
    risks.push({ code: "missing_contact", label: "Missing phone/WeChat" });
  }
  if (memberDetails.some(member => Number(member.passenger_count || 0) <= 0 || Number(member.luggage_count || 0) < 0)) {
    risks.push({ code: "abnormal_count", label: "Passenger/luggage count abnormal" });
  }
  if (maxPassengers > 0 && currentPassengers > maxPassengers) {
    risks.push({ code: "over_capacity", label: "Over capacity" });
  }
  if (String(group.status || "").toLowerCase() === "full" && visibleOnFrontend) {
    risks.push({ code: "full_visible", label: "Full but public visible" });
  }
  if (visibleOnFrontend && (["closed", "cancelled"].includes(String(group.status || "").toLowerCase()) || !memberDetails.length)) {
    risks.push({ code: "public_visibility_invalid", label: "Public visible but not display-ready" });
  }

  return risks;
}

function getLondonDateString(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const values = Object.fromEntries(parts.filter(part => part.type !== "literal").map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function normalizeValidityFilter(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "all") return "all";
  if (normalized === "invalid" || normalized === "expired") return "invalid";
  return "active";
}

function normalizeServiceTimeSort(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized === "service_time_desc" || normalized === "time_desc" ? "service_time_desc" : "service_time_asc";
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
  const rawTerm = String(searchTerm || "")
    .replace(/[,%()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const normalizedTerm = rawTerm.toUpperCase();
  if (!rawTerm) {
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
    .or([
      `order_no.ilike.%${normalizedTerm}%`,
      `student_name.ilike.%${rawTerm}%`,
      `phone.ilike.%${rawTerm}%`,
      `wechat.ilike.%${rawTerm}%`,
      `flight_no.ilike.%${rawTerm}%`,
      `location_from.ilike.%${rawTerm}%`,
      `location_to.ilike.%${rawTerm}%`
    ].join(","));

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
  const sortDirection = normalizeServiceTimeSort(normalizedQueryParams.sort);
  const ascending = sortDirection !== "service_time_desc";
  const query = supabase
    .from("transport_groups_public_view")
    .select("*", options.count ? { count: options.count } : undefined)
    .order("group_date", { ascending })
    .order("preferred_time_start", { ascending, nullsFirst: false })
    .order("created_at", { ascending: false });

  applyGroupFilters(query, normalizedQueryParams);
  const validity = normalizeValidityFilter(normalizedQueryParams.validity || normalizedQueryParams.effective);
  if (validity === "active") {
    query.gte("group_date", getLondonDateString());
  } else if (validity === "invalid") {
    query.lt("group_date", getLondonDateString());
  }
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

  let dispatchRows = [];
  const { data: dispatchRowsResult, error: dispatchRowsError } = await supabase
    .from("transport_groups")
    .select("id, group_id, dispatch_status")
    .in("group_id", groupIds);

  if (dispatchRowsError) {
    if (!isMissingColumnError(dispatchRowsError, "dispatch_status")) {
      throw dispatchRowsError;
    }
  } else {
    dispatchRows = dispatchRowsResult || [];
  }

  const dispatchStatusMap = new Map();
  (dispatchRows || []).forEach(row => {
    if (row.group_id) {
      dispatchStatusMap.set(row.group_id, row.dispatch_status || "pending_dispatch");
    }
    if (row.id) {
      dispatchStatusMap.set(row.id, row.dispatch_status || "pending_dispatch");
    }
  });

  const memberQueryStartedAt = nowMs();
  const { data: memberRows, error: memberRowsError } = await supabase
    .from("transport_group_members")
    .select("id, group_id, request_id, passenger_count_snapshot, created_at, transport_requests(id, order_no, student_name, site_user_id, phone, wechat, service_type, passenger_count, status, terminal, flight_datetime, preferred_time_start, airport_code, airport_name, flight_no, location_from, location_to, notes, luggage_count, admin_note, manual_payment_status, payment_collection_status, deposit_amount_gbp, manual_price_gbp, offline_recorded, contact_status)")
    .in("group_id", groupIds)
    .order("created_at", { ascending: true });
  metrics.memberQueryMs = (metrics.memberQueryMs || 0) + (nowMs() - memberQueryStartedAt);

  if (memberRowsError) {
    throw memberRowsError;
  }

  const memberOrderMap = new Map();
  const memberStudentMap = new Map();
  const memberUserMap = new Map();
  const memberDetailsMap = new Map();
  const luggageSummaryMap = new Map();
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
    const details = memberDetailsMap.get(item.group_id) || [];
    const request = item.transport_requests || {};
    const luggageSummary = luggageSummaryMap.get(item.group_id) || {
      total_luggage_count: 0
    };

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

    details.push(...buildDispatchMemberDetails([item]));
    luggageSummary.total_luggage_count += Number(request.luggage_count || 0);

    memberOrderMap.set(item.group_id, orderNos);
    memberStudentMap.set(item.group_id, studentNames);
    memberUserMap.set(item.group_id, userIds);
    memberDetailsMap.set(item.group_id, details);
    luggageSummaryMap.set(item.group_id, luggageSummary);
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
    const memberDetails = memberDetailsMap.get(groupRef) || [];
    return buildListItem({
      ...group,
      ...groupStats,
      id: group.id || groupRef,
      group_id: group.group_id || deriveDisplayGroupId(groupRef, group.group_date),
      dispatch_status: dispatchStatusMap.get(groupRef) || group.dispatch_status || "pending_dispatch",
      source_order_nos: memberOrderMap.get(groupRef) || [],
      student_names: memberStudentMap.get(groupRef) || [],
      member_details: memberDetails,
      dispatch_risks: buildDispatchRisks({ ...group, ...groupStats }, memberDetails),
      luggage_summary: luggageSummaryMap.get(groupRef) || { total_luggage_count: 0 },
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
  });
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
      await cleanupEmptyTransportGroups(supabase);
      const queryParams = req.query || {};
      const orderNo = String(queryParams.order_no || "").trim().toUpperCase();
      const paginate = String(queryParams.paginate || "").toLowerCase() === "true";
      const page = Math.max(Number.parseInt(queryParams.page, 10) || 1, 1);
      const pageSize = Math.min(Math.max(Number.parseInt(queryParams.page_size, 10) || 20, 1), 100);
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

      const allocatedGroupId = await allocateGroupId(supabase);
      let result = await supabase
        .from("transport_groups")
        .insert({
          ...payload,
          group_id: allocatedGroupId
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

      if (result.error && isMissingColumnError(result.error, "dispatch_status")) {
        const fallbackPayload = { ...payload };
        delete fallbackPayload.dispatch_status;
        result = await supabase
          .from("transport_groups")
          .insert({
            ...fallbackPayload,
            group_id: allocatedGroupId
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
