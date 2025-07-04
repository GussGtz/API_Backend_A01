const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const axios = require('axios');
const db = require('./db');
const { body, validationResult } = require('express-validator');

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

app.post('/api/contact', [
  body('nombre')
    .trim()
    .escape()
    .notEmpty().withMessage('El nombre es obligatorio'),
  body('correo')
    .isEmail().withMessage('Correo no válido')
    .normalizeEmail(),
  body('telefono')
    .trim()
    .escape()
    .isLength({ min: 7, max: 15 }).withMessage('Teléfono no válido'),
  body('mensaje')
    .trim()
    .escape()
    .notEmpty().withMessage('El mensaje es obligatorio'),
  body('terminos')
    .toBoolean(),
  body('g-recaptcha-response')
    .notEmpty().withMessage('Token de reCAPTCHA faltante')
], async (req, res) => {

  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const {
    nombre,
    correo,
    telefono,
    mensaje,
    terminos,
    'g-recaptcha-response': token
  } = req.body;

  try {
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

    const query = `
      INSERT INTO contactos (nombre, correo, telefono, mensaje, acepto_terminos, paso_captcha)
      VALUES (?, ?, ?, ?, ?, ?)
    `;
    const values = [nombre, correo, telefono, mensaje, terminos, pasoCaptcha];

    db.query(query, values, (err, result) => {
      if (err) {
        console.error('❌ Error al guardar en la base de datos:', err);
        return res.status(500).json({ error: 'Error al guardar en base de datos' });
      }

        notificarDiscord(nombre, correo, mensaje);

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

// Función para notificar a Discord

function notificarDiscord(nombre, correo, mensaje) {
  const webhookUrl = 'https://discord.com/api/webhooks/1390764922778161162/Q587MbLC6ZgYMfwUXBR1QmVqKMJMfUomHNhRCnRrfYqv6SFYcqw9EQ_OlNFNWYmFLDKb';
  const payload = {
    content: `📥 Nuevo lead recibido:\n**Nombre:** ${nombre}\n**Correo:** ${correo}\n**Mensaje:** ${mensaje}`
  };

  axios.post(webhookUrl, payload)
    .then(() => console.log('✅ Notificación enviada a Discord'))
    .catch((err) => console.error('❌ Error al enviar a Discord:', err));
}
