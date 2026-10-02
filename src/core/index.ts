import { GitlabClient } from './gitlab';
import { Screenshotter, filterDiffs } from './render';
import { buildDocx } from './docx';
import { validateRange, wibBounds, wibDateKey } from './dates';
import type { AppConfig, DateRange, ReportCommit } from './types';

export type { AppConfig, DateRange } from './types';
export { loadConfig } from './config';

export async function generateReport(
  range: DateRange,
  config: AppConfig,
  log: (msg: string) => void = () => {},
): Promise<Buffer> {
  validateRange(range);
  const { since, until } = wibBounds(range);
  const client = new GitlabClient(config.url, config.token);
  const employeeName = config.employeeName ?? (await client.getCurrentUser()).name;
  log(`Nama pada form: ${employeeName}`);
  const shooter = new Screenshotter();
  await shooter.start();

  const result: ReportCommit[] = [];
  try {
    for (const project of config.projects) {
      log(`[${project.name}] mengambil commit...`);
      let commits;
      try {
        commits = await client.listCommits(project.id, since, until, config.authorEmail, config.includeMerges);
      } catch (e) {
        log(`[${project.name}] DILEWATI: ${(e as Error).message}`);
        continue;
      }
      log(`[${project.name}] ${commits.length} commit`);

      for (const c of commits) {
        log(`  - ${c.short_id} ${c.title}`);
        const diffs = filterDiffs(await client.getDiff(project.id, c.id), project.exclude);
        const images = await shooter.capture(diffs, config.maxSliceHeight);
        result.push({
          sha: c.id,
          title: c.title,
          body: c.message.slice(c.title.length).trim(),
          dateKey: wibDateKey(c.committed_date),
          time: Date.parse(c.committed_date),
          project: project.name,
          images,
          note: diffs.length ? undefined : 'Tidak ada perubahan file yang ditampilkan (semua file di-exclude atau diff kosong).',
        });
      }
    }
  } finally {
    await shooter.stop();
  }

  log(`Menyusun DOCX (${result.length} commit)...`);
  return buildDocx(result, { employeeName, supervisor: config.supervisor });
}
