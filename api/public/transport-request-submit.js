const { getSupabaseAdmin } = require("../_lib/supabase");
const { created, badRequest, parseJsonBody, methodNotAllowed, serverError } = require("../_lib/http");
const { mapRequestPayload } = require("../_lib/transport");
const { allocateOrderNumber } = require("../_lib/order-numbers");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    methodNotAllowed(res, ["POST"]);
    return;
  }

  try {
    const supabase = getSupabaseAdmin();
    const body = await parseJsonBody(req);
    const orderIdentity = await allocateOrderNumber(supabase, "pickup");

    let payload;
    try {
      payload = mapRequestPayload({
        ...body,
        status: "open"
      });
    } catch (error) {
      badRequest(res, error.message);
      return;
    }

    const { data, error } = await supabase
      .from("transport_requests")
      .insert({
        ...payload,
        order_no: orderIdentity.orderNo,
        order_type: orderIdentity.orderType,
        business_date: orderIdentity.businessDate
      })
      .select("id, order_no, order_type, business_date, created_at")
      .single();

    if (error) {
      throw error;
    }

    created(res, {
      id: data.id,
      orderNo: data.order_no,
      orderType: data.order_type,
      businessDate: data.business_date,
      createdAt: data.created_at
    });
  } catch (error) {
    serverError(res, error);
  }
};
