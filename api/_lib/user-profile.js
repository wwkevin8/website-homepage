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
    missingFields.push("濮撳悕");
  }
  if (!hasPhone) {
    missingFields.push("鎵嬫満鍙?");
  }
  if (!hasWechat) {
    missingFields.push("寰俊鍙?");
  }
  if (!hasEmailVerified) {
    missingFields.push("閭楠岃瘉");
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
