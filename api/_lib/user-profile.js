function normalizeText(value) {
  return String(value || "").trim();
}

function getProfileCompletionState(user) {
  const nickname = normalizeText(user && user.nickname);
  const phone = normalizeText(user && user.phone);
  const wechatId = normalizeText(user && user.wechat_id);
  const emailVerifiedAt = normalizeText(user && user.email_verified_at);

  const hasName = Boolean(nickname);
  const hasPhone = Boolean(phone);
  const hasWechat = Boolean(wechatId);
  const hasEmailVerified = Boolean(emailVerifiedAt);

  const missingFields = [];
  if (!hasName) {
    missingFields.push("姓名");
  }
  if (!hasPhone) {
    missingFields.push("手机号");
  }
  if (!hasWechat) {
    missingFields.push("微信号");
  }
  if (!hasEmailVerified) {
    missingFields.push("邮箱验证");
  }

  return {
    hasName,
    hasPhone,
    hasWechat,
    hasEmailVerified,
    isComplete: missingFields.length === 0,
    missingFields,
    contactPreference: "wechat",
    contactHandle: wechatId
  };
}

module.exports = {
  getProfileCompletionState
};
