import type { GitlabCommit, GitlabDiff } from './types';

const MAX_RETRY = 4;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class GitlabClient {
  private base: string;

  constructor(url: string, private token: string) {
    this.base = url.replace(/\/+$/, '') + '/api/v4';
  }

  private async get<T>(path: string, params: Record<string, string | number | boolean>) {
    const qs = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)]));
    const url = `${this.base}${path}?${qs}`;

    for (let attempt = 0; ; attempt++) {
      let res: Response;
      try {
        res = await fetch(url, { headers: { 'PRIVATE-TOKEN': this.token } });
      } catch (e) {
        const err = e as Error & { cause?: { message?: string } };
        if (attempt >= MAX_RETRY) {
          throw new Error(
            `Gagal terhubung ke ${this.base}: ${err.cause?.message ?? err.message}. ` +
              'Jika memakai sertifikat internal, set NODE_EXTRA_CA_CERTS=/path/ca.pem',
          );
        }
        await sleep(2 ** attempt * 1000);
        continue;
      }

      if (res.status === 401) throw new Error('Token GitLab tidak valid atau kedaluwarsa (401).');
      if (res.status === 403) throw new Error(`Akses ditolak (403) untuk ${path}. Cek scope token (read_api).`);
      if (res.status === 404) throw new Error(`Tidak ditemukan (404): ${path}. Cek ID/path project dan akses token.`);
      if (res.status === 429 || res.status >= 500) {
        if (attempt >= MAX_RETRY) throw new Error(`GitLab error ${res.status} setelah ${MAX_RETRY} percobaan.`);
        const retryAfter = Number(res.headers.get('retry-after'));
        await sleep(retryAfter > 0 ? retryAfter * 1000 : 2 ** attempt * 1000);
        continue;
      }
      if (!res.ok) throw new Error(`GitLab error ${res.status}: ${await res.text()}`);

      return { data: (await res.json()) as T, next: res.headers.get('x-next-page') || null };
    }
  }

  private async getAll<T>(path: string, params: Record<string, string | number | boolean>) {
    const out: T[] = [];
    let page: string | null = '1';
    while (page) {
      const { data, next }: { data: T[]; next: string | null } = await this.get<T[]>(path, {
        ...params,
        per_page: 100,
        page,
      });
      out.push(...data);
      page = next;
    }
    return out;
  }

  private pid(id: number | string) {
    return encodeURIComponent(String(id));
  }

  async listCommits(
    projectId: number | string,
    since: string,
    until: string,
    authorEmail: string,
    includeMerges: boolean,
  ): Promise<GitlabCommit[]> {
    const all = await this.getAll<GitlabCommit>(`/projects/${this.pid(projectId)}/repository/commits`, {
      since,
      until,
      all: true,
    });
    const seen = new Set<string>();
    return all.filter((c) => {
      if (seen.has(c.id)) return false;
      seen.add(c.id);
      if (c.author_email.toLowerCase() !== authorEmail.toLowerCase()) return false;
      if (!includeMerges && c.parent_ids.length > 1) return false;
      return true;
    });
  }

  async getCurrentUser(): Promise<{ name: string; username: string }> {
    return (await this.get<{ name: string; username: string }>('/user', {})).data;
  }

  getDiff(projectId: number | string, sha: string): Promise<GitlabDiff[]> {
    return this.getAll<GitlabDiff>(`/projects/${this.pid(projectId)}/repository/commits/${sha}/diff`, {});
  }
}
