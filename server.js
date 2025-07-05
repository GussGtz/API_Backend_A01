const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const axios = require('axios');
const db = require('./db');
const { body, validationResult } = require('express-validator');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

const SECRET_KEY = process.env.JWT_SECRET || '01dd92910a0e838b2d7db20381105025ee6ed761af5d4aad1c61b6a10d397829bdd0dca6857c76e032c0ad1009732d2e30075a98b44a042744e6b9a487603910';

// Middleware: autenticar JWT
function authenticateJWT(req, res, next) {
  const authHeader = req.headers.authorization;
  if (authHeader) {
    const token = authHeader.split(' ')[1];
    jwt.verify(token, SECRET_KEY, (err, user) => {
      if (err) return res.status(403).json({ error: 'Token inválido' });
      req.user = user;
      next();
    });
  } else {
    res.status(401).json({ error: 'No autorizado, token faltante' });
  }
}

// Middleware: solo admins
function requireAdmin(req, res, next) {
  if (req.user?.rol === 'admin') return next();
  return res.status(403).json({ error: 'Acceso denegado: solo administradores' });
}

// Guardar leads desde el formulario
app.post('/api/contact', [
  body('nombre').trim().escape().notEmpty().withMessage('El nombre es obligatorio'),
  body('correo').isEmail().withMessage('Correo no válido').normalizeEmail(),
  body('telefono').trim().escape().isLength({ min: 7, max: 15 }).withMessage('Teléfono no válido'),
  body('mensaje').trim().escape().notEmpty().withMessage('El mensaje es obligatorio'),
  body('terminos').toBoolean(),
  body('g-recaptcha-response').notEmpty().withMessage('Token de reCAPTCHA faltante')
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { nombre, correo, telefono, mensaje, terminos, 'g-recaptcha-response': token } = req.body;

  try {
    const verification = await axios.post(
      'https://www.google.com/recaptcha/api/siteverify',
      null,
      { params: { secret: process.env.RECAPTCHA_SECRET, response: token } }
    );

    const pasoCaptcha = verification.data.success;
    const query = `INSERT INTO contactos (nombre, correo, telefono, mensaje, acepto_terminos, paso_captcha, estado) VALUES (?, ?, ?, ?, ?, ?, ?)`;
    const values = [nombre, correo, telefono, mensaje, terminos, pasoCaptcha, 'nuevo'];

    db.query(query, values, (err) => {
      if (err) return res.status(500).json({ error: 'Error al guardar en base de datos' });
      notificarDiscord(nombre, correo, mensaje);
      res.status(200).json({ message: 'Formulario guardado correctamente' });
    });
  } catch (err) {
    res.status(500).json({ error: 'Error al verificar reCAPTCHA' });
  }
});

// Registro de usuarios
app.post('/api/register', async (req, res) => {
  const { nombre, correo, password, confirmPassword } = req.body;

  if (!nombre || !correo || !password || !confirmPassword)
    return res.status(400).json({ message: 'Todos los campos son obligatorios' });

  if (password !== confirmPassword)
    return res.status(400).json({ message: 'Las contraseñas no coinciden' });

  try {
    db.query('SELECT * FROM usuarios WHERE correo = ?', [correo], async (err, results) => {
      if (err) return res.status(500).json({ message: 'Error interno al verificar el correo' });
      if (results.length > 0) return res.status(400).json({ message: 'El correo ya está registrado' });

      const hashedPassword = await bcrypt.hash(password, 10);
      db.query('INSERT INTO usuarios (nombre, correo, password) VALUES (?, ?, ?)', [nombre, correo, hashedPassword], (err) => {
        if (err) return res.status(500).json({ message: 'Error interno al registrar' });
        res.status(200).json({ message: 'Registro exitoso' });
      });
    });
  } catch {
    res.status(500).json({ message: 'Error interno del servidor' });
  }
});

// Login con JWT
app.post('/api/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Correo y contraseña requeridos' });

  db.query('SELECT * FROM usuarios WHERE correo = ?', [email], async (err, results) => {
    if (err) return res.status(500).json({ error: 'Error en base de datos' });
    if (results.length === 0) return res.status(401).json({ error: 'Usuario no encontrado' });

    const user = results[0];
    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(401).json({ error: 'Contraseña incorrecta' });

    const token = jwt.sign(
      { id: user.id, nombre: user.nombre, correo: user.correo, rol: user.rol },
      SECRET_KEY,
      { expiresIn: '8h' }
    );

    res.status(200).json({
      message: 'Inicio de sesión exitoso',
      token,
      user: { id: user.id, nombre: user.nombre, correo: user.correo, rol: user.rol }
    });
  });
});

// Devolver usuario actual
app.get('/api/user', authenticateJWT, (req, res) => {
  res.json(req.user);
});

// Obtener leads (paginado)
app.get('/api/leads', authenticateJWT, (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = 10;
  const offset = (page - 1) * limit;

  db.query('SELECT COUNT(*) AS total FROM contactos', (err, countResult) => {
    if (err) return res.status(500).json({ error: 'Error al contar leads' });
    const total = countResult[0].total;

    db.query(
      `SELECT id, nombre, correo, telefono, mensaje, acepto_terminos, paso_captcha, estado FROM contactos ORDER BY id DESC LIMIT ? OFFSET ?`,
      [limit, offset],
      (err, results) => {
        if (err) return res.status(500).json({ error: 'Error al obtener leads' });
        res.json({ leads: results, total, page, pages: Math.ceil(total / limit) });
      }
    );
  });
});

// Cambiar estado del lead
app.put('/api/leads/:id/estado', authenticateJWT, (req, res) => {
  const { id } = req.params;
  const { estado } = req.body;
  const estadosValidos = ['nuevo', 'contactado', 'descartado'];
  if (!estadosValidos.includes(estado)) return res.status(400).json({ error: 'Estado inválido' });

  db.query('UPDATE contactos SET estado = ? WHERE id = ?', [estado, id], (err, result) => {
    if (err) return res.status(500).json({ error: 'Error al actualizar estado' });
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Lead no encontrado' });
    res.json({ message: 'Estado actualizado' });
  });
});

// Eliminar lead
app.delete('/api/leads/:id', authenticateJWT, (req, res) => {
  const { id } = req.params;
  db.query('DELETE FROM contactos WHERE id = ?', [id], (err, result) => {
    if (err) return res.status(500).json({ error: 'Error al eliminar lead' });
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Lead no encontrado' });
    res.json({ message: 'Lead eliminado exitosamente' });
  });
});

// Ruta solo para admin (ejemplo dashboard)
app.get('/api/dashboard', authenticateJWT, requireAdmin, (req, res) => {
  res.json({ message: 'Bienvenido al dashboard de admin' });
});

// Discord Webhook
function notificarDiscord(nombre, correo, mensaje) {
  const webhookUrl = 'https://discord.com/api/webhooks/1390764922778161162/Q587MbLC6ZgYMfwUXBR1QmVqKMJMfUomHNhRCnRrfYqv6SFYcqw9EQ_OlNFNWYmFLDKb';
  const payload = {
    content: `📥 Nuevo lead recibido:\n**Nombre:** ${nombre}\n**Correo:** ${correo}\n**Mensaje:** ${mensaje}`
  };
  axios.post(webhookUrl, payload).catch(() => {});
}

// Iniciar servidor
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});
