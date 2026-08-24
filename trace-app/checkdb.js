const sqlite3 = require('sqlite3');
const db = new sqlite3.Database('C:/Users/fateh/Downloads/accenture_hackathon/trace-app/db/trace.db');
db.all('SELECT * FROM sqlite_master WHERE type="table"', [], (err, rows) => {
  console.log(JSON.stringify(rows, null, 2));
  db.close();
});