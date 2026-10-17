// Execute only repository-owned definitions in an empty VM, never model output.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = process.argv[2] || path.resolve(__dirname, '../..');
const window = {};
const sandbox = {window, console: {log() {}, warn() {}, error() {}}};
vm.runInNewContext(fs.readFileSync(path.join(root, '.atlas/webscreen/static/new/expressions-catalog.js'), 'utf8'), sandbox, {timeout: 2000});
window.AtlasExpressionCatalog = sandbox.AtlasExpressionCatalog;
if (!Array.isArray(window.AtlasExpressionCatalog?.expressions) || window.AtlasExpressionCatalog.expressions.length < 173) throw new Error('Full expression catalog required; never benchmark legacy fallback silently');
vm.runInNewContext(fs.readFileSync(path.join(root, '.atlas/webscreen/static/realtime.js'), 'utf8'), sandbox, {timeout: 2000});
const t = window.AtlasRealtime._test;
if (t.faceTool.parameters.properties.expression.enum.length !== window.AtlasExpressionCatalog.expressions.length) throw new Error('Face schema/catalog count mismatch');
process.stdout.write(JSON.stringify({model: window.AtlasRealtime.model, tools: [...t.realtimeTools, t.faceTool, t.displayModeTool], instructions: t.androidInstructions + '\n\n' + t.faceInstructions}));
