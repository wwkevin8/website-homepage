function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

async function upsertSiteUserByEmail(supabase, email) {
  const normalizedEmail = normalizeEmail(email);
  const nickname = normalizedEmail.split("@")[0] || "user";

  const { data, error } = await supabase
    .from("site_users")
    .upsert(
      {
        email: normalizedEmail,
        nickname
      },
      { onConflict: "email" }
    )
    .select("id, email, wechat_openid, nickname, avatar_url, phone, first_login_at, last_login_at, last_login_provider, login_count, created_at")
    .single();

  if (error) {
    throw error;
  }

  return data;
}

async function upsertSiteUserProfile(supabase, profile) {
  const email = normalizeEmail(profile && profile.email);
  if (!email) {
    throw new Error("A valid email is required");
  }

  const nickname =
    (profile && profile.nickname ? String(profile.nickname).trim() : "") ||
    email.split("@")[0] ||
    "user";

  const avatarUrl = profile && profile.avatar_url ? String(profile.avatar_url).trim() : null;

  const { data, error } = await supabase
    .from("site_users")
    .upsert(
      {
        email,
        nickname: nickname || null,
        avatar_url: avatarUrl || null
      },
      { onConflict: "email" }
    )
    .select("id, email, wechat_openid, nickname, avatar_url, phone, first_login_at, last_login_at, last_login_provider, login_count, created_at")
    .single();

  if (error) {
    throw error;
  }

  return data;
}

module.exports = {
  normalizeEmail,
  upsertSiteUserByEmail,
  upsertSiteUserProfile
};
