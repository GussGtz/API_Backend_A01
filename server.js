const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const db = require('./db');

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Ruta para guardar los datos del formulario
app.post('/api/contact', (req, res) => {
  const { nombre, correo, telefono, mensaje } = req.body;

  const query = 'INSERT INTO contactos (nombre, correo, telefono, mensaje) VALUES (?, ?, ?, ?)';
  db.query(query, [nombre, correo, telefono, mensaje], (err, result) => {
    if (err) {
      console.error('❌ Error al guardar en la base de datos:', err);
      res.status(500).json({ error: 'Error al guardar' });
    } else {
      res.status(200).json({ message: 'Formulario guardado correctamente' });
    }
  });
});

// Iniciar servidor
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
});
