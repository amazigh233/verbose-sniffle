"use strict";

const { identifier, validate, z } = require("../../shared/validation");

const login = validate({ body: z.object({ username: identifier.max(100), password: z.string().min(1).max(1024) }).strict() });
const updateProfile = validate({ body: z.object({ username: identifier.max(100).optional(), email: z.union([z.literal(""), z.email().max(254)]).optional(), currentPassword: z.string().max(1024).optional(), newPassword: z.string().max(1024).optional() }).strict() });

module.exports = { login, updateProfile };
