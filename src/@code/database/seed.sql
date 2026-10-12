INSERT OR IGNORE INTO app_state (key, value, updated_at) VALUES
('profile', '{"id":"player-demo-001","displayName":"Juan Dela Cruz","avatarEmoji":"🧑‍🌾","homeBarangay":"Barangay San Isidro","bio":"Weekend gamer and community volunteer.","role":"super-admin"}', CURRENT_TIMESTAMP),
('wallet', '{"balance":250,"dailyShareLimit":100,"sharedToday":0,"lastShareDate":null,"transactions":[{"id":"txn-seed-001","type":"administrative-credit","amount":250,"reason":"Welcome bonus","createdAt":"2026-09-01T08:00:00.000Z"}]}', CURRENT_TIMESTAMP),
('games', '[]', CURRENT_TIMESTAMP),
('feed', '[{"id":"feed-seed-001","type":"announcement","authorName":"Barangay San Isidro Admin","authorRole":"brgy-admin","authorAvatarEmoji":"📢","content":"Welcome to Brgy Game Center! Check the Home tab for available games and daily bonuses.","createdAt":"2026-09-15T08:00:00.000Z"},{"id":"feed-seed-002","type":"achievement","authorName":"Maria Santos","authorRole":"player","authorAvatarEmoji":"🧑‍🎨","content":"Just hit a 5x multiplier on Online Fruit Game! 🍒🍒🍒","createdAt":"2026-09-16T14:30:00.000Z"},{"id":"feed-seed-003","type":"status","authorName":"Juan Dela Cruz","authorRole":"player","authorAvatarEmoji":"🧑‍🌾","content":"Looking for players to share coins with this weekend!","createdAt":"2026-09-17T09:15:00.000Z"}]', CURRENT_TIMESTAMP),
('adminUsers', '{"users":[{"id":"user-001","displayName":"Juan Dela Cruz","avatarEmoji":"🧑‍🌾","homeBarangay":"Barangay San Isidro","role":"player","status":"active","coinBalance":250},{"id":"user-002","displayName":"Maria Santos","avatarEmoji":"🧑‍🎨","homeBarangay":"Barangay San Isidro","role":"player","status":"active","coinBalance":180},{"id":"user-003","displayName":"Pedro Reyes","avatarEmoji":"🧑‍🚀","homeBarangay":"Barangay Santa Cruz","role":"player","status":"suspended","coinBalance":40},{"id":"user-004","displayName":"Barangay San Isidro Admin","avatarEmoji":"📢","homeBarangay":"Barangay San Isidro","role":"brgy-admin","status":"active","coinBalance":500},{"id":"user-005","displayName":"Platform Super Admin","avatarEmoji":"🛡️","homeBarangay":"Platform","role":"super-admin","status":"active","coinBalance":1000}],"history":[{"id":"history-seed-001","userId":"user-001","userName":"Juan Dela Cruz","adjustmentType":"credit","amount":250,"reason":"Welcome bonus","adminName":"Platform Super Admin","createdAt":"2026-09-01T08:00:00.000Z"}]}', CURRENT_TIMESTAMP),
('missions', '[{"id":"mission-weekly-play","title":"Weekly Player","description":"Successfully play any game at least once a day for 1 week.","bonusCoins":100,"status":"active"},{"id":"mission-spend-1000","title":"Big Spender I","description":"Spend a total of 1,000 coins across any games.","bonusCoins":50,"status":"active"},{"id":"mission-spend-10000","title":"Big Spender II","description":"Spend a total of 10,000 coins across any games.","bonusCoins":300,"status":"active"},{"id":"mission-spend-100000","title":"Big Spender III","description":"Spend a total of 100,000 coins across any games.","bonusCoins":2000,"status":"active"},{"id":"mission-five-hour-streak","title":"Marathon Player","description":"Play for 5 hours straight in a single session.","bonusCoins":500,"status":"active"}]', CURRENT_TIMESTAMP),
('streak', '{"currentStreak":0,"longestStreak":0,"lastPlayedDate":null,"claimedMilestoneDays":[]}', CURRENT_TIMESTAMP),
('playerMissions', '{"claimedMissionIds":[]}', CURRENT_TIMESTAMP);

INSERT INTO game_registrations (
  id, app_key, app_name, provider_name, description, launch_url, api_base_url,
  auth_endpoint, balance_endpoint, add_chips_endpoint, deduct_chips_endpoint, credential_reference,
  signature_algorithm, external_user_id_field, transaction_id_field,
  transaction_type_field, game_type_field, request_id_field, category, cost_per_play,
  launch_type, status, active, signing_secret_ciphertext, created_at
) VALUES
(
  'game-reg-001', 'fruit-game', 'Online Fruit Game', 'Barangay Arcade Studios',
  'Spin and match colorful local fruits to win multipliers and earn community bonus rewards!',
  'https://games.barangay.ph/fruit-game', 'https://games.barangay.ph/api/fruit-game',
  '/auth', '/balance', '/chips/add', '/chips/deduct', 'ref-fruit-game',
  'hmac-sha256', 'userId', 'transactionId', 'type', 'gameType', 'requestId',
  'arcade', 10, 'external-url', 'active', 1, '', '2026-09-01T00:00:00.000Z'
),
(
  'game-reg-003', 'e939c295111af7397549aec19dd1073cfe4040b22d62c1dcb34f62a0a3d0403a', 'In Between Cards', 'Barangay Card House',
  'Classic In-Between card game with instant coin payouts and resident leaderboard ranking.',
  'https://ib-automated.oraytph.com', 'https://ib-automated.oraytph.com/api',
  '/auth', '/balance', '/chips/add', '/chips/deduct', 'ref-inbetween',
  'hmac-sha256', 'userId', 'transactionId', 'type', 'gameType', 'requestId',
  'card', 0, 'external-url', 'active', 1, '342ea0ddbec474ab828328d4ba72fc9c979615ec4ce083b440bb1e948dfc5cf0', '2026-09-03T00:00:00.000Z'
)
ON CONFLICT(id) DO UPDATE SET
  app_key = excluded.app_key,
  signing_secret_ciphertext = excluded.signing_secret_ciphertext,
  launch_url = excluded.launch_url,
  api_base_url = excluded.api_base_url,
  cost_per_play = excluded.cost_per_play,
  status = excluded.status,
  active = excluded.active;