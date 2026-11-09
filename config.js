// Pengaturan game. Edit sesuai kebutuhan.
window.CONFIG = {
  // ---- Leaderboard bersama (Supabase) ----
  // Kosongkan keduanya = leaderboard hanya tersimpan di browser pemain (localStorage).
  // Isi dari Supabase: Project Settings > API (Project URL dan anon / publishable key).
  SUPABASE_URL: "",       // contoh: "https://abcdefghijk.supabase.co"
  SUPABASE_ANON_KEY: "",  // kunci anon/publishable (aman ditaruh di sini, bukan service_role!)

  SHUFFLE_QUESTIONS: true, // acak urutan soal tiap permainan
  SHUFFLE_OPTIONS: true    // acak urutan pilihan jawaban
};
