"use strict";

const major = Number(process.versions.node.split(".")[0]);

if (major < 24 || major >= 27) {
  process.stderr.write([
    "Climature vereist Node.js 24 t/m 26.",
    `Actieve versie: ${process.version}.`,
    "Gebruik bijvoorbeeld `nvm use` in de projectmap en voer daarna npm install uit."
  ].join("\n") + "\n");
  process.exit(1);
}

process.stdout.write(`Node-omgeving gecontroleerd (${process.version}).\n`);
