"use strict";

const publicApiHandler = require("../[...action]");

module.exports = async function membershipPublicRoute(req, res) {
  const action = String(req.query?.action || "").trim();
  req.query = { ...(req.query || {}), action: `membership/${action}` };
  return publicApiHandler(req, res);
};
