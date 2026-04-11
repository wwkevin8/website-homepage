const { getSupabaseAdmin } = require("../_lib/supabase");
const { applyEffectiveGroupCounts } = require("../_lib/transport");
const { ok, methodNotAllowed, serverError } = require("../_lib/http");

function getLondonTodayIsoDate() {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
  const parts = formatter.formatToParts(new Date());
  const year = parts.find(part => part.type === "year")?.value;
  const month = parts.find(part => part.type === "month")?.value;
  const day = parts.find(part => part.type === "day")?.value;
  return `${year}-${month}-${day}`;
}

function parsePositiveInteger(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function applySort(query, sort) {
  if (sort === "latest") {
    query
      .order("group_date", { ascending: false })
      .order("preferred_time_start", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false });
    return;
  }

  query
    .order("group_date", { ascending: true })
    .order("preferred_time_start", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false });
}

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    methodNotAllowed(res, ["GET"]);
    return;
  }

  const supabase = getSupabaseAdmin();

  try {
    const queryParams = req.query || {};
    const limit = parsePositiveInteger(queryParams.limit);
    const page = parsePositiveInteger(queryParams.page) || 1;
    const includePast = queryParams.include_past === "true";
    const dateFrom = includePast ? (queryParams.date_from || "") : (queryParams.date_from || getLondonTodayIsoDate());
    const sort = queryParams.sort === "latest" ? "latest" : "upcoming";

    let query = supabase
      .from("transport_groups_public_view")
      .select("*", { count: "exact" })
      .eq("visible_on_frontend", true)
      .eq("status", "open");

    if (queryParams.service_type) {
      query.eq("service_type", queryParams.service_type);
    }
    if (queryParams.airport_code) {
      query.eq("airport_code", queryParams.airport_code);
    } else if (queryParams.airport_name) {
      query.eq("airport_name", queryParams.airport_name);
    }
    if (dateFrom) {
      query.gte("group_date", dateFrom);
    }
    if (queryParams.date_to) {
      query.lte("group_date", queryParams.date_to);
    }

    applySort(query, sort);

    if (limit) {
      const from = (page - 1) * limit;
      const to = from + limit - 1;
      query.range(from, to);
    }

    const { data, error, count } = await query;
    if (error) {
      throw error;
    }

    const items = (data || []).map(applyEffectiveGroupCounts);
    const total = typeof count === "number" ? count : items.length;

    ok(res, {
      items,
      total,
      page,
      page_size: limit || items.length,
      has_next: limit ? (page * limit) < total : false,
      date_from: dateFrom || null,
      include_past: includePast,
      sort
    });
  } catch (error) {
    serverError(res, error);
  }
};
