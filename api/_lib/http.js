function sendJson(res, status, payload) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
}

function ok(res, data) {
  sendJson(res, 200, { data, error: null });
}

function created(res, data) {
  sendJson(res, 201, { data, error: null });
}

function badRequest(res, message, details) {
  sendJson(res, 400, { data: null, error: { message, details: details || null } });
}

function unauthorized(res, message = "Unauthorized") {
  sendJson(res, 401, { data: null, error: { message } });
}

function methodNotAllowed(res, methods) {
  res.setHeader("Allow", methods.join(", "));
  sendJson(res, 405, { data: null, error: { message: "Method not allowed" } });
}

function serverError(res, error) {
  sendJson(res, 500, {
    data: null,
    error: {
      message: error && error.message ? error.message : "Unexpected server error"
    }
  });
}

function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";

    req.on("data", chunk => {
      raw += chunk;
    });

    req.on("end", () => {
      if (!raw) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(raw));
      } catch (error) {
        reject(new Error("Invalid JSON body"));
      }
    });

    req.on("error", reject);
  });
}

module.exports = {
  sendJson,
  ok,
  created,
  badRequest,
  unauthorized,
  methodNotAllowed,
  serverError,
  parseJsonBody
};
