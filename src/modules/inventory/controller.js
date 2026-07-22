"use strict";

const inventory = require("./service");
const { inventoryTemplateBuffer } = require("./workbook-template");

function createInventoryController({ prisma, scanFile, config }) {
  return {
    list: (req, res) => inventory.list(prisma, req.query || {}).then((result) => res.json(result)),
    template: (_req, res) => {
      const content = inventoryTemplateBuffer();
      res.set({
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": 'attachment; filename="climature-voorraad-import.xlsx"',
        "Content-Length": String(content.length),
        "X-Content-Type-Options": "nosniff"
      });
      res.send(content);
    },
    adjust: (req, res) => inventory.adjust(prisma, req.session.user, req.params.id, req.body || {}).then((item) => res.json({ item })),
    importWorkbook: async (req, res) => {
      inventory.validateWorkbookFile(req.file);
      await scanFile(config, req.file.buffer);
      const summary = await inventory.importWorkbook(prisma, req.session.user, req.file);
      res.status(201).json({ summary });
    }
  };
}

module.exports = { createInventoryController };
