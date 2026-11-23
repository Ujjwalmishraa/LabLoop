// Starts an in-memory MongoDB, seeds it, and runs the API. Used by Playwright (see playwright.config.js).
// Env must be set before the app modules load, hence the dynamic imports.
process.env.NODE_ENV = "development";
process.env.PORT ??= "5055";
process.env.BCRYPT_COST ??= "4";
process.env.RATE_LIMIT_ENABLED = "false";
process.env.CRON_ENABLED = "false";
process.env.STORAGE_DRIVER = "local";
process.env.STORAGE_LOCAL_DIR ??= "storage/e2e";
process.env.CLIENT_ORIGIN ??= "http://localhost:5174";
// Report links go through the Vite proxy, same as in local development
process.env.PUBLIC_API_URL ??= process.env.CLIENT_ORIGIN;

const { MongoMemoryServer } = await import("mongodb-memory-server");
const mongod = await MongoMemoryServer.create();
const { connectDb } = await import("../db.js");
const { seedDev, seedDemoActivity } = await import("./seed.js");
const { createApp } = await import("../app.js");

await connectDb(mongod.getUri("nidaansetu-e2e"));
await seedDemoActivity(await seedDev());
const server = createApp().listen(Number(process.env.PORT), () => console.log(`e2e API ready on :${process.env.PORT}`));

const stop = async () => {
  server.close();
  await mongod.stop();
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
