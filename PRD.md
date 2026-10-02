# PRD: GitLab Commit Report Generator

**Versi:** 1.1 (revisi format output: Form Pengajuan Lembur) | **Status:** Disetujui untuk MVP CLI | **Tanggal:** 2 Oktober 2026

## 1. Ringkasan

Tool untuk membuat laporan pekerjaan secara otomatis dari commit GitLab self-hosted. User memasukkan tanggal (tunggal atau rentang), lalu tool menghasilkan file **Word (.docx)** berisi **Form Pengajuan Lembur** untuk tiap commit: nama, tanggal commit, alasan lembur (judul commit), **screenshot seluruh perubahan**, dan blok tanda tangan atasan.

**Flow:** `Input tanggal → Fetch commit → Render diff → Screenshot → Susun form per commit → Output DOCX`

## 2. Masalah

Membuat laporan secara manual berarti membuka GitLab, mencari commit satu per satu di beberapa project, meng-copy pesan, mengambil screenshot, lalu menyusunnya ke Word. Prosesnya repetitif, memakan waktu, dan rawan ada commit yang terlewat.

## 3. Goals dan Non-Goals

**Goals**
- Laporan jadi dalam hitungan detik–menit setelah tanggal diinput.
- Output hanya berisi commit message dan screenshot perubahan.
- Hasil konsisten dan bisa diulang.

**Non-Goals (v1)**
- Tidak ada analisis atau ringkasan AI.
- Tidak mendukung Git provider selain GitLab.
- Tidak ada fitur multi-user atau tim.
- Tidak ada statistik (jumlah baris, grafik kontribusi).

## 4. Keputusan yang Sudah Dikunci

| Hal | Keputusan |
|---|---|
| Format output | Word (.docx) |
| GitLab | Self-hosted |
| Jumlah project | Beberapa project dalam satu laporan |
| Cakupan screenshot | Seluruh diff (dipecah jika panjang) |
| Platform | CLI lokal dulu, web UI setelah tervalidasi |
| Token | Personal Access Token scope `read_api` (sudah dikonfirmasi aman) |

## 5. User dan Use Case

**User:** Developer FE (pertama-tama pembuat tool ini sendiri).
**Use case utama:** "Buatkan laporan commit saya tanggal 1–5 Oktober 2026 untuk semua project saya."

## 6. User Flow

1. User menjalankan CLI dengan tanggal mulai dan akhir (akhir opsional, default = tanggal mulai).
2. Tool mengambil commit milik user di tiap project pada rentang tersebut.
3. Untuk tiap commit, tool mengambil diff dan merender screenshot.
4. Screenshot yang terlalu panjang dipecah menjadi beberapa bagian.
5. Tool menyusun satu form lembur per commit, diurutkan berdasarkan waktu commit.
6. File `.docx` disimpan ke disk, siap dicetak dan ditandatangani atasan.

## 7. Functional Requirements

| ID | Requirement | Prioritas |
|---|---|---|
| FR-1 | Input tanggal tunggal atau rentang (`YYYY-MM-DD`) | P0 |
| FR-2 | Konfigurasi base URL, token, author, dan daftar project (ID atau path) | P0 |
| FR-3 | Ambil commit sesuai tanggal dan author | P0 |
| FR-4 | Abaikan merge commit (opsi untuk menyertakan) | P0 |
| FR-5 | Render diff lengkap menjadi gambar | P0 |
| FR-6 | Multi-project: commit dari semua project digabung dan diurutkan berdasarkan waktu | P0 |
| FR-7 | Export DOCX berformat Form Pengajuan Lembur, satu form (satu halaman) per commit | P0 |
| FR-7a | Field form: Nama (nama akun GitLab, bisa di-override), Tanggal (tanggal commit, WIB, format `01 Agustus 2026`), Alasan Lembur (judul commit) | P0 |
| FR-7b | Blok tanda tangan: "Atasan", ruang tanda tangan, nama dan NIK atasan dari config | P0 |
| FR-8 | Pemecahan screenshot panjang menjadi beberapa gambar berurutan | P0 |
| FR-9 | Exclude file tertentu per project (lock file, build output, dll.) | P1 |
| FR-10 | Filter branch (default: semua branch) | P1 |
| FR-11 | Web UI dengan date picker | P2 (fase lanjut) |
| FR-12 | Export tambahan HTML/PDF | P2 |

