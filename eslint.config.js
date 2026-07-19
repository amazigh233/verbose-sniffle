"use strict";

const globals = require("globals");

const rules = {
  "constructor-super": "error",
  "for-direction": "error",
  "getter-return": "error",
  "no-async-promise-executor": "error",
  "no-class-assign": "error",
  "no-const-assign": "error",
  "no-dupe-args": "error",
  "no-dupe-class-members": "error",
  "no-dupe-keys": "error",
  "no-func-assign": "error",
  "no-import-assign": "error",
  "no-new-native-nonconstructor": "error",
  "no-obj-calls": "error",
  "no-promise-executor-return": "error",
  "no-self-assign": "error",
  "no-setter-return": "error",
  "no-unreachable": "error",
  "no-unreachable-loop": "error",
  "no-unsafe-finally": "error",
  "no-unsafe-negation": "error",
  "no-with": "error",
  "require-yield": "error",
  "use-isnan": "error",
  "valid-typeof": "error"
};

module.exports = [
  { ignores: ["node_modules/**", "coverage/**", "playwright-report/**", "test-results/**", ".data/**", "assets/vendor/**"] },
  {
    files: ["assets/**/*.js", "hr/**/*.js"],
    languageOptions: { ecmaVersion: 2022, sourceType: "script", globals: globals.browser },
    rules
  },
  {
    files: ["service-worker.js"],
    languageOptions: { ecmaVersion: 2022, sourceType: "script", globals: globals.serviceworker },
    rules
  },
  {
    files: ["src/**/*.js", "scripts/**/*.js", "prisma/**/*.js", "*.js"],
    languageOptions: { ecmaVersion: 2022, sourceType: "commonjs", globals: globals.node },
    rules
  },
  {
    files: ["tests/**/*.js"],
    languageOptions: { ecmaVersion: 2022, sourceType: "commonjs", globals: Object.assign({}, globals.node, globals.browser, { describe: "readonly", it: "readonly", test: "readonly", expect: "readonly", beforeAll: "readonly", afterAll: "readonly", beforeEach: "readonly", afterEach: "readonly", vi: "readonly" }) },
    rules
  }
];
