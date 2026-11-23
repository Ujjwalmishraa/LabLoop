// Loaded by Jest before any test module (see "setupFiles" in package.json).
process.env.NODE_ENV = "test";
process.env.BCRYPT_COST = "4"; // speed; production enforces >= 12
process.env.STORAGE_DRIVER = "local";
process.env.STORAGE_LOCAL_DIR = `storage/test-${process.pid}`;
process.env.PUBLIC_API_URL = "http://api.test";
process.env.ROUTING_OFFLINE = "true"; // no network in tests; route.test.js swaps in a fake fetch
