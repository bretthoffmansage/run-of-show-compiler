import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Polling is the reconciliation baseline; provider push channels can lower
// latency later without changing this safety net.
crons.interval("poll google sources", { minutes: 2 }, internal.sync.pollAllSources, {});

export default crons;
