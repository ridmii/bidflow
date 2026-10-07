import { config } from 'dotenv';
import { Client } from 'pg';

config({ path: '.env.test' });

let client;

beforeAll(async () => {
  if (process.env.NODE_ENV !== 'test') {
    throw new Error('NODE_ENV must be test');
  }
  client = new Client({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    user: process.env.DB_USERNAME || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    database: process.env.DB_NAME || 'auction_test_db',
  });
  await client.connect();
});

afterAll(async () => {
  if (client) {
    await client.end();
  }
});

beforeEach(async () => {
  if (client) {
    const res = await client.query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public';");
    for (const row of res.rows) {
      if (row.table_name !== 'migrations') {
        await client.query('TRUNCATE TABLE ' + '"' + row.table_name + '"' + ' CASCADE;');
      }
    }
  }
});