## 8. Non-Functional Requirements

- **Keamanan:** token hanya di `.env`, tidak boleh masuk repo. Scope `read_api` saja.
- **Performa:** laporan 20 commit selesai dalam kurang dari 1 menit.
- **Reliabilitas:** retry dengan backoff untuk rate limit (429) dan error server (5xx).
- **Timezone:** tanggal input diperlakukan sebagai WIB (UTC+7); batas query `00:00:00+07:00` s.d. `23:59:59+07:00`.
- **Privasi:** semua proses berjalan lokal, diff tidak dikirim ke layanan eksternal.
- **SSL:** dukung CA internal via `NODE_EXTRA_CA_CERTS`; verifikasi SSL tidak boleh dimatikan.

## 9. Pendekatan Teknis

**Stack:** Node.js + TypeScript.

| Kebutuhan | Library |
|---|---|
| HTTP ke GitLab | `fetch` bawaan Node |
| Diff ke HTML | `diff2html` |
| Screenshot | `playwright` (Chromium) |
| Pemotongan gambar | `sharp` |
| Pembuat DOCX | `docx` |
| CLI | `commander` |
| Config | `yaml`, `dotenv` |
| Pola exclude | `minimatch` |

**GitLab REST API (`<url>/api/v4`)**
- Daftar commit: `GET /projects/:id/repository/commits?since=&until=&all=true`
- Diff per commit: `GET /projects/:id/repository/commits/:sha/diff`
- Auth: header `PRIVATE-TOKEN`.
- Filter author dilakukan di sisi client (berdasarkan `author_email`) agar tidak bergantung versi GitLab.

**Screenshot: render diff dari API, bukan buka halaman GitLab.** Diff dari API dirender ke HTML dengan `diff2html`, lalu di-screenshot dengan Playwright. Keuntungan: tidak perlu login/session ke GitLab, tampilan terkontrol, tidak rapuh terhadap perubahan UI GitLab.

**Pemecahan gambar panjang**
- Lebar render tetap (1000 px), skala 1,5x agar tajam.
- Batas tinggi per potongan dikonfigurasi (default 1.800 px pada gambar hasil).
- Potongan diusahakan jatuh di batas antar-file atau antar-hunk, supaya baris kode tidak terbelah.
- Tiap potongan diberi label "Bagian n/N" di dokumen.

**Arsitektur**

```
CLI  →  generateReport({from, to})  →  Buffer (.docx)
          │
          ├─ dates.ts      (rentang WIB)
          ├─ gitlab.ts     (fetch commit + diff, retry)
          ├─ render.ts     (diff → HTML → screenshot → potong)
          └─ docx.ts       (susun dokumen)
```

Core hanya mengekspos satu fungsi sehingga web UI nanti tinggal memanggil fungsi yang sama.

**Contoh config**

```yaml
gitlab:
  url: https://gitlab.perusahaan.co.id
  author_email: kamu@perusahaan.co.id
employee:                       # opsional; default = nama akun GitLab
  name: Muhammad Zulfadly Simatupang, S.Kom
supervisor:
  name: Nama Atasan
  nik: "123456"
options:
  include_merges: false
  max_slice_height: 1800
projects:
  - id: 123
    name: Web Dashboard
    exclude: ["package-lock.json", "dist/**"]
  - id: 456
    name: Mobile Landing
```

```env
GITLAB_TOKEN=glpat-xxxx
NODE_EXTRA_CA_CERTS=/path/ca.pem
```

