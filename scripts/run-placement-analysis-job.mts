import { runPlacementAnalysisJob } from "../lib/placement-optimization/service";

const [jobId,accountId,startDate,endDate]=process.argv.slice(2);
if(!jobId||!accountId||!startDate||!endDate)throw new Error("Placement job ID, account, and dates are required.");
await runPlacementAnalysisJob({jobId,accountId,startDate,endDate});
