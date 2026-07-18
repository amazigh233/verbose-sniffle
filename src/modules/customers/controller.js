"use strict";
const service = require("./service");
function createController(deps) { return { list: (req, res) => service.list(deps.prisma, req.session.user, req.validatedQuery || {}, deps.project).then((page) => res.json(page)) }; }
module.exports = { createController };
