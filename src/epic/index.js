const Log = require("./mxt.fn.log");

const func_element = require('./mxt.fn.element');
const func_it = require('./mxt.fn.it');
const func_cx = require('./mxt.fn.cx');
const func_fx = require('./mxt.fn.fx');
const func_sorter = require("./mxt.fn.sorter");
const func_str = require("./mxt.fn.str");

const func_is = require("./mxt.fn.is");
const func_dir = require("./mxt.fn.dir");
const func_to = require("./mxt.fn.to");
const func_io = require("./mxt.fn.io");
const func_out = require("./mxt.fn.out");

const Immutable = require("immutable");

const lain_execute = require("./lain.fn.execute");
const lain_parse = require("./lain.fn.parse");

const exported = {
    ...func_is,
    ...func_dir,
    ...func_to,
    ...func_io,
    ...func_out,

    ...func_str,
    // Util
    ...func_element,
    ...func_it,
    ...func_cx,
    ...func_fx,
    ...func_sorter,
    // clone method
    clone: input => Immutable.fromJS(input).toJS(),
    info: Log.info,
    error: Log.error,
    warn: Log.warn,
    waiting: Log.execute,
    ask: Log.ask,
    askClose: Log.askClose,

    ...lain_execute,
    ...lain_parse
};
/**
 * @module _epic
 **/
module.exports = exported;