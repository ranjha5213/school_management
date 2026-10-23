const apiResponse = (res, status, success, message, data = null) => {
  const body = { success, message };
  if (data !== null) body.data = data;
  return res.status(status).json(body);
};

const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

const todayISO = () => new Date().toISOString().slice(0, 10);

module.exports = { apiResponse, asyncHandler, todayISO };
