// const minilog = require('minilog');
// @ts-ignore
const minilog = require('minilog/lib/web/index.js');
minilog.enable();

module.exports = minilog('vm');
// module.exports = console;
