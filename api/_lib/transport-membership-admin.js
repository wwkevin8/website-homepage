"use strict";

const LIVE_CLAIM_STATUSES = new Set(["selected", "reserved", "used", "manual"]);

function clean(value) {
  return String(value ?? "").trim();
}

function escapeLike(value) {
  return clean(value).replace(/[\\%_]/g, match => `\\${match}`);
}

function maskPhone(value) {
  const text = clean(value);
  if (!text) return "";
  if (text.length <= 7) return `${text.slice(0, 2)}***${text.slice(-2)}`;
  return `${text.slice(0, 4)}****${text.slice(-3)}`;
}

function maskEmail(value) {
  const text = clean(value);
  if (!text || !text.includes("@")) return text ? "***" : "";
  const [local, domain] = text.split("@");
  return `${local.slice(0, Math.min(2, local.length))}***@${domain}`;
}

function entitlementDateState(entitlement, today = new Date().toISOString().slice(0, 10)) {
  if (entitlement.status === "revoked") return { code: "entitlement_revoked", available: false, reason: "会员资格已撤销" };
  if (entitlement.status === "expired" || (entitlement.valid_until && entitlement.valid_until < today)) {
    return { code: "entitlement_expired", available: false, reason: "会员资格已过期" };
  }
  if (entitlement.status !== "active") return { code: "entitlement_inactive", available: false, reason: "会员资格当前不可用" };
  if (entitlement.valid_from && entitlement.valid_from > today) return { code: "entitlement_not_started", available: false, reason: "会员资格尚未生效" };
  return null;
}

function classifyEntitlement(entitlement, claim) {
  const dateState = entitlementDateState(entitlement);
  if (dateState) return dateState;
  if (!claim) {
    return { code: "pickup_will_be_selected", available: true, creates_claim: true, reason: "尚未选择本周期权益；关联时将选择接机权益" };
  }
  if (claim.benefit_type !== "pickup") {
    return { code: "other_benefit_selected", available: false, reason: `本周期已选择其他权益（${claim.benefit_type}）` };
  }
  if (claim.status === "selected" && !claim.linked_order_id) {
    return { code: "pickup_selected", available: true, creates_claim: false, reason: "接机权益可关联" };
  }
  if (claim.status === "reserved") {
    return { code: "pickup_reserved", available: false, reason: claim.linked_order_no ? `接机权益已关联订单 ${claim.linked_order_no}` : "接机权益已被其他订单占用" };
  }
  if (claim.status === "used" || claim.status === "manual") {
    return { code: "pickup_used", available: false, reason: "接机权益已使用，不可再次关联" };
  }
  return { code: "claim_unavailable", available: false, reason: `权益选择状态不可用（${claim.status || "未知"}）` };
}

async function loadAdvisorMap(supabase, entitlements) {
  const activationIds = entitlements.map(item => clean(item.metadata?.activation_code_id)).filter(Boolean);
  const activationMap = new Map();
  if (activationIds.length) {
    const { data, error } = await supabase.from("membership_activation_codes")
      .select("id,generated_by_admin_id").in("id", [...new Set(activationIds)]);
    if (error) throw error;
    (data || []).forEach(item => activationMap.set(String(item.id), item.generated_by_admin_id));
  }
  const advisorIds = [...new Set(entitlements.flatMap(item => [
    item.advisor_admin_id,
    item.created_by_admin_id,
    item.granted_by_admin_id,
    activationMap.get(clean(item.metadata?.activation_code_id))
  ]).filter(Boolean).map(String))];
  const adminMap = new Map();
  if (advisorIds.length) {
    const { data, error } = await supabase.from("admin_users").select("id,name,username,email,status").in("id", advisorIds);
    if (error) throw error;
    (data || []).forEach(item => adminMap.set(String(item.id), item));
  }
  return { activationMap, adminMap };
}

function advisorFor(entitlement, activationMap, adminMap) {
  const advisorId = entitlement.advisor_admin_id
    || entitlement.created_by_admin_id
    || entitlement.granted_by_admin_id
    || activationMap.get(clean(entitlement.metadata?.activation_code_id))
    || null;
  const admin = advisorId ? adminMap.get(String(advisorId)) : null;
  return advisorId ? {
    id: advisorId,
    name: admin?.name || admin?.username || admin?.email || "未知顾问",
    status: admin?.status || ""
  } : null;
}

