// Chrome exposes `chrome`, Firefox exposes `browser` (both promise-based in MV3 / MV2-Firefox).
if (typeof globalThis.browser === "undefined") globalThis.browser = globalThis.chrome;
