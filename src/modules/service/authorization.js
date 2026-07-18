"use strict";

const READ_ROLES = ["admin", "execution", "installer", "finance", "crm"];
const MANAGE_ROLES = ["admin", "execution"];
const VISIT_WRITE_ROLES = ["admin", "execution", "installer"];
const INVOICE_ROLES = ["admin", "execution", "finance"];

module.exports = { INVOICE_ROLES, MANAGE_ROLES, READ_ROLES, VISIT_WRITE_ROLES };
