import { repository } from "../src/repository.js";
import { dashboardService } from "../src/services.js";
import { todayIso } from "../src/utils.js";

const asOf = process.argv.find((arg) => arg.startsWith("--as-of="))?.split("=")[1] || todayIso();

try {
  await repository.init();
  const result = await dashboardService.archiveEligibleCompletedRefunds({ asOf });
  console.log(`Archive check date: ${result.asOf}`);
  console.log(`Eligible records scanned: ${result.scanned}`);
  console.log(`Archived records: ${result.archived.length}`);
  result.archived.forEach((record) => {
    console.log(`- ${record.firmName} (${record.id}) ${record.phase || "SETUP phase"}, completed ${record.completionDate}`);
  });
} catch (error) {
  console.error("Failed to archive eligible completed SETUP refunds.");
  console.error(error);
  process.exitCode = 1;
}
