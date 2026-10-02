import { writeFile } from "node:fs/promises";
import { Command } from "commander";
import { generateReport, loadConfig } from "../core/index";
import path from "node:path";

const program = new Command();
program
  .name("report")
  .description("Buat laporan pekerjaan (DOCX) dari commit GitLab")
  .requiredOption("--from <date>", "tanggal mulai, YYYY-MM-DD")
  .option(
    "--to <date>",
    "tanggal akhir, YYYY-MM-DD (default: sama dengan --from)",
  )
  .option("--config <path>", "path file config", "config.yaml")
  .option("--out <path>", "path file output")
  .option("--include-merges", "sertakan merge commit")
  .parse();

const opts = program.opts();

try {
  const config = await loadConfig(opts.config);
  if (opts.includeMerges) config.includeMerges = true;
  const range = { from: opts.from, to: opts.to ?? opts.from };
  const buf = await generateReport(range, config, console.log);
  const out =
    opts.out ?? `${range.from}_${range.to}_Muhammad_Zulfadly_Simatupang.docx`;
  const folderOutput = path.join("result_report", out);
  await writeFile(folderOutput, buf);
  console.log(`\nSelesai: ${out}`);
} catch (e) {
  console.error(`\nError: ${(e as Error).message}`);
  process.exit(1);
}
