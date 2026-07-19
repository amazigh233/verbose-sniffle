"use strict";

const payments = require("./service");

function idempotencyKey(req) {
  return req.get("idempotency-key");
}

function createPaymentController({ prisma }) {
  return {
    list: (req, res) => payments.list(prisma, req.validatedQuery || {}).then((value) => res.json(value)),
    get: (req, res) => payments.get(prisma, req.params.id).then((item) => res.json({ item })),
    history: (req, res) => payments.history(prisma, req.params.id).then((value) => res.json(value)),
    receipt: (req, res) => payments.receipt(prisma, req.params.number).then((item) => res.json({ item })),
    create: (req, res) => payments.create(prisma, req.session.user, req.body, idempotencyKey(req)).then((item) => res.status(201).json({ item })),
    addTenders: (req, res) => payments.addTenders(prisma, req.session.user, req.params.id, req.body, idempotencyKey(req)).then((item) => res.json({ item })),
    refund: (req, res) => payments.refund(prisma, req.session.user, req.params.id, req.body, idempotencyKey(req)).then((item) => res.status(201).json({ item })),
    cancel: (req, res) => payments.cancel(prisma, req.session.user, req.params.id, req.body, idempotencyKey(req)).then((item) => res.json({ item })),
    drawers: (_req, res) => payments.listDrawers(prisma).then((items) => res.json({ items })),
    createDrawer: (req, res) => payments.createDrawer(prisma, req.body).then((item) => res.status(201).json({ item })),
    openShift: (req, res) => payments.openShift(prisma, req.session.user, req.params.id, req.body).then((item) => res.status(201).json({ item })),
    listShifts: (req, res) => payments.listShifts(prisma, req.query || {}).then((items) => res.json({ items })),
    getShift: (req, res) => payments.getShift(prisma, req.params.id).then((item) => res.json({ item })),
    closeShift: (req, res) => payments.closeShift(prisma, req.session.user, req.params.id, req.body).then((item) => res.json({ item }))
  };
}

module.exports = { createPaymentController };
