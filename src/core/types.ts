export interface ProjectConfig {
  id: number | string; // ID numerik atau path, mis. "group/repo"
  name: string;
  exclude?: string[];
}

export interface AppConfig {
  url: string;
  token: string;
  authorEmail: string;
  includeMerges: boolean;
  maxSliceHeight: number;
  employeeName?: string; // override; default: nama akun GitLab (GET /user)
  supervisor: { name: string; nik: string };
  projects: ProjectConfig[];
}

export interface GitlabCommit {
  id: string;
  short_id: string;
  title: string;
  message: string;
  author_email: string;
  committed_date: string;
  parent_ids: string[];
}

export interface GitlabDiff {
  old_path: string;
  new_path: string;
  diff: string;
  new_file: boolean;
  renamed_file: boolean;
  deleted_file: boolean;
}

export interface ReportCommit {
  sha: string;
  title: string;
  body: string;
  dateKey: string; // YYYY-MM-DD (WIB)
  time: number;
  project: string;
  images: Buffer[];
  note?: string;
}

export interface DateRange {
  from: string; // YYYY-MM-DD
  to: string;
}
