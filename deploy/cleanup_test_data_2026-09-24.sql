-- Remove data written to the production control database by an unisolated
-- test run on 24 September 2026 (before backend/tests/conftest.py existed).
--
-- Review before running. Run it yourself in the Supabase SQL editor.
-- It assumes BACKEND_DATABASE_SCHEMA = slayql; change the schema name if not.
-- Step 1 only reads. Step 2 deletes, inside a transaction you must commit.

-- Step 1: preview what belongs to the five test accounts.
WITH test_users AS (
  SELECT id, email FROM slayql.user_profiles
  WHERE email IN (
    'alex.chen@stripe.com',
    'owner@example.com',
    'other@example.com',
    'connection-update-owner@example.com',
    'connection-update-other@example.com'
  )
)
SELECT 'user_profiles' AS table_name, COUNT(*) FROM test_users
UNION ALL SELECT 'backend_sessions', COUNT(*) FROM slayql.backend_sessions WHERE user_id IN (SELECT id FROM test_users)
UNION ALL SELECT 'credit_transactions', COUNT(*) FROM slayql.credit_transactions WHERE user_id IN (SELECT id FROM test_users)
UNION ALL SELECT 'query_history', COUNT(*) FROM slayql.query_history WHERE owner_id IN (SELECT id FROM test_users)
UNION ALL SELECT 'chat_reports', COUNT(*) FROM slayql.chat_reports WHERE owner_id IN (SELECT id FROM test_users)
UNION ALL SELECT 'chat_messages', COUNT(*) FROM slayql.chat_messages WHERE owner_id IN (SELECT id FROM test_users)
UNION ALL SELECT 'chat_conversations', COUNT(*) FROM slayql.chat_conversations WHERE owner_id IN (SELECT id FROM test_users)
UNION ALL SELECT 'data_connections', COUNT(*) FROM slayql.data_connections WHERE owner_id IN (SELECT id FROM test_users);

-- Step 2: delete it, children first. Check the counts, then COMMIT or ROLLBACK.
BEGIN;
CREATE TEMP TABLE test_users ON COMMIT DROP AS
  SELECT id FROM slayql.user_profiles
  WHERE email IN (
    'alex.chen@stripe.com',
    'owner@example.com',
    'other@example.com',
    'connection-update-owner@example.com',
    'connection-update-other@example.com'
  );
DELETE FROM slayql.chat_reports       WHERE owner_id IN (SELECT id FROM test_users);
DELETE FROM slayql.chat_messages      WHERE owner_id IN (SELECT id FROM test_users);
DELETE FROM slayql.chat_conversations WHERE owner_id IN (SELECT id FROM test_users);
DELETE FROM slayql.query_history      WHERE owner_id IN (SELECT id FROM test_users);
DELETE FROM slayql.data_connections   WHERE owner_id IN (SELECT id FROM test_users);
DELETE FROM slayql.backend_sessions   WHERE user_id  IN (SELECT id FROM test_users);
DELETE FROM slayql.credit_transactions WHERE user_id IN (SELECT id FROM test_users);
DELETE FROM slayql.user_profiles      WHERE id       IN (SELECT id FROM test_users);
-- COMMIT;   -- uncomment after checking the reported row counts
-- ROLLBACK; -- or undo everything

-- Step 3 (read only): the shared reviewer account is used by real reviewers,
-- so it is not deleted. Inspect its reports and credit changes from 24 September
-- and remove test entries by hand if needed.
SELECT r.* FROM slayql.chat_reports r
JOIN slayql.user_profiles u ON u.id = r.owner_id
WHERE u.email = 'reviewer@slayql.demo'
ORDER BY r.created_at DESC
LIMIT 50;

SELECT t.* FROM slayql.credit_transactions t
JOIN slayql.user_profiles u ON u.id = t.user_id
WHERE u.email = 'reviewer@slayql.demo'
ORDER BY t.created_at DESC
LIMIT 50;
