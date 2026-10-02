# GitLab Commit Report

Generate Form Pengajuan Lembur (DOCX) dari commit GitLab self-hosted. Satu commit = satu form (satu halaman): nama, tanggal commit, alasan lembur (judul commit), screenshot perubahan, dan blok tanda tangan atasan.

Isi `supervisor.name` dan `supervisor.nik` di `config.yaml`. Nama pegawai diambil dari akun GitLab, atau bisa di-override lewat `employee.name`.

## Setup

```bash
npm install                      # otomatis mengunduh Chromium untuk Playwright
cp .env.example .env             # isi GITLAB_TOKEN (scope read_api)
cp config.example.yaml config.yaml
```

Jika GitLab memakai sertifikat internal, set `NODE_EXTRA_CA_CERTS=/path/ca.pem` di `.env` atau shell.

## Pakai

```bash
npm run report -- --from 2026-10-01 --to 2026-10-05
npm run report -- --from 2026-10-02            # satu hari
npm run report -- --from 2026-10-01 --out laporan.docx --include-merges
```

## Struktur

- `src/core/` — logika utama (dipakai ulang oleh web UI nanti): `generateReport(range, config) → Buffer`
- `src/cli/` — entry point tipis
- `result_report` — file generate report disimpan disini
