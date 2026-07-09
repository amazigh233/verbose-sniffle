"use strict";

module.exports = {
  test: {
    environment: "node",
    globals: true,
    include: ["tests/**/*.test.js"],
    exclude: ["tests/e2e/**"],
    setupFiles: ["./tests/setup.js"],
    testTimeout: 30000
  }
};
