// DELF B2 Production Écrite grille — now owned by constants/levels/b2.js.
// Kept as a re-export so every existing import keeps working (B2 = default
// level). New code should use require('./levels').getLevel(level).pe instead.
module.exports = require('./levels/b2').pe;
