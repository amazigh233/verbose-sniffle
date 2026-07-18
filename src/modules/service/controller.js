"use strict";

const service = require("./service");

function createServiceController({ prisma, config, objectStorage }) {
  return {
    dashboard: (req, res) => service.dashboard(prisma, req.session.user).then((value) => res.json(value)),
    bootstrap: (req, res) => service.bootstrap(prisma, req.session.user, req.query || {}).then((value) => res.json(value)),
    createEquipment: (req, res) => service.saveEquipment(prisma, req.session.user, null, req.body || {}).then((item) => res.status(201).json({ item })),
    updateEquipment: (req, res) => service.saveEquipment(prisma, req.session.user, req.params.id, req.body || {}).then((item) => res.json({ item })),
    createContract: (req, res) => service.saveContract(prisma, req.session.user, null, req.body || {}).then((item) => res.status(201).json({ item })),
    updateContract: (req, res) => service.saveContract(prisma, req.session.user, req.params.id, req.body || {}).then((item) => res.json({ item })),
    createRequest: (req, res) => service.saveRequest(prisma, req.session.user, null, req.body || {}).then((item) => res.status(201).json({ item })),
    updateRequest: (req, res) => service.saveRequest(prisma, req.session.user, req.params.id, req.body || {}).then((item) => res.json({ item })),
    availability: (req, res) => service.availability(prisma, req.query || {}).then((items) => res.json({ items })),
    createVisit: (req, res) => service.saveVisit(prisma, req.session.user, null, req.body || {}).then((item) => res.status(201).json({ item })),
    updateVisit: (req, res) => service.saveVisit(prisma, req.session.user, req.params.id, req.body || {}).then((item) => res.json({ item })),
    createInvoice: (req, res) => service.createInvoice(prisma, req.session.user, req.params.id).then((item) => res.status(201).json({ item })),
    sendConfirmation: (req, res) => service.sendVisitConfirmation(prisma, config, req.session.user, req.params.id).then((value) => res.json(value)),
    uploadRequestDocument: (req, res) => service.saveDocument(prisma, config, objectStorage, req.session.user, "request", req.params.id, req.file).then((item) => res.status(201).json({ item })),
    uploadVisitDocument: (req, res) => service.saveDocument(prisma, config, objectStorage, req.session.user, "visit", req.params.id, req.file).then((item) => res.status(201).json({ item })),
    async downloadDocument(req, res) {
      const item = await service.documentFile(prisma, objectStorage, req.session.user, req.params.id);
      res.set({ "Content-Type": item.mimeType, "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(item.fileName)}`, "Content-Length": String(item.content.length), "Cache-Control": "no-store, private", "X-Content-Type-Options": "nosniff" });
      res.send(item.content);
    },
    reminders: (req, res) => service.sendReminders(prisma, config, req.session.user).then((items) => res.json({ items }))
  };
}

module.exports = { createServiceController };
