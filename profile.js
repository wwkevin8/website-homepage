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

  async function initProfilePage() {
    const form = document.querySelector("#profileForm");
    if (!form) {
      return;
    }

    const messageNode = document.querySelector("#profileFormMessage");
    const saveButton = document.querySelector("#profileSaveButton");

    form.addEventListener("change", event => {
      if (event.target instanceof HTMLInputElement && event.target.name === "contact_preference") {
        syncContactFields(form);
      }
    });

    try {
      const user = await fetchProfile();
      fillForm(form, user);
    } catch (error) {
      setMessage(messageNode, error.message || "资料读取失败，请稍后重试。", "error");
      return;
    }

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
