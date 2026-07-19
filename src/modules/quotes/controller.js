"use strict";
const service = require("./service");
function createController(deps) { return { list: (req, res) => service.list(deps.prisma, req.session.user, req.validatedQuery || {}, deps.project).then((page) => res.json(page)), get: (req, res) => service.get(deps.prisma, req.session.user, req.params.id, deps.project).then((item) => res.json({ item })) }; }
module.exports = { createController };
