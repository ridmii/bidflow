const { Client } = require('pg');
const client = new Client({
  host: 'localhost',
  port: 5432,
  user: 'postgres',
  password: 'postgres',
  database: 'auction_db'
});
client.connect().then(() => {
  return client.query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public';");
}).then(res => {
  console.log('Tables in auction_db:');
  res.rows.forEach(row => console.log(' - ' + row.table_name));
  process.exit(0);
}).catch(err => {
  console.error(err);
  process.exit(1);
});
