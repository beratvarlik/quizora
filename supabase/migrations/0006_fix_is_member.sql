-- Quizora — 0006 düzeltme: is_member fonksiyonuna anon erişimini kapat
-- Bulgu (scripts/security-test.ts, madde 1c): 0001'de is_member() için revoke yapılmadığından
-- PostgreSQL'in varsayılanı (PUBLIC'e EXECUTE) geçerliydi; oturumsuz (anon) kullanıcı çağırabiliyordu.
-- Fonksiyon auth.uid() ile çalıştığından anon için her zaman false döner (veri sızdırmaz),
-- yine de "tüm RPC'ler oturum ister" kuralı için kapatılır.
-- authenticated rolü RLS politikalarında (games_select, game_players_select) bu fonksiyonu kullanır;
-- onun EXECUTE yetkisi KORUNUR.
-- Yeniden çalıştırılabilir.

revoke all on function public.is_member(uuid) from public, anon;
grant execute on function public.is_member(uuid) to authenticated;
