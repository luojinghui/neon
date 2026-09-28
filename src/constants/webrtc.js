// Public STUN endpoint shared by cloud diagnostics and planet calls.
// This deployment is STUN-only; TURN URLs and secrets are configured server-side.
const DEFAULT_STUN_URL = 'stun:8.137.55.241:3478';

module.exports = { DEFAULT_STUN_URL };
