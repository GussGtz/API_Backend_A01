const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const axios = require('axios');
const db = require('./db');

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const RECAPTCHA_SECRET = process.env.RECAPTCHA_SECRET;

app.post('/api/contact', async (req, res) => {
  const {
    nombre,
    correo,
    telefono,
    mensaje,
    terminos,
    'g-recaptcha-response': token
  } = req.body;

  const aceptoTerminos = terminos === 'on' || terminos === true || terminos === 'true';

  if (!token) {
    return res.status(400).json({ error: 'Token de reCAPTCHA faltante' });
  }

  try {
    // Verificar reCAPTCHA con Google
    const verification = await axios.post(
      'https://www.google.com/recaptcha/api/siteverify',
      null,
      {
        params: {
          secret: process.env.RECAPTCHA_SECRET,
          response: token,
        },
      }
    );

    const pasoCaptcha = verification.data.success;

    // Insertar en la base de datos
    const query = `
      INSERT INTO contactos (nombre, correo, telefono, mensaje, acepto_terminos, paso_captcha)
      VALUES (?, ?, ?, ?, ?, ?)
    `;
    const values = [nombre, correo, telefono, mensaje, aceptoTerminos, pasoCaptcha];

    db.query(query, values, (err, result) => {
      if (err) {
        console.error('❌ Error al guardar en la base de datos:', err);
        return res.status(500).json({ error: 'Error al guardar en base de datos' });
      }

      res.status(200).json({ message: 'Formulario guardado correctamente' });
    });
  } catch (err) {
    console.error('❌ Error al verificar reCAPTCHA:', err);
    res.status(500).json({ error: 'Error al verificar reCAPTCHA' });
  }
});

// Iniciar servidor
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log('Servidor corriendo en http://localhost:${PORT}');
});