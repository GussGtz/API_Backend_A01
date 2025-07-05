const bcrypt = require('bcrypt');
const mysql = require('mysql2'); // o mysql2/promise si usas promesas

const connection = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: '',
  database: 'formulario_db'
});

const nombre = 'Gustavo';
const correo = 'Gustavo@admin.com';
const passwordPlano = '12345678'; 
const rol = 'admin';

bcrypt.hash(passwordPlano, 10, (err, hash) => {
  if (err) {
    return console.error('Error al hashear la contraseña:', err);
  }

  const query = 'INSERT INTO usuarios (nombre, correo, password, rol) VALUES (?, ?, ?, ?)';
  const values = [nombre, correo, hash, rol];

  connection.query(query, values, (err, results) => {
    if (err) {
      console.error('Error al insertar el usuario:', err);
    } else {
      console.log('Usuario admin creado con éxito:', results);
    }

    connection.end();
  });
});
