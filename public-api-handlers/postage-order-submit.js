const { getSupabaseAdmin } = require("../api/_lib/supabase");
const { badRequest, created, methodNotAllowed, parseJsonBody, serverError, unauthorized } = require("../api/_lib/http");
const { getAuthenticatedUser } = require("../api/_lib/user-auth");
const {
  allocatePostageOrderNumber,
  formatPostageOrder,
  mapPostageOrderSubmission
} = require("../api/_lib/postage-orders");
const { sendPostageStudentConfirmationEmail } = require("../api/_lib/postage-order-notifier");

async function logPostageOrder(supabase, orderId, action, afterValue) {
  await supabase.from("postage_order_logs").insert({
    postage_order_id: orderId,
    action,
    after_value: afterValue || null
  });
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    methodNotAllowed(res, ["POST"]);
    return;
  }

  try {
    const supabase = getSupabaseAdmin();
    const siteUser = await getAuthenticatedUser(req, supabase);
    if (!siteUser) {
      unauthorized(res, "请先登录，再提交邮寄需求。");
      return;
    }

    const body = await parseJsonBody(req);
    let payload;
    try {
      payload = mapPostageOrderSubmission({ ...body }, siteUser);
    } catch (error) {
      badRequest(res, error.message);
      return;
    }

    const identity = await allocatePostageOrderNumber(supabase);
    const { data: order, error } = await supabase
      .from("postage_orders")
      .insert({
        ...payload,
        order_no: identity.orderNo
      })
      .select("*")
      .single();

    if (error) throw error;

    await logPostageOrder(supabase, order.id, "postage_order_created", {
      order_no: order.order_no,
      user_id: order.user_id,
      status: order.status
    }).catch(logError => {
      console.warn("[postage] failed to write create log", logError);
    });

    let customerEmail = null;
    try {
      customerEmail = await sendPostageStudentConfirmationEmail(req, {
        order,
        recipientEmail: order.email || siteUser.email
      });
      await supabase
        .from("postage_orders")
        .update({
          customer_email_status: customerEmail.skipped ? "skipped" : "sent",
          customer_email_error: customerEmail.skipped ? customerEmail.reason : null,
          customer_email_sent_at: customerEmail.skipped ? null : new Date().toISOString()
        })
        .eq("id", order.id);
    } catch (emailError) {
      customerEmail = {
        ok: false,
        skipped: false,
        error: emailError?.message || "Failed to send postage confirmation email"
      };
      await supabase
        .from("postage_orders")
        .update({
          customer_email_status: "failed",
          customer_email_error: customerEmail.error,
          customer_email_sent_at: null
        })
        .eq("id", order.id);
    }

    created(res, {
      ...formatPostageOrder(order),
      customerEmail
    });
  } catch (error) {
    serverError(res, error);
  }
};
