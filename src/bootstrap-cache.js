"use strict";

// De bootstrap bevat sinds API v2 alleen kleine sessie-/referentiemetadata.
// Cachen leverde weinig winst op en veroorzaakte incoherentie tussen instances.
function get() { return null; }
function set() {}
function beginLoad() { return 0; }
function invalidate() {}

module.exports = { get, set, beginLoad, invalidate };
