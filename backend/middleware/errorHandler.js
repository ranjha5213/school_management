const logger = require('../utils/logger');
const { apiResponse } = require('../utils/helpers');

const errorHandler = (err, req, res, _next) => {
  logger.error(`${req.method} ${req.originalUrl} :: ${err.message}\n${err.stack || ''}`);
  const status = err.status || 500;
  return apiResponse(res, status, false, err.message || 'Server error');
};

module.exports = errorHandler;
