# Barberfolio

Pencatatan operasional dan keuangan barbershop **per cabang**, khusus **owner**.

Pola yang sama dengan Propfolio — satu entri, dicatat biayanya, dihitung hasilnya —
tetapi objeknya diganti: satu akun prop firm menjadi **satu cabang**.
Owner bisa membandingkan semua cabang dalam satu dashboard tanpa membuka file satu per satu.

> Angka, nama cabang, dan harga pada contoh adalah contoh generik, bukan data usaha yang sebenarnya.

## Fitur (MVP)

- **Dashboard** — kartu omzet bersih, profit, pelanggan, komisi; tabel perbandingan antar cabang
  (omzet bersih, pelanggan, tiket rata-rata, komisi, biaya, profit, margin) + baris total gabungan;
  grafik tren harian; filter cabang dan periode.
- **Input** — catat transaksi multi-layanan (potong + cukur + produk dalam satu kunjungan),
  harga dan persen komisi di-snapshot saat transaksi disimpan, diskon, tip, 5 metode bayar
  (tunai, QRIS, transfer, kartu, e-wallet), dan void transaksi.
- **Biaya** — biaya per cabang dengan 7 kategori spek: sewa, gaji pokok, listrik/air, stok/bahan,
  marketing, perawatan, lainnya.
- **Tutup Kas** — rekap harian otomatis (omzet kotor/bersih, komisi, biaya, profit, margin,
  tunai yang seharusnya vs tunai fisik, selisih tampil apa adanya), status
  Draf → Terkirim → Terkunci. Hari yang terkunci menolak tambah/void transaksi dan biaya.
- **Laporan** — per kapster, per layanan/produk, per metode bayar, per kategori biaya.
- **Master** — CRUD cabang (kode unik), layanan & harga per cabang, kapster & skema komisi.
  Nonaktifkan, bukan hapus, supaya riwayat tetap utuh.
- **Panduan** — cara pakai lengkap di dalam aplikasi, termasuk tabel rumus.
- **Ekspor CSV** transaksi per periode/cabang.

## Cara menjalankan

Tidak ada build step, tidak ada framework, tidak ada CDN. Cukup:

```sh
# cara 1: buka langsung
open index.html        # atau klik dua kali file index.html

# cara 2: lewat server lokal
python3 -m http.server 8000
# lalu buka http://localhost:8000
```

Tema hitam-putih murni, dengan mode gelap (latar hitam, teks putih).
Bisa dibuka dari HP maupun desktop.

## Cara pakai singkat

1. **Master** — tambah cabang → layanan + harga → kapster + persen komisi.
2. **Input** — catat tiap transaksi yang selesai dibayar. **Biaya** — catat tiap pengeluaran.
3. **Tutup Kas** — akhir hari: cek rekap otomatis, hitung tunai di laci, isi tunai fisik,
   lalu Simpan draf → Kirim → Kunci.
4. **Dashboard / Laporan** — bandingkan cabang, lihat kapster dan layanan terlaris.
   Ekspor CSV dari bilah filter bila perlu arsip.

Panduan lengkap ada di tab **Panduan** di aplikasi.

Untuk memeriksa rumus, di tab Panduan ada tombol **Muat data contoh** — data contoh Bab 11 spek
(1 cabang, Kapster A/B, 3 transaksi, 2 biaya). Hasil yang benar: omzet bersih Rp330.000,
komisi Rp118.000, biaya Rp120.000, profit Rp92.000, margin 27,9%, tiket rata-rata Rp110.000,
tunai yang seharusnya Rp250.000.

## Rumus (Bab 7 spek)

| Ukuran | Rumus |
| --- | --- |
| Subtotal item | qty × harga satuan (snapshot) |
| Komisi per item | subtotal × persen komisi / 100 |
| Omzet kotor | jumlah subtotal semua item |
| Omzet bersih | omzet kotor − diskon |
| Profit operasional | omzet bersih − komisi − biaya |
| Margin profit | profit / omzet bersih × 100% |
| Tiket rata-rata | omzet bersih / jumlah transaksi selesai |
| Tunai yang seharusnya | jumlah omzet bersih transaksi tunai |

- **Tip bukan omzet** dan bukan dasar komisi — dilaporkan terpisah.
- Komisi dihitung dari subtotal sebelum diskon tingkat transaksi.
  Persen komisi diambil dari layanan dulu, kalau kosong ikut persen kapster.
- Transaksi **void/refunded dikeluarkan** dari semua perhitungan.

## Penyimpanan data

Versi ini menyimpan data di **localStorage browser** (kunci `barberfolio-v1`).
Data mulai **kosong** — owner mengisi sendiri. Konsekuensinya: data hanya ada di browser
itu, tidak tersinkron antar perangkat, dan hilang kalau data browser dihapus.
Ekspor CSV berkala sebagai arsip.

## Menuju produksi (Supabase)

Struktur data produksi ada di `supabase/schema.sql` — 9 tabel spek
(`branches`, `users`, `branch_members`, `services`, `barbers`, `customers`,
`transactions`, `transaction_items`, `expenses`, `daily_closings`).
Langkah produksi: buat proyek Supabase → jalankan DDL → aktifkan Supabase Auth
+ Row Level Security (owner lihat semua cabang, cabang hanya cabangnya) → ganti
lapisan localStorage dengan Supabase. Rumus dan alur tutup kas tidak berubah.

Di luar cakupan MVP ini (Fase 2–3 spek): rekap WhatsApp otomatis, stok produk,
loyalitas pelanggan, target cabang, booking online, payment gateway, sinkron POS.

## Lisensi

MIT — lihat `LICENSE`.
