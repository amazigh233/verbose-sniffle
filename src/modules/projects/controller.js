"use strict";

const projects = require("./service");

function createProjectController({ prisma, config }) {
  return {
    actions: (req, res) => projects.actionCenter(prisma, req.session.user, req.query || {}).then((items) => res.json({ items })),
    list: (req, res) => projects.listProjects(prisma, config, req.session.user, req.query || {}).then((value) => res.json(value)),
    async create(req, res) { const project = await projects.createProject(prisma, req.body || {}, req.session.user.id); res.status(201).json({ item: await projects.getProject(prisma, config, req.session.user, project.id) }); },
    get: (req, res) => projects.getProject(prisma, config, req.session.user, req.params.id).then((item) => res.json({ item })),
    async update(req, res) { await projects.updateProject(prisma, req.session.user, req.params.id, req.body || {}); res.json({ item: await projects.getProject(prisma, config, req.session.user, req.params.id) }); },
    createMaterial: (req, res) => projects.saveMaterial(prisma, req.session.user, req.params.id, null, req.body || {}).then((item) => res.status(201).json({ item })),
    updateMaterial: (req, res) => projects.saveMaterial(prisma, req.session.user, req.params.id, req.params.materialId, req.body || {}).then((item) => res.json({ item })),
    async deleteMaterial(req, res) { await projects.removeMaterial(prisma, req.session.user, req.params.id, req.params.materialId); res.json({ ok: true }); },
    createTask: (req, res) => projects.saveTask(prisma, req.session.user, req.params.id, null, req.body || {}).then((item) => res.status(201).json({ item })),
    updateTask: (req, res) => projects.saveTask(prisma, req.session.user, req.params.id, req.params.taskId, req.body || {}).then((item) => res.json({ item })),
    saveMember: (req, res) => projects.saveMember(prisma, req.session.user, req.params.id, req.body || {}).then((item) => res.json({ item })),
    async deleteMember(req, res) { await projects.removeMember(prisma, req.session.user, req.params.id, req.params.memberId); res.json({ ok: true }); },
    createEquipment: (req, res) => projects.saveEquipment(prisma, config, req.session.user, req.params.id, null, req.body || {}).then((item) => res.status(201).json({ item })),
    updateEquipment: (req, res) => projects.saveEquipment(prisma, config, req.session.user, req.params.id, req.params.equipmentId, req.body || {}).then((item) => res.json({ item })),
    templates: (_req, res) => projects.listTemplates(prisma).then((items) => res.json({ items })),
    availability: (req, res) => projects.availabilityDirectory(prisma, req.query || {}).then((items) => res.json({ items }))
  };
}

module.exports = { createProjectController };
