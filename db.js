const mysql = require('mysql2');
require('dotenv').config();

const db = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: 'root',
  database: 'formulario_db'
});

db.connect((err) => {
  if (err) {
    console.error('❌ Error al conectar a la base de datos:', err);
  } else {
    console.log('✅ Conectado a la base de datos MySQL');
  }
});

module.exports = db;
