(function () {
  const IMAGE_CATEGORIES = new Set(["second_hand", "sublet"]);
  const MAX_IMAGE_SIZE = 2 * 1024 * 1024;
  const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

  function setMessage(node, text, type) {
    if (!node) {
      return;
    }
    node.textContent = text || "";
    node.className = "community-message";
    if (type) {
      node.classList.add(`is-${type}`);
    }
  }

  async function request(url, options = {}) {
    const response = await fetch(url, {
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      ...options
    });
    const payload = await response.json().catch(() => ({ data: null, error: { message: "服务器响应异常" } }));
    if (!response.ok) {
      throw new Error(payload.error?.message || "请求失败");
    }
    return payload.data;
  }

  async function uploadToSignedUrl(upload, file) {
    const response = await fetch(upload.signed_upload_url, {
      method: "PUT",
      headers: {
        "Content-Type": file.type,
        "cache-control": "max-age=3600",
        "x-upsert": "false"
      },
      body: file
    });
    if (!response.ok) {
      throw new Error("图片上传失败，请稍后再试。");
    }
  }

  function validateImages(files) {
    const list = Array.from(files || []);
    if (list.length > 3) {
      throw new Error("每个帖子最多上传 3 张图片。");
    }
    for (const file of list) {
      if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
        throw new Error("图片仅支持 jpg、jpeg、png、webp。");
      }
      if (file.size > MAX_IMAGE_SIZE) {
        throw new Error("每张图片最大 2MB。");
      }
    }
    return list;
  }

  function syncCategoryFields(form) {
    const category = form.category.value;
    const imageField = document.querySelector("[data-image-field]");
    const priceField = document.querySelector("[data-price-field]");
    const textarea = form.content;
    const max = category === "help" ? 300 : 200;
    textarea.maxLength = max;
    textarea.placeholder = `请勿公开联系方式、外链或隐私信息，最多 ${max} 字。`;
    if (imageField) {
      imageField.hidden = !IMAGE_CATEGORIES.has(category);
    }
    if (priceField) {
      priceField.hidden = category === "buddy" || category === "help";
    }
  }

  function collectPayload(form) {
    return {
      category: form.category.value,
      title: form.title.value.trim(),
      content: form.content.value.trim(),
      city: form.city.value.trim(),
      university: form.university.value.trim(),
      area: form.area.value.trim(),
      price: form.price.value,
      contact_wechat: form.contact_wechat.value.trim(),
      contact_phone: form.contact_phone.value.trim(),
      contact_email: form.contact_email.value.trim()
    };
  }

  async function ensureLoggedIn(messageNode) {
    const session = window.SiteAuth ? await window.SiteAuth.getSession() : { authenticated: false };
    if (session.authenticated) {
      return true;
    }
    setMessage(messageNode, "请先登录后发布信息。", "error");
    if (window.SiteAuth) {
      await window.SiteAuth.requireLogin({
        returnTo: `${window.location.pathname}${window.location.search}${window.location.hash}`
      });
    }
    return false;
  }

  async function uploadImages(postId, files, messageNode) {
    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];
      setMessage(messageNode, `正在上传图片 ${index + 1}/${files.length}...`);
      const uploadData = await request("/api/public/community-image-upload", {
        method: "POST",
        body: JSON.stringify({
          post_id: postId,
          file_name: file.name,
          file_type: file.type
        })
      });
      const upload = uploadData.upload;
      await uploadToSignedUrl(upload, file);
      await request("/api/public/community-image-finalize", {
        method: "POST",
        body: JSON.stringify({
          post_id: postId,
          storage_path: upload.storage_path,
          file_type: file.type
        })
      });
    }
  }

  async function initSubmitPage() {
    const form = document.querySelector("[data-community-submit-form]");
    if (!form) {
      return;
    }
    const messageNode = document.querySelector("[data-community-submit-message]");
    const submitButton = document.querySelector("[data-submit-button]");

    syncCategoryFields(form);
    form.category.addEventListener("change", () => syncCategoryFields(form));

    if (!(await ensureLoggedIn(messageNode))) {
      form.querySelectorAll("input, textarea, select, button").forEach(node => {
        node.disabled = true;
      });
      return;
    }

    form.addEventListener("submit", async event => {
      event.preventDefault();
      if (!form.reportValidity()) {
        return;
      }
      if (!form.disclaimer.checked) {
        setMessage(messageNode, "请先勾选免责声明。", "error");
        return;
      }

      const category = form.category.value;
      const files = IMAGE_CATEGORIES.has(category) ? validateImages(form.images.files) : [];
      if (!IMAGE_CATEGORIES.has(category) && form.images.files.length) {
        setMessage(messageNode, "该分类暂不支持上传图片。", "error");
        return;
      }

      submitButton.disabled = true;
      setMessage(messageNode, "正在发布...");
      try {
        const data = await request("/api/public/community-posts", {
          method: "POST",
          body: JSON.stringify(collectPayload(form))
        });
        const post = data.post;
        if (files.length) {
          await uploadImages(post.id, files, messageNode);
        }
        setMessage(messageNode, "发布成功。请注意，违规内容、联系方式公开、广告或被举报内容可能会被隐藏或删除。", "success");
        window.setTimeout(() => {
          window.location.href = `/community-post/${encodeURIComponent(post.id)}`;
        }, 900);
      } catch (error) {
        setMessage(messageNode, error.message || "发布失败，请检查内容后重试。", "error");
      } finally {
        submitButton.disabled = false;
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initSubmitPage);
  } else {
    initSubmitPage();
  }
})();
