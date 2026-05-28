(function () {
  const MEMBERSHIP_BENEFITS = [
    {
      type: "storage",
      title: "寄存权益",
      label: "寄存权益 storage",
      description: "最多抵扣 5 个标准箱基础寄存费用，最终金额由后台确认。"
    },
    {
      type: "pickup",
      title: "接机权益",
      label: "接机权益 pickup",
      description: "适用于会员接机服务，系统会在提交订单时由服务端识别会员优惠，最终金额由后台确认。"
    },
    {
      type: "moving",
      title: "搬家权益",
      label: "搬家权益 moving",
      description: "适用于基础搬家服务，选择后请联系客服安排时间和细节。该权益暂不走线上订单。"
    },
    {
      type: "welcome_pack",
      title: "新生大礼包",
      label: "新生大礼包 welcome_pack",
      description: "价值约 GBP 100，包含基础生活用品。选择后请联系客服确认领取或送达方式。"
    }
  ];
  const PUBLIC_MEMBERSHIP_BENEFIT_TYPES = MEMBERSHIP_BENEFITS.map(benefit => benefit.type);

  async function readJson(response) {
    const payload = await response.json().catch(() => ({ data: null, error: { message: "Unexpected response" } }));
    if (!response.ok) {
      throw new Error(payload.error && payload.error.message ? payload.error.message : "Request failed");
    }
    return payload.data;
  }

  function setMessage(node, text, type) {
    if (!node) {
      return;
    }
    node.textContent = text || "";
    node.className = "transport-form-message";
    if (type === "error") {
      node.classList.add("is-error");
    }
    if (type === "success") {
      node.classList.add("is-success");
    }
  }

  async function fetchProfile() {
    const response = await fetch("/api/auth/profile", {
      credentials: "include",
      headers: {
        Accept: "application/json"
      }
    });
    return readJson(response);
  }

  async function saveProfile(payload) {
    const response = await fetch("/api/auth/profile", {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      body: JSON.stringify(payload)
    });
    return readJson(response);
  }

  async function fetchMembership() {
    const response = await fetch("/api/public/membership-me", {
      credentials: "include",
      headers: {
        Accept: "application/json"
      }
    });
    return readJson(response);
  }

  async function selectMembershipBenefit(benefitType) {
    const response = await fetch("/api/public/membership-benefit-selection", {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      body: JSON.stringify({ benefit_type: benefitType })
    });
    return readJson(response);
  }

  function fillForm(form, user) {
    form.nickname.value = user.nickname || "";
    form.phone.value = user.phone || "";
    form.email.value = user.email || "";
    form.wechat_id.value = user.wechat_id || "";
    form.whatsapp_contact.value = user.whatsapp_contact || "";

    const wechatRadio = form.querySelector('input[name="contact_preference"][value="wechat"]');
    const whatsappRadio = form.querySelector('input[name="contact_preference"][value="whatsapp"]');
    const preference = user.contact_preference || "wechat";
    if (wechatRadio) {
      wechatRadio.checked = preference !== "whatsapp";
    }
    if (whatsappRadio) {
      whatsappRadio.checked = preference === "whatsapp";
    }

    syncContactFields(form);
  }

  function getSelectedContactPreference(form) {
    return form.querySelector('input[name="contact_preference"]:checked')?.value || "wechat";
  }

  function syncContactFields(form) {
    const contactPreference = getSelectedContactPreference(form);
    const wechatField = document.querySelector("#profileWechatField");
    const whatsappField = document.querySelector("#profileWhatsappField");

    if (wechatField) {
      wechatField.hidden = false;
    }
    if (whatsappField) {
      whatsappField.hidden = contactPreference !== "whatsapp";
    }

    if (form.wechat_id) {
      form.wechat_id.required = true;
      form.wechat_id.setCustomValidity("");
    }
    if (form.whatsapp_contact) {
      form.whatsapp_contact.required = contactPreference === "whatsapp";
      if (contactPreference !== "whatsapp") {
        form.whatsapp_contact.setCustomValidity("");
      }
    }
  }

  function validateForm(form) {
    const contactPreference = getSelectedContactPreference(form);
    const contactInputs = form.querySelectorAll('input[name="contact_preference"]');
    const contactValidityMessage = contactPreference ? "" : "请选择偏好的联系方式。";

    form.nickname.setCustomValidity(form.nickname.value.trim() ? "" : "请填写姓名。");
    form.phone.setCustomValidity(form.phone.value.trim() ? "" : "请填写手机号。");
    form.wechat_id.setCustomValidity(form.wechat_id.value.trim() ? "" : "请填写微信号。");
    contactInputs.forEach(input => input.setCustomValidity(contactValidityMessage));

    if (form.whatsapp_contact) {
      form.whatsapp_contact.setCustomValidity(
        contactPreference === "whatsapp" && !form.whatsapp_contact.value.trim()
          ? "如果选择 WhatsApp，请补充 WhatsApp 联系方式。"
          : ""
      );
    }

    return form.reportValidity();
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function getBenefitLabel(type) {
    const benefit = MEMBERSHIP_BENEFITS.find(item => item.type === type);
    return benefit ? benefit.title : type || "--";
  }

  function formatMoney(value) {
    if (value === null || value === undefined || value === "") {
      return "--";
    }
    const number = Number(value);
    return Number.isFinite(number) ? `GBP ${number.toFixed(2)}` : String(value);
  }

  function pickupBenefitStandardText(claim) {
    const rules = claim?.discount_breakdown_json?.rules || {};
    if (rules.matchedFreeMonth && rules.matchedFreeAirport) {
      return "9 月 LHR / LGW 接机基础服务免费，额外费用以客服确认为准";
    }
    return "非 9 月或其他接机时间按会员接机权益优惠 GBP 100，最终金额以客服确认为准";
  }

  function detailRow(label, value) {
    return `
      <div>
        <strong>${escapeHtml(value || "--")}</strong>
        <span>${escapeHtml(label)}</span>
      </div>
    `;
  }

  function renderBenefitCards() {
    return MEMBERSHIP_BENEFITS.map(benefit => `
      <button class="profile-membership-benefit" type="button" data-membership-benefit="${escapeHtml(benefit.type)}">
        <strong>${escapeHtml(benefit.label)}</strong>
        <span>${escapeHtml(benefit.description)}</span>
      </button>
    `).join("");
  }

  function renderMembershipState(state) {
    const statusNode = document.querySelector("#profileMembershipStatus");
    const bodyNode = document.querySelector("#profileMembershipBody");
    if (!statusNode || !bodyNode) {
      return;
    }

    const claim = state?.claim || null;

    if (!state?.isMember) {
      statusNode.textContent = "非会员";
      statusNode.className = "profile-membership-status is-muted";
      bodyNode.innerHTML = `
        <p>您当前还不是 2026-27 NGN 会员。</p>
        <p>如您已通过 NGN 完成订房，请联系客服为您开通会员权益。</p>
      `;
      return;
    }

    statusNode.textContent = "2026-27 NGN 会员";
    statusNode.className = "profile-membership-status is-active";

    if (!claim) {
      bodyNode.innerHTML = `
        <p>您是 2026-27 NGN 会员。</p>
        <p>请选择一个会员权益。</p>
        <div class="profile-membership-benefits">
          ${renderBenefitCards()}
        </div>
        <p class="field-help">每位会员只能选择一个主要权益。选择后不能自行更换，如需修改请联系客服。</p>
      `;
      return;
    }

    if (claim.status === "cancelled") {
      statusNode.textContent = "权益已作废";
      bodyNode.innerHTML = "<p>权益已作废，请联系客服。</p>";
      return;
    }

    if (claim.status === "selected" && claim.benefit_type === "storage") {
      bodyNode.innerHTML = `
        <p>您已选择：寄存权益</p>
        <p>当前状态：已选择，尚未绑定订单。</p>
        <p>请前往寄存页面提交订单，系统会自动识别您的会员权益。</p>
        <a class="button button-primary" href="./storage.html">前往寄存服务</a>
      `;
      return;
    }

    if (claim.status === "selected" && claim.benefit_type === "pickup") {
      bodyNode.innerHTML = `
        <p>您已选择：接机权益</p>
        <p>当前状态：已选择，尚未绑定订单。</p>
        <p>会员接机权益标准：9 月 LHR / LGW 接机基础服务免费；其他接机时间按会员权益优惠 GBP 100，最终金额以客服确认为准。</p>
        <p>请前往接机页面提交订单，系统会自动识别您的会员权益。</p>
        <a class="button button-primary" href="./pickup-form.html">前往接机服务</a>
      `;
      return;
    }

    if (claim.status === "selected" && claim.benefit_type === "moving") {
      bodyNode.innerHTML = `
        <p>您已选择：搬家权益</p>
        <p>当前状态：已选择，等待客服安排。</p>
        <p>请联系客服确认搬家时间、地址、箱数和服务细节。</p>
      `;
      return;
    }

    if (claim.status === "selected" && claim.benefit_type === "welcome_pack") {
      bodyNode.innerHTML = `
        <p>您已选择：新生大礼包</p>
        <p>当前状态：已选择，等待客服确认。</p>
        <p>请联系客服确认领取或送达方式。</p>
      `;
      return;
    }

    if (claim.status === "reserved") {
      statusNode.textContent = "权益已绑定订单";
      bodyNode.innerHTML = `
        <p>当前状态：已绑定订单 / 待服务完成</p>
        <div class="profile-membership-summary">
          ${detailRow("绑定订单号", claim.linked_order_no)}
          ${claim.benefit_type === "pickup" ? detailRow("接机权益标准", pickupBenefitStandardText(claim)) : ""}
          ${detailRow("会员抵扣", formatMoney(claim.membership_discount_amount))}
          ${detailRow("额外费用", formatMoney(claim.extra_charge_amount))}
          ${detailRow("最终价格", formatMoney(claim.final_price))}
        </div>
      `;
      return;
    }

    if (claim.status === "used") {
      statusNode.textContent = "权益已使用";
      bodyNode.innerHTML = `
        <p>权益已使用 / 已完成。</p>
        <div class="profile-membership-summary">
          ${detailRow("已使用权益", getBenefitLabel(claim.benefit_type))}
          ${claim.linked_order_no ? detailRow("绑定订单号", claim.linked_order_no) : ""}
        </div>
      `;
      return;
    }

    bodyNode.innerHTML = `
      <p>您已选择：${escapeHtml(getBenefitLabel(claim.benefit_type))}</p>
      <p>当前状态：${escapeHtml(claim.status || "--")}</p>
      <p class="field-help">权益选择后不能自行取消或更换。如需处理，请联系客服。</p>
    `;
  }

  async function loadMembershipState() {
    const statusNode = document.querySelector("#profileMembershipStatus");
    const bodyNode = document.querySelector("#profileMembershipBody");
    const messageNode = document.querySelector("#profileMembershipMessage");
    if (!statusNode || !bodyNode) {
      return;
    }

    setMessage(messageNode, "");
    statusNode.textContent = "读取中";
    bodyNode.innerHTML = '<p class="field-help">正在读取会员权益状态...</p>';
    try {
      const state = await fetchMembership();
      renderMembershipState(state);
    } catch (error) {
      statusNode.textContent = "读取失败";
      statusNode.className = "profile-membership-status is-muted";
      bodyNode.innerHTML = "<p>会员状态暂时无法读取，请稍后刷新重试。</p>";
      setMessage(messageNode, error.message || "会员状态读取失败", "error");
    }
  }

  async function initProfilePage() {
    const form = document.querySelector("#profileForm");
    if (!form) {
      return;
    }

    const messageNode = document.querySelector("#profileFormMessage");
    const saveButton = document.querySelector("#profileSaveButton");
    const membershipBody = document.querySelector("#profileMembershipBody");

    form.addEventListener("change", event => {
      if (event.target instanceof HTMLInputElement && event.target.name === "contact_preference") {
        syncContactFields(form);
      }
    });

    try {
      const user = await fetchProfile();
      fillForm(form, user);
      loadMembershipState();
    } catch (error) {
      setMessage(messageNode, error.message || "资料读取失败，请稍后重试。", "error");
      return;
    }

    membershipBody?.addEventListener("click", async event => {
      const button = event.target.closest("[data-membership-benefit]");
      if (!button) {
        return;
      }
      const benefitType = button.getAttribute("data-membership-benefit");
      if (!PUBLIC_MEMBERSHIP_BENEFIT_TYPES.includes(benefitType)) {
        return;
      }
      const confirmed = window.confirm("每位会员只能选择一个主要权益。选择后不能自行更换，如需修改请联系客服。是否确认选择？");
      if (!confirmed) {
        return;
      }
      const membershipMessage = document.querySelector("#profileMembershipMessage");
      const buttons = membershipBody.querySelectorAll("[data-membership-benefit]");
      buttons.forEach(item => {
        item.disabled = true;
      });
      setMessage(membershipMessage, "正在提交会员权益选择...");
      try {
        await selectMembershipBenefit(benefitType);
        setMessage(membershipMessage, "会员权益已选择。", "success");
        await loadMembershipState();
      } catch (error) {
        setMessage(membershipMessage, error.message || "会员权益选择失败，请联系客服。", "error");
      } finally {
        buttons.forEach(item => {
          item.disabled = false;
        });
      }
    });

    form.addEventListener("submit", async event => {
      event.preventDefault();
      syncContactFields(form);

      if (!validateForm(form)) {
        setMessage(messageNode, "请先填写完整必填资料。", "error");
        return;
      }

      if (saveButton) {
        saveButton.disabled = true;
      }
      setMessage(messageNode, "正在保存资料...");

      try {
        const updatedUser = await saveProfile({
          nickname: form.nickname.value,
          phone: form.phone.value,
          contact_preference: getSelectedContactPreference(form),
          wechat_id: form.wechat_id.value,
          whatsapp_contact: form.whatsapp_contact ? form.whatsapp_contact.value : ""
        });
        fillForm(form, updatedUser);
        if (window.SiteAuth) {
          await window.SiteAuth.getSession(true);
        }
        setMessage(messageNode, "资料已保存。", "success");
      } catch (error) {
        setMessage(messageNode, error.message || "资料保存失败，请稍后重试。", "error");
      } finally {
        if (saveButton) {
          saveButton.disabled = false;
        }
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initProfilePage);
  } else {
    initProfilePage();
  }
})();
