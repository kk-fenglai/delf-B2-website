// DELF B2 Production Orale grille — now owned by constants/levels/b2.js.
// Kept as a re-export so every existing import keeps working (B2 = default
// level). New code should use require('./levels').getLevel(level).po instead.
module.exports = require('./levels/b2').po;
