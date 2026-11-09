# Pendaki Bakteri 🦠⛰️

Game kuis 2D: karakter memanjat gunung (berjalan ke kanan) sambil menjawab 10 soal tentang bakteri.

## Cara main
- Player mengisi **nama** dan memilih **kelas (X-1 s.d. X-10)**.
- **Kontrol:** `A`/`D` (atau panah) jalan, `W`/`Spasi` loncat, `W` di dekat tangga untuk memanjat, `J`/`K`/klik untuk menembak. Di HP ada tombol sentuh di layar.
- **Obby:** sebelum tiap tangga/virus ada rintangan: tembok rendah, duri, jurang, batu melayang, dan platform bergerak. Jatuh ke jurang = kembali ke checkpoint 🚩. Kena duri = kehilangan 1 nyawa (3 nyawa).
- 🪜 **Tangga:** soal muncul di depan tangga. Benar → tangga terbuka dan dipanjat sendiri dengan `W`. Salah → tangga runtuh, harus lewat jalan miring yang panjang.
- 🦠 **Virus:** soal muncul saat virus menghadang. Jawab benar → **senjata terbuka** (Semprotan Disinfektan, Pistol Antibiotik, Laser UV, Meriam Vaksin) dan kamu bertarung. Jawab salah → tidak dapat senjata baru; kalau sudah punya senjata lama tetap bertarung, kalau belum punya virus mendorongmu mundur lalu kabur.
- Virus punya bar nyawa dan menembak balik. Nyawa habis saat bertarung → virus kabur (soal tetap dihitung terjawab).
- Pojok kiri atas menampilkan **progress %**, nyawa, dan senjata aktif. Pojok kanan atas menampilkan **stopwatch** waktu bermain.
- Total ada 10 kejadian (6 tangga + 4 virus), tiap kejadian = 1 soal, jadi ke-10 soal pasti muncul. Ada rintangan terakhir sebelum bendera puncak.
- **Nilai** akhir skala 0-100 (10 soal x 10 poin). Leaderboard menampilkan **nama, kelas, nilai, dan waktu finish**, diurutkan berdasarkan nilai (jika sama, yang lebih cepat di atas).

## Mengganti soal
Edit `questions.js` (format ada di dalam file). Game memakai 10 soal pertama (diacak tiap permainan, bisa dimatikan di `config.js`).

## 1. Hosting di GitHub Pages
**Lewat website (paling mudah, tanpa install apa pun)**
1. Login ke https://github.com, klik **+** (kanan atas) > **New repository**. Beri nama, misalnya `pendaki-bakteri`, pilih **Public**, klik **Create repository**.
2. Di halaman repo klik **uploading an existing file**, lalu seret semua file hasil ekstrak zip (`index.html`, `style.css`, `game.js`, `questions.js`, `config.js`). Klik **Commit changes**.
3. Buka **Settings > Pages**. Di bagian *Build and deployment* pilih **Deploy from a branch**, Branch **main**, folder **/ (root)**, klik **Save**.
4. Tunggu 1-2 menit, lalu buka `https://USERNAME.github.io/pendaki-bakteri/`. Itu link yang dibagikan ke murid.

Setiap kali file diubah (misalnya `questions.js`), upload ulang dan commit, situs ikut diperbarui.

## 2. Leaderboard bersama dengan Supabase
1. Daftar di https://supabase.com, klik **New project**, isi nama dan password database, pilih region terdekat (Singapore), tunggu selesai dibuat.
2. Buka **SQL Editor > New query**, tempel isi file `supabase.sql`, klik **Run**. Ini membuat tabel `leaderboard` dengan aturan keamanan (RLS): siapa saja hanya boleh membaca dan menambah nilai.
3. Buka **Project Settings > API**. Salin **Project URL** dan **anon / publishable key**.
4. Edit `config.js` di GitHub (klik file > ikon pensil), isi:
```js
SUPABASE_URL: "https://xxxxxxxx.supabase.co",
SUPABASE_ANON_KEY: "kunci-anon-kamu",
```
   Lalu **Commit changes**. Setelah 1-2 menit, semua pemain berbagi satu papan peringkat.
5. Uji: main sekali sampai puncak, lalu cek **Table Editor > leaderboard** di Supabase. Barisnya harus muncul.

Catatan keamanan: kunci **anon/publishable** memang dirancang boleh terlihat di kode publik, karena yang membatasi akses adalah aturan RLS. Jangan pernah memakai kunci **service_role** di sini. Nilai dihitung di browser, jadi murid yang paham developer tools secara teknis bisa mengirim nilai palsu. Untuk kuis kelas biasanya cukup. Jika perlu, guru bisa menghapus baris yang mencurigakan lewat Table Editor.

Tanpa Supabase pun game tetap jalan: nilai hanya tersimpan di browser perangkat itu.
