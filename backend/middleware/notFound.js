const { apiResponse } = require('../utils/helpers');

module.exports = (req, res) => apiResponse(res, 404, false, `Not found: ${req.originalUrl}`);
