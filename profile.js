(function () {
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
    const response = await fetch("/api/public/membership/me", {
      credentials: "include",
      headers: {
        Accept: "application/json"
      }
    });
    return readJson(response);
  }

  async function selectMembershipBenefit(benefitType) {
    const response = await fetch("/api/public/membership/benefit-selection", {
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
    if (type === "storage") {
      return "会员寄存权益";
    }
    if (type === "pickup") {
      return "会员接机权益";
    }
    return type || "--";
  }

  function renderMembershipState(state) {
    const statusNode = document.querySelector("#profileMembershipStatus");
    const bodyNode = document.querySelector("#profileMembershipBody");
    if (!statusNode || !bodyNode) {
      return;
    }

    const entitlement = state?.entitlement || null;
    const claim = state?.claim || null;

    if (!state?.isMember || !entitlement) {
      statusNode.textContent = "非会员";
      statusNode.className = "profile-membership-status is-muted";
      bodyNode.innerHTML = `
        <p>当前不是 NGN 会员，如已通过 NGN 订房请联系客服开通会员权益。</p>
        <p class="field-help">会员资格第一版由后台人工开通，登录账号本身不等于会员资格。</p>
      `;
      return;
    }

    if (claim) {
      statusNode.textContent = claim.status || "已选择";
      statusNode.className = "profile-membership-status is-active";
      bodyNode.innerHTML = `
        <div class="profile-membership-summary">
          <div>
            <strong>${escapeHtml(getBenefitLabel(claim.benefit_type))}</strong>
            <span>已选择项目</span>
          </div>
          <div>
            <strong>${escapeHtml(claim.status || "--")}</strong>
            <span>当前状态</span>
          </div>
          <div>
            <strong>${escapeHtml(claim.linked_order_no || "--")}</strong>
            <span>绑定订单号</span>
          </div>
        </div>
        <p class="field-help">权益选择后不能自行取消或更换。如需处理，请联系客服。</p>
      `;
      return;
    }

    statusNode.textContent = "会员未选择";
    statusNode.className = "profile-membership-status is-active";
    bodyNode.innerHTML = `
      <div class="profile-membership-benefits">
        <button class="profile-membership-benefit" type="button" data-membership-benefit="storage">
          <strong>会员寄存权益</strong>
          <span>最多抵扣 5 个标准箱基础寄存费用，额外费用由后台确认。</span>
        </button>
        <button class="profile-membership-benefit" type="button" data-membership-benefit="pickup">
          <strong>会员接机权益</strong>
          <span>仅适用于 pickup，不适用于 dropoff；具体抵扣由服务端判断。</span>
        </button>
      </div>
      <p class="field-help">其他权益请联系客服处理。选择后会锁定，不能自行更换。</p>
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
      if (!benefitType) {
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
