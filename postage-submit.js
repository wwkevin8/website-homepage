(function () {
  const SUPPORT_WECHAT = "NOTTINGHAMNGN";
  const form = document.querySelector("[data-postage-form]");
  if (!form) return;

  const message = document.querySelector("[data-postage-message]");
  const submitButton = document.querySelector("[data-submit-button]");
  const successPanel = document.querySelector("[data-postage-success]");
  const successOrderNo = document.querySelector("[data-success-order-no]");
  const successEmailNote = document.querySelector("[data-success-email-note]");
  const boxDeliverySection = document.querySelector("[data-box-delivery-section]");
  const boxAddressFields = document.querySelector("[data-box-address-fields]");
  const sameAddress = document.querySelector("[data-same-address]");
  const sensitiveWarning = document.querySelector("[data-sensitive-warning]");

  function setMessage(text, isError) {
    if (!message) return;
    message.textContent = text || "";
    message.classList.toggle("is-error", Boolean(isError));
    message.hidden = !text;
  }

  function field(name) {
    return form.elements[name];
  }

  function setField(name, value) {
    const input = field(name);
    if (input && value) input.value = value;
  }

  function checkedValues(name) {
    return [...form.querySelectorAll(`input[name="${name}"]:checked`)].map(input => input.value);
  }

  function hasBoxDeliveryNeed() {
    return Boolean(
      field("need_boxes")?.checked ||
      field("need_packing_materials")?.checked ||
      String(field("box_type")?.value || "").trim() ||
      String(field("packing_materials")?.value || "").trim()
    );
  }

  function syncBoxDelivery() {
    const visible = hasBoxDeliveryNeed();
    if (boxDeliverySection) boxDeliverySection.hidden = !visible;
    if (visible && field("need_box_delivery")) field("need_box_delivery").checked = true;
    if (boxAddressFields && sameAddress) boxAddressFields.hidden = sameAddress.checked;
  }

  function syncSensitiveWarning() {
    const checkedSensitive = Boolean(form.querySelector("[data-sensitive-item]:checked") || field("has_sensitive_items")?.checked);
    if (sensitiveWarning) sensitiveWarning.hidden = !checkedSensitive;
  }

  function buildPayload() {
    const boxType = String(field("box_type")?.value || "").trim();
    if (boxType === "2号箱子") throw new Error("2号箱子暂时没货，不能选择。");
    const payload = {
      customer_name: field("customer_name")?.value,
      wechat_id: field("wechat_id")?.value,
      phone: field("phone")?.value,
      email: field("email")?.value,
      service_type: field("service_type")?.value,
      preferred_route: field("preferred_route")?.value,
      box_count: field("box_count")?.value,
      single_box_weight: field("single_box_weight")?.value,
      different_box_weights: field("different_box_weights")?.checked,
      need_boxes: field("need_boxes")?.checked,
      box_type: boxType,
      need_packing_materials: field("need_packing_materials")?.checked,
      packing_materials: field("packing_materials")?.value,
      item_types: checkedValues("item_types"),
      has_sensitive_items: field("has_sensitive_items")?.checked,
      user_note: field("user_note")?.value,
      need_box_delivery: field("need_box_delivery")?.checked && hasBoxDeliveryNeed(),
      box_delivery_same_as_pickup: field("box_delivery_same_as_pickup")?.checked,
      box_delivery_address: field("box_delivery_address")?.value,
      box_delivery_postcode: field("box_delivery_postcode")?.value,
      box_delivery_building: field("box_delivery_building")?.value,
      box_delivery_room: field("box_delivery_room")?.value,
      box_delivery_need_upstairs: field("box_delivery_need_upstairs")?.checked,
      box_delivery_has_lift: field("box_delivery_has_lift")?.checked,
      preferred_box_delivery_date: field("preferred_box_delivery_date")?.value,
      preferred_box_delivery_time_slot: field("preferred_box_delivery_time_slot")?.value,
      box_delivery_note: field("box_delivery_note")?.value,
      need_pickup: field("need_pickup")?.checked,
      pickup_address: field("pickup_address")?.value,
      pickup_postcode: field("pickup_postcode")?.value,
      pickup_building: field("pickup_building")?.value,
      pickup_room: field("pickup_room")?.value,
      pickup_need_upstairs: field("pickup_need_upstairs")?.checked,
      pickup_has_lift: field("pickup_has_lift")?.checked,
      preferred_pickup_date: field("preferred_pickup_date")?.value,
      preferred_pickup_time_slot: field("preferred_pickup_time_slot")?.value,
      pickup_note: field("pickup_note")?.value,
      recipient_country: field("recipient_country")?.value,
      recipient_city: field("recipient_city")?.value,
      recipient_name: field("recipient_name")?.value,
      recipient_phone: field("recipient_phone")?.value,
      recipient_address: field("recipient_address")?.value,
      risk_confirmed: field("risk_confirmed")?.checked
    };
    if (payload.box_delivery_same_as_pickup) {
      payload.box_delivery_address = payload.pickup_address;
      payload.box_delivery_postcode = payload.pickup_postcode;
      payload.box_delivery_building = payload.pickup_building;
      payload.box_delivery_room = payload.pickup_room;
    }
    return payload;
  }

  function validate(payload) {
    if (!String(payload.customer_name || "").trim()) throw new Error("请填写姓名。");
    if (!String(payload.wechat_id || "").trim() && !String(payload.phone || "").trim()) throw new Error("请至少填写微信号或手机号。");
    if (!String(payload.service_type || "").trim()) throw new Error("请选择服务类型。");
    if (Number(payload.box_count) < 1) throw new Error("预计箱数必须大于等于 1。");
    if (payload.single_box_weight && Number(payload.single_box_weight) <= 0) throw new Error("预计单箱重量必须大于 0。");
    if (!payload.risk_confirmed) throw new Error("请先勾选风险确认。");
  }

  async function submit(event) {
    event.preventDefault();
    setMessage("", false);
    let payload;
    try {
      payload = buildPayload();
      validate(payload);
    } catch (error) {
      setMessage(error.message, true);
      return;
    }

    submitButton.disabled = true;
    submitButton.textContent = "提交中...";
    try {
      const response = await fetch("/api/public/postage-order-submit", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(payload)
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error?.message || "提交失败，请稍后再试。");
      const order = body?.data || {};
      if (successOrderNo) successOrderNo.textContent = order.order_no || order.orderNo || "--";
      if (successEmailNote) {
        successEmailNote.textContent = order.customerEmail?.ok
          ? "确认邮件已发送，请留意邮箱并添加客服微信。"
          : "需求已保存；如果确认邮件暂时没有收到，请直接添加客服微信。";
      }
      form.hidden = true;
      if (successPanel) successPanel.hidden = false;
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (error) {
      setMessage(error.message || "提交失败，请稍后再试。", true);
    } finally {
      submitButton.disabled = false;
      submitButton.textContent = "提交邮寄需求";
    }
  }

  async function hydrateProfile() {
    const session = await window.SiteAuth?.getSession?.();
    const user = session?.user || {};
    setField("customer_name", user.nickname || "");
    setField("wechat_id", user.wechat_id || "");
    setField("phone", user.phone || "");
    setField("email", user.email || "");
  }

  document.querySelectorAll("[data-toggle-box-delivery]").forEach(node => {
    node.addEventListener("change", syncBoxDelivery);
    node.addEventListener("input", syncBoxDelivery);
  });
  sameAddress?.addEventListener("change", syncBoxDelivery);
  form.querySelectorAll("[data-sensitive-item], [data-sensitive-manual]").forEach(node => node.addEventListener("change", syncSensitiveWarning));
  document.querySelector("[data-copy-support-wechat]")?.addEventListener("click", async () => {
    await navigator.clipboard?.writeText(SUPPORT_WECHAT).catch(() => {});
  });
  form.addEventListener("submit", submit);
  syncBoxDelivery();
  syncSensitiveWarning();
  hydrateProfile();
})();
