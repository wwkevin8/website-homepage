"use strict";

const assert = require("node:assert/strict");
const { computeTransportGroupPricingSnapshot } = require("../api/_lib/transport-group-stats");

function member(id, options = {}) {
  return {
    group_id: "QA-PRICE-GROUP",
    passenger_count_snapshot: options.passengers || 1,
    transport_requests: {
      id,
      passenger_count: options.passengers || 1,
      status: options.status || "published",
      terminal: options.terminal || "T5",
      airport_code: "LHR",
      flight_datetime: options.flightDate || "2026-10-10T10:00:00.000Z",
      flight_no: `QA${id}`,
      membership_benefit_claim_id: options.member ? `claim-${id}` : null,
      membership_discount_amount: options.member ? 100 : 0,
      final_price: options.member ? 0 : 185,
      manual_payment_status: options.paid ? "paid" : "unpaid",
      deposit_amount_gbp: options.paid ? 185 : 0
    }
  };
}

function price(groupDate, members) {
  return computeTransportGroupPricingSnapshot({
    group_id: "QA-PRICE-GROUP",
    group_date: groupDate,
    airport_code: "LHR",
    max_passengers: 8
  }, members);
}

const ordinary1 = member("1");
const ordinary2 = member("2");
const membership1 = member("3", { member: true });
const membership2 = member("4", { member: true });
const paid = member("5", { paid: true });

assert.equal(price("2026-10-10", [ordinary1]).current_average_price_gbp, 185);
assert.equal(price("2026-10-10", [ordinary1, ordinary2]).current_average_price_gbp, 100);
assert.equal(price("2026-10-10", [ordinary1, membership1]).current_average_price_gbp, 100);
assert.equal(price("2026-10-10", [membership1, membership2]).current_average_price_gbp, 100);
assert.equal(price("2026-09-30", [ordinary1, membership1]).current_average_price_gbp, 105);
assert.equal(price("2026-10-01", [ordinary1, membership1]).current_average_price_gbp, 100);
assert.equal(price("2026-10-10", [ordinary1, member("6", { status: "closed" })]).current_passenger_count, 1);
assert.equal(price("2026-10-10", [ordinary1]).current_average_price_gbp, price("2026-10-10", [paid]).current_average_price_gbp);
assert.equal(price("2026-10-10", [member("7", { passengers: 2 }), ordinary2]).current_average_price_gbp, 75);
assert.equal(price("2026-10-10", [ordinary1, member("8", { terminal: "T3" })]).current_average_price_gbp, 115);

const financialBefore = JSON.stringify([membership1.transport_requests, paid.transport_requests]);
price("2026-09-30", [membership1, paid]);
price("2026-10-01", [membership1, paid]);
assert.equal(JSON.stringify([membership1.transport_requests, paid.transport_requests]), financialBefore);

console.log(JSON.stringify({
  authoritative_semantics: "current live group quote per passenger",
  september_two_passengers_gbp: 105,
  october_two_passengers_gbp: 100,
  membership_does_not_change_public_group_quote: true,
  payment_does_not_change_public_group_quote: true,
  financial_fields_unchanged: true
}));
