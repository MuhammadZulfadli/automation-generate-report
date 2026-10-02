import { readFile } from 'node:fs/promises';
import { parse } from 'yaml';
import 'dotenv/config';
import type { AppConfig, ProjectConfig } from './types';

export async function loadConfig(path = 'config.yaml'): Promise<AppConfig> {
  let raw: string;
  try {
    raw = await readFile(path, 'utf8');
  } catch {
    throw new Error(`File config tidak ditemukan: ${path}. Salin config.example.yaml menjadi config.yaml.`);
  }
  const y = parse(raw) ?? {};
  const token = process.env.GITLAB_TOKEN;
  if (!token) throw new Error('GITLAB_TOKEN belum diset di .env');
  if (!y.gitlab?.url) throw new Error('gitlab.url wajib diisi di config');
  if (!y.gitlab?.author_email) throw new Error('gitlab.author_email wajib diisi di config');
  const projects: ProjectConfig[] = y.projects ?? [];
  if (!projects.length) throw new Error('Minimal satu project harus didefinisikan di config');

  if (!y.supervisor?.name || !y.supervisor?.nik) throw new Error('supervisor.name dan supervisor.nik wajib diisi di config');

  return {
    url: y.gitlab.url,
    token,
    authorEmail: y.gitlab.author_email,
    includeMerges: y.options?.include_merges ?? false,
    maxSliceHeight: y.options?.max_slice_height ?? 1800,
    employeeName: y.employee?.name || undefined,
    supervisor: { name: String(y.supervisor.name), nik: String(y.supervisor.nik) },
    projects,
  };
}
