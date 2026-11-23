import { env } from "./config/env.js";
import { connectDb } from "./db.js";
import { createApp } from "./app.js";
import { scheduleSettlementJob } from "./jobs/settlement.js";
import "./models/index.js";

try {
  await connectDb();
  console.log("MongoDB connected");
} catch (e) {
  console.error("MongoDB connect failed:", e.message);
  process.exit(1);
}

if (env.cronEnabled) scheduleSettlementJob();

createApp().listen(env.PORT, () => console.log(`LabLoop API on http://localhost:${env.PORT} (${env.NODE_ENV})`));