**Contoh penggunaan**

```bash
npm run report -- --from 2026-10-01 --to 2026-10-05
```

## 10. Struktur Output Word

Satu halaman per commit (halaman berikutnya dimulai dengan page break):

```
                 FORM PENGAJUAN LEMBUR

Nama            : Muhammad Zulfadly Simatupang, S.Kom   (nama akun GitLab)
Tanggal         : 01 Agustus 2026                       (tanggal commit)
Alasan Lembur   : Pembuatan fasilitas Relokasi Ujian Mahasiswa Massal SRS5G   (judul commit)

Screenshot perubahan
[screenshot diff, bagian 1/2]
[screenshot diff, bagian 2/2]

Atasan



Nama Atasan
NIK Atasan
```

Catatan:
- Deskripsi commit (baris setelah judul) tidak ditampilkan di form.
- Nama project tidak ditampilkan di form.
- Jika screenshot panjang, form berlanjut ke halaman berikutnya dan blok tanda tangan tetap di akhir form.

## 11. Edge Cases

| Kasus | Penanganan |
|---|---|
| Tidak ada commit di rentang tanggal | Tampilkan "Tidak ada commit pada periode ini", bukan error |
| Diff sangat besar | Dipecah menjadi beberapa bagian |
| File biner / gambar | Placeholder "File biner, diff tidak ditampilkan" |
| Commit message multi-baris | Hanya baris pertama (judul) dipakai sebagai Alasan Lembur |
| Commit sama di beberapa branch | Deduplikasi berdasarkan SHA |
| Token invalid/expired | Pesan error yang jelas |
| Sertifikat SSL internal gagal | Pesan error yang menyarankan `NODE_EXTRA_CA_CERTS` |
| Project tidak ditemukan / tanpa akses | Pesan error menyebut project terkait, proses project lain dilanjutkan |
| Diff dipotong oleh GitLab (terlalu besar) | Beri penanda di laporan |

## 12. Milestone

| Fase | Cakupan | Estimasi |
|---|---|---|
| 1 | Setup, config multi-project, koneksi GitLab self-hosted (termasuk SSL) | 0,5–1 hari |
| 2 | Fetch commit + filter tanggal/author/merge | 0,5 hari |
| 3 | Diff → HTML → screenshot → pemotongan | 1–1,5 hari |
| 4 | Builder DOCX | 1 hari |
| 5 | Error handling, exclude file, uji commit besar | 0,5–1 hari |
| 6 | Web UI (setelah CLI divalidasi) | 1–2 hari |

**Total MVP CLI:** sekitar 3,5–5 hari.

## 13. Risiko

| Risiko | Mitigasi |
|---|---|
| Rate limit GitLab | Retry + backoff, request dijalankan berurutan |
| Screenshot lambat | Satu instance browser dipakai ulang untuk semua commit |
| Sertifikat custom | `NODE_EXTRA_CA_CERTS` |
| File DOCX terlalu besar | Skala gambar dan batas tinggi potongan bisa diatur; PNG dapat diganti JPEG bila perlu |
| Diff berisi kode sensitif | Semua berjalan lokal |

## 14. Success Metrics

- Waktu membuat laporan turun dari sekitar 30 menit menjadi kurang dari 2 menit.
- Tidak ada commit yang terlewat dibanding pengecekan manual.

## 15. Pertanyaan Terbuka

1. Apakah satu form per commit sudah tepat, atau beberapa commit di hari yang sama sebaiknya digabung dalam satu form?
2. Apakah ada template Word resmi dari kantor (kop surat, font, logo) yang harus diikuti?
3. Apakah nama pada form perlu memakai gelar (mis. "S.Kom") jika nama akun GitLab tidak memuatnya? (bisa diisi lewat `employee.name`)
4. Apakah author perlu mendukung lebih dari satu email (email pribadi dan kantor)?
