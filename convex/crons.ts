import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Polling is the reconciliation baseline; provider push channels can lower
// latency later without changing this safety net.
crons.interval("poll google sources", { minutes: 2 }, internal.sync.pollAllSources, {});

// Safety net for the playbook sheets: creates one for any compiled event
// that lacks it (including events compiled before this feature existed) and
// catches up any sheet whose last write failed or fell behind the master.
crons.interval("sync playbooks", { minutes: 2 }, internal.playbooks.syncAll, {});

export default crons;