async function loadMembershipOptions(supabase, users) {
  const userIds = users.map(user => user.id);
  if (!userIds.length) return users.map(user => ({ ...user, entitlements: [] }));
  const { data: entitlements, error: entitlementError } = await supabase.from("membership_entitlements")
    .select("id,site_user_id,membership_cycle,status,valid_from,valid_until,advisor_admin_id,created_by_admin_id,granted_by_admin_id,metadata,created_at")
    .in("site_user_id", userIds).order("membership_cycle", { ascending: false });
  if (entitlementError) throw entitlementError;
  const entitlementIds = (entitlements || []).map(item => item.id);
  let claims = [];
  if (entitlementIds.length) {
    const result = await supabase.from("membership_benefit_claims")
      .select("id,entitlement_id,site_user_id,membership_cycle,benefit_type,status,linked_order_table,linked_order_id,linked_order_no,selected_at,reserved_at,used_at,created_at")
      .in("entitlement_id", entitlementIds).order("created_at", { ascending: false });
    if (result.error) throw result.error;
    claims = result.data || [];
  }
  const { activationMap, adminMap } = await loadAdvisorMap(supabase, entitlements || []);
  const liveClaimByEntitlement = new Map();
  claims.forEach(claim => {
    if (LIVE_CLAIM_STATUSES.has(claim.status) && !liveClaimByEntitlement.has(String(claim.entitlement_id))) {
      liveClaimByEntitlement.set(String(claim.entitlement_id), claim);
    }
  });
  const entitlementsByUser = new Map();
  (entitlements || []).forEach(entitlement => {
    const claim = liveClaimByEntitlement.get(String(entitlement.id)) || null;
    const availability = classifyEntitlement(entitlement, claim);
    const item = {
      id: entitlement.id,
      membership_cycle: entitlement.membership_cycle,
      status: entitlement.status,
      valid_from: entitlement.valid_from,
      valid_until: entitlement.valid_until,
      advisor: advisorFor(entitlement, activationMap, adminMap),
      claim,
      ...availability
    };
    const key = String(entitlement.site_user_id);
    if (!entitlementsByUser.has(key)) entitlementsByUser.set(key, []);
    entitlementsByUser.get(key).push(item);
  });
  return users.map(user => ({ ...user, entitlements: entitlementsByUser.get(String(user.id)) || [] }));
}

async function searchTransportMembershipMembers(supabase, options = {}) {
  const search = clean(options.search);
  const page = Math.min(10, Math.max(1, Number(options.page) || 1));
  const pageSize = Math.min(10, Math.max(1, Number(options.pageSize) || 10));
  if (search.length < 2 || search.length > 100) {
    const error = new Error("请输入 2 至 100 个字符搜索会员");
    error.code = "INVALID_MEMBER_SEARCH";
    throw error;
  }
  const requestId = clean(options.requestId);
  const manualCreate = options.purpose === "manual_create";
  let order = null;
  if (!manualCreate) {
    const { data, error: orderError } = await supabase.from("transport_requests")
      .select("id,service_type,phone,wechat,email,student_name").eq("id", requestId).maybeSingle();
    if (orderError) throw orderError;
    order = data;
    if (!order || order.service_type !== "pickup") {
      const error = new Error("仅接机订单可以搜索并关联会员权益");
      error.code = "INVALID_MEMBER_SEARCH";
      throw error;
    }
  }
  const select = "id,public_user_id,nickname,email,phone,wechat_id,whatsapp_contact,created_at";
  const exactSearch = escapeLike(search);
  const exactQueries = [
    supabase.from("site_users").select(select).ilike("public_user_id", exactSearch).limit(5),
    supabase.from("site_users").select(select).ilike("email", exactSearch).limit(5),
    supabase.from("site_users").select(select).ilike("wechat_id", exactSearch).limit(5),
    supabase.from("site_users").select(select).eq("phone", search).limit(5)
  ];
  const nameQuery = supabase.from("site_users").select(select).ilike("nickname", `%${escapeLike(search)}%`).limit(60);
  const results = await Promise.all([...exactQueries, nameQuery]);
  const failed = results.find(result => result.error);
  if (failed) throw failed.error;
  const merged = new Map();
  results.forEach(result => (result.data || []).forEach(user => {
    if (!merged.has(String(user.id))) merged.set(String(user.id), user);
  }));
  const all = [...merged.values()].slice(0, 60);
  const offset = (page - 1) * pageSize;
  const same = (left, right) => Boolean(clean(left)) && clean(left).toLowerCase() === clean(right).toLowerCase();
  const pageUsers = all.slice(offset, offset + pageSize).map(user => ({
    id: user.id,
    public_user_id: user.public_user_id,
    nickname: user.nickname,
    phone_masked: maskPhone(user.phone),
    email_masked: maskEmail(user.email),
    wechat_id: user.wechat_id || user.whatsapp_contact || "",
    contact_match: {
      phone: manualCreate ? null : same(order.phone, user.phone),
      email: manualCreate ? null : same(order.email, user.email),
      wechat: manualCreate ? null : same(order.wechat, user.wechat_id) || same(order.wechat, user.whatsapp_contact),
      any: manualCreate ? null : same(order.phone, user.phone) || same(order.email, user.email) || same(order.wechat, user.wechat_id) || same(order.wechat, user.whatsapp_contact)
    }
  }));
  const enriched = await loadMembershipOptions(supabase, pageUsers);
  return {
    items: enriched,
    pagination: {
      page,
      page_size: pageSize,
      total: all.length,
      total_pages: all.length ? Math.ceil(all.length / pageSize) : 0,
      capped: all.length >= 60
    }
  };
}

