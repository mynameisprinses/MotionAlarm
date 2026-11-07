import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

test('PostgreSQL enforces account isolation, immutable events, and idempotent uploads', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon;
      create role authenticated;
      create schema auth;
      create table auth.users (id uuid primary key);
      create function auth.uid() returns uuid language sql stable as
        'select nullif(current_setting(''request.jwt.claim.sub'', true), '''')::uuid';
      grant usage on schema public, auth to anon, authenticated;
      insert into auth.users values ('11111111-1111-4111-8111-111111111111'), ('22222222-2222-4222-8222-222222222222');
    `);
    await db.exec(
      await readFile(new URL('../supabase/migrations/20261107024658_create_motion_alarm.sql', import.meta.url), 'utf8'),
    );
    await db.exec(`set role authenticated; set request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111'`);
    await db.query(`select public.record_movement_alert('movement', '2026-11-07T00:00:00Z', 2.5)`);
    assert.equal((await db.query('select * from public.alerts')).rows.length, 1);
    await db.exec(`update public.alerts set status = 'Reviewed' where id = 'movement'`);
    assert.equal((await db.query('select status from public.alerts')).rows[0].status, 'Reviewed');
    await assert.rejects(db.exec(`update public.alerts set strength = 10`), /permission denied/);
    await assert.rejects(
      db.exec(`update public.alerts set user_id = '22222222-2222-4222-8222-222222222222'`),
      /permission denied/,
    );
    await assert.rejects(db.exec(`update public.alerts set status = 'Invalid'`), /check constraint/);
    await assert.rejects(
      db.exec(`insert into public.alerts (id, created_at, source) values ('test', now(), 'Test')`),
      /check constraint/,
    );
    await assert.rejects(
      db.query(`select public.record_movement_alert('bad-strength', now(), -1)`),
      /check constraint/,
    );
    assert.equal((await db.query(`select * from public.alert_imports where id = 'bad-strength'`)).rows.length, 0);
    await assert.rejects(db.exec(`delete from public.alert_imports`), /permission denied/);
    await assert.rejects(
      db.exec(
        `insert into public.alerts (user_id, id, created_at) values ('22222222-2222-4222-8222-222222222222', 'forged', now())`,
      ),
      /row-level security/,
    );
    await db.exec(`set request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222'`);
    assert.equal((await db.query('select * from public.alerts')).rows.length, 0);
    assert.equal((await db.query('select * from public.alert_imports')).rows.length, 0);
    await db.exec(
      `update public.alerts set status = 'New' where id = 'movement'; delete from public.alerts where id = 'movement'`,
    );
    await db.exec(`set request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111'`);
    assert.equal((await db.query('select status from public.alerts')).rows[0].status, 'Reviewed');
    await db.exec(`delete from public.alerts where id = 'movement'`);
    await db.query(`select public.record_movement_alert('movement', now(), 2.5)`);
    assert.equal((await db.query('select * from public.alerts')).rows.length, 0);
    assert.equal((await db.query('select * from public.alert_imports')).rows.length, 1);
    await db.exec('set role anon');
    await assert.rejects(db.query('select * from public.alerts'), /permission denied/);
    await assert.rejects(db.query(`select public.record_movement_alert('anonymous', now(), 2.5)`), /permission denied/);
    await db.exec(`reset role`);
    const tables = (await db.query(`select tablename, rowsecurity from pg_tables where schemaname = 'public'`)).rows;
    assert.ok(tables.every((table) => table.rowsecurity));
    const fn = (await db.query(`select prosecdef from pg_proc where proname = 'record_movement_alert'`)).rows[0];
    assert.equal(fn.prosecdef, false);
  } finally {
    await db.close();
  }
});
