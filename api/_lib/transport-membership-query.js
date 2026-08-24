"use strict";

const TRANSPORT_MEMBERSHIP_VIEW = "admin_transport_requests_membership_view";
const MEMBERSHIP_RELATIONS = new Set(["linked", "unlinked"]);
const MEMBERSHIP_ADVISOR_SPECIAL_VALUES = new Set(["unassigned", "needs_review"]);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function transportMembershipQueryError(message) {
  const error = new Error(message);
  error.code = "INVALID_TRANSPORT_MEMBERSHIP_FILTER";
  return error;
}

function normalizeTransportMembershipFilters(queryParams = {}) {
  const relation = String(queryParams.membership_relation || "").trim();
  const advisorId = String(queryParams.membership_advisor_id || "").trim();
  if (relation && !MEMBERSHIP_RELATIONS.has(relation)) {
    throw transportMembershipQueryError("无效的会员权益关联筛选");
  }
  if (advisorId && !MEMBERSHIP_ADVISOR_SPECIAL_VALUES.has(advisorId) && !UUID_PATTERN.test(advisorId)) {
    throw transportMembershipQueryError("无效的所属顾问筛选");
  }
  if (relation === "unlinked" && advisorId) {
    throw transportMembershipQueryError("未关联会员权益的订单不能同时按所属顾问筛选");
  }
  return {
    membershipRelation: advisorId ? "linked" : relation,
    membershipAdvisorId: advisorId
  };
}

function applyTransportMembershipFilters(query, normalized = {}) {
  if (normalized.membershipRelation) {
    query.eq("membership_relation", normalized.membershipRelation);
  }
  if (normalized.membershipAdvisorId === "unassigned") {
    query.eq("membership_advisor_resolution", "unassigned");
  } else if (normalized.membershipAdvisorId === "needs_review") {
    query.in("membership_advisor_resolution", ["unassigned", "ambiguous"]);
  } else if (normalized.membershipAdvisorId) {
    query
      .eq("membership_advisor_resolution", "assigned")
      .eq("effective_membership_advisor_id", normalized.membershipAdvisorId);
  }
  return query;
}

function isTransportMembershipViewMissing(error) {
  const message = `${error?.message || ""} ${error?.details || ""} ${error?.hint || ""}`.toLowerCase();
  return message.includes(TRANSPORT_MEMBERSHIP_VIEW) && (
    message.includes("does not exist")
    || message.includes("schema cache")
    || message.includes("could not find")
  );
}

function transportMembershipAdvisorBucket(row = {}) {
  if (row.membership_relation !== "linked" && row.is_membership_order !== true) return "unlinked";
  if (row.membership_advisor_resolution === "assigned" && row.effective_membership_advisor_id) {
    return `advisor:${row.effective_membership_advisor_id}`;
  }
  if (row.membership_advisor_resolution === "unassigned") return "unassigned";
  return "needs_review";
}

module.exports = {
  TRANSPORT_MEMBERSHIP_VIEW,
  normalizeTransportMembershipFilters,
  applyTransportMembershipFilters,
  isTransportMembershipViewMissing,
  transportMembershipAdvisorBucket
};
