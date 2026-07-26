// GET /api/levels — public catalogue of exam levels and their structure
// (section plan, grille dimensions, word counts, PO parts/timings, CO play
// rules). Fetched once per app load into the frontend level store; the
// frontend hardcodes none of these numbers. Server-only prompt fragments are
// stripped by toPublic().
const express = require('express');
const { LEVELS, LEVEL_KEYS, DEFAULT_LEVEL, toPublic } = require('../constants/levels');

const router = express.Router();

// The payload only changes on deploy — let clients and CDNs cache it.
router.get('/', (_req, res) => {
  res.set('Cache-Control', 'public, max-age=3600');
  res.json({
    defaultLevel: DEFAULT_LEVEL,
    levels: LEVEL_KEYS.map((k) => toPublic(LEVELS[k])),
  });
});

module.exports = router;
