import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import db from './connection.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * 데이터베이스 마이그레이션 스크립트
 * schema.sql 파일을 실행하여 테이블 생성
 */
async function migrate() {
  console.log('🔄 Starting database migration...\n');

  try {
    // 스키마 파일 읽기
    const schemaPath = path.join(__dirname, 'schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf-8');

    // 스키마 실행
    await db.query(schema);

    console.log('✅ Database migration completed successfully!\n');
    console.log('Created tables:');
    console.log('  - teachers');
    console.log('  - assignment_sessions');
    console.log('  - student_participants');
    console.log('  - interview_states');
    console.log('  - interview_conversations');
    console.log('');
    console.log('Created indexes and triggers');

  } catch (error) {
    // 이미 존재하는 경우 에러 처리
    if (error.code === '42P07') {
      console.log('⚠️  Tables already exist. Skipping creation.');
    } else if (error.code === '42710') {
      console.log('⚠️  Some objects already exist. Migration partially completed.');
    } else {
      console.error('❌ Migration failed:', error.message);
      throw error;
    }
  } finally {
    await db.closePool();
  }
}

/**
 * 데이터베이스 초기화 (모든 테이블 삭제)
 * 주의: 모든 데이터가 삭제됩니다!
 */
async function reset() {
  console.log('⚠️  Resetting database (all data will be lost)...\n');

  try {
    await db.query(`
      DROP TABLE IF EXISTS interview_conversations CASCADE;
      DROP TABLE IF EXISTS interview_states CASCADE;
      DROP TABLE IF EXISTS student_participants CASCADE;
      DROP TABLE IF EXISTS assignment_sessions CASCADE;
      DROP TABLE IF EXISTS teachers CASCADE;
      DROP FUNCTION IF EXISTS update_updated_at_column() CASCADE;
      DROP EXTENSION IF EXISTS "uuid-ossp" CASCADE;
    `);

    console.log('✅ Database reset completed!\n');

  } catch (error) {
    console.error('❌ Reset failed:', error.message);
    throw error;
  } finally {
    await db.closePool();
  }
}

/**
 * 데이터베이스 상태 확인
 */
async function status() {
  console.log('📊 Checking database status...\n');

  try {
    const tables = await db.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);

    if (tables.rows.length === 0) {
      console.log('No tables found. Run migration first.');
    } else {
      console.log('Existing tables:');
      for (const row of tables.rows) {
        const count = await db.query(`SELECT COUNT(*) FROM ${row.table_name}`);
        console.log(`  - ${row.table_name}: ${count.rows[0].count} rows`);
      }
    }

  } catch (error) {
    console.error('❌ Status check failed:', error.message);
  } finally {
    await db.closePool();
  }
}

// CLI 처리
const command = process.argv[2];

switch (command) {
  case 'up':
  case 'migrate':
    migrate().catch(console.error);
    break;
  case 'reset':
    reset().then(() => migrate()).catch(console.error);
    break;
  case 'down':
    reset().catch(console.error);
    break;
  case 'status':
    status().catch(console.error);
    break;
  default:
    console.log('Usage: node db/migrate.js <command>');
    console.log('');
    console.log('Commands:');
    console.log('  up, migrate  - Run migrations (create tables)');
    console.log('  reset        - Drop all tables and run migrations');
    console.log('  down         - Drop all tables');
    console.log('  status       - Show database status');
    process.exit(0);
}