async function getTransportMembershipContext(supabase, requestId) {
  const { data: request, error } = await supabase.from("admin_transport_requests_membership_view")
    .select("*").eq("id", requestId).maybeSingle();
  if (error) throw error;
  if (!request) {
    const notFound = new Error("接送机订单不存在");
    notFound.code = "TRANSPORT_REQUEST_NOT_FOUND";
    throw notFound;
  }
  const { data: reverseClaims, error: reverseError } = await supabase.from("membership_benefit_claims")
    .select("id,entitlement_id,site_user_id,membership_cycle,benefit_type,status,linked_order_table,linked_order_id,linked_order_no,selected_at,reserved_at,used_at")
    .eq("linked_order_table", "transport_requests").eq("linked_order_id", request.id);
  if (reverseError) throw reverseError;
  const claimId = request.resolved_membership_claim_id || request.membership_benefit_claim_id;
  let current = null;
  if (claimId) {
    const { data: claims, error: claimError } = await supabase.from("membership_benefit_claims")
      .select("id,entitlement_id,site_user_id,membership_cycle,benefit_type,status,linked_order_table,linked_order_id,linked_order_no,selected_at,reserved_at,used_at")
      .eq("id", claimId).limit(1);
    if (claimError) throw claimError;
    const claim = claims?.[0] || null;
    if (claim) {
      const users = await loadMembershipOptions(supabase, [{ id: claim.site_user_id }]);
      const entitlement = users[0]?.entitlements?.find(item => String(item.id) === String(claim.entitlement_id)) || null;
      const { data: userRows, error: userError } = await supabase.from("site_users")
        .select("id,public_user_id,nickname,email,phone,wechat_id,whatsapp_contact").eq("id", claim.site_user_id).limit(1);
      if (userError) throw userError;
      const user = userRows?.[0] || {};
      current = {
        claim,
        entitlement,
        member: {
          id: user.id,
          public_user_id: user.public_user_id,
          nickname: user.nickname,
          phone_masked: maskPhone(user.phone),
          email_masked: maskEmail(user.email),
          wechat_id: user.wechat_id || user.whatsapp_contact || ""
        }
      };
    }
  }
  const adminIds = [request.membership_linked_by_admin_id, request.membership_advisor_admin_id, request.current_membership_advisor_id].filter(Boolean);
  const adminMap = new Map();
  if (adminIds.length) {
    const result = await supabase.from("admin_users").select("id,name,username,email,status").in("id", [...new Set(adminIds)]);
    if (result.error) throw result.error;
    (result.data || []).forEach(admin => adminMap.set(String(admin.id), admin));
  }
  const adminSummary = id => {
    const admin = id ? adminMap.get(String(id)) : null;
    return id ? { id, name: admin?.name || admin?.username || admin?.email || "未知管理员", status: admin?.status || "" } : null;
  };
  return {
    order: {
      id: request.id,
      order_no: request.order_no,
      service_type: request.service_type,
      student_name: request.student_name,
      phone: request.phone,
      wechat: request.wechat,
      email: request.email,
      flight_no: request.flight_no,
      flight_datetime: request.flight_datetime,
      payment_collection_status: request.payment_collection_status,
      deposit_amount_gbp: request.deposit_amount_gbp,
      site_user_id: request.site_user_id
    },
    relation: {
      membership_relation: request.membership_relation,
      claim_resolution: request.membership_claim_resolution,
      advisor_resolution: request.membership_advisor_resolution,
      expected_current_claim_id: request.membership_benefit_claim_id,
      resolved_claim_id: request.resolved_membership_claim_id,
      linked_at: request.membership_linked_at,
      linked_by: adminSummary(request.membership_linked_by_admin_id),
      advisor_snapshot: adminSummary(request.membership_advisor_admin_id),
      current_advisor: adminSummary(request.current_membership_advisor_id),
      advisor_changed: Boolean(request.membership_advisor_admin_id && request.current_membership_advisor_id && request.membership_advisor_admin_id !== request.current_membership_advisor_id),
      reverse_claims: reverseClaims || [],
      has_conflict: !["direct", "unlinked"].includes(request.membership_claim_resolution) || request.membership_advisor_resolution === "ambiguous"
    },
    current
  };
}

module.exports = {
  classifyEntitlement,
  searchTransportMembershipMembers,
  getTransportMembershipContext
};
