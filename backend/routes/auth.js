import express from 'express';
import bcrypt from 'bcryptjs';
import db from '../db/connection.js';
import { generateTeacherToken, authenticateTeacher } from '../middleware/auth.js';

const router = express.Router();

/**
 * POST /api/auth/register
 * Register a new teacher
 */
router.post('/register', async (req, res) => {
  try {
    const { email, password, name } = req.body;

    // Validation
    if (!email || !password || !name) {
      return res.status(400).json({
        error: 'Missing required fields',
        required: ['email', 'password', 'name']
      });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    // Check if email already exists
    const existingTeacher = await db.query(
      'SELECT id FROM teachers WHERE email = $1',
      [email.toLowerCase()]
    );

    if (existingTeacher.rows.length > 0) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    // Hash password
    const salt = await bcrypt.genSalt(12);
    const passwordHash = await bcrypt.hash(password, salt);

    // Create teacher
    const result = await db.query(
      `INSERT INTO teachers (email, password_hash, name)
       VALUES ($1, $2, $3)
       RETURNING id, email, name, created_at`,
      [email.toLowerCase(), passwordHash, name]
    );

    const teacher = result.rows[0];

    // Generate token
    const token = generateTeacherToken(teacher.id);

    res.status(201).json({
      message: 'Registration successful',
      teacher: {
        id: teacher.id,
        email: teacher.email,
        name: teacher.name,
      },
      token,
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
});

/**
 * POST /api/auth/login
 * Login teacher and get JWT token
 */
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        error: 'Missing required fields',
        required: ['email', 'password']
      });
    }

    // Find teacher
    const result = await db.query(
      'SELECT id, email, name, password_hash FROM teachers WHERE email = $1',
      [email.toLowerCase()]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const teacher = result.rows[0];

    // Verify password
    const isValidPassword = await bcrypt.compare(password, teacher.password_hash);

    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Generate token
    const token = generateTeacherToken(teacher.id);

    res.json({
      message: 'Login successful',
      teacher: {
        id: teacher.id,
        email: teacher.email,
        name: teacher.name,
      },
      token,
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

/**
 * POST /api/auth/logout
 * Logout (client-side token removal, server-side logging)
 */
router.post('/logout', authenticateTeacher, async (req, res) => {
  // In a more complex system, you might want to blacklist the token
  // For now, just acknowledge the logout
  res.json({ message: 'Logout successful' });
});

/**
 * GET /api/auth/me
 * Get current teacher info
 */
router.get('/me', authenticateTeacher, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT id, email, name, created_at,
       (SELECT COUNT(*) FROM assignment_sessions WHERE teacher_id = $1) as session_count
       FROM teachers WHERE id = $1`,
      [req.teacher.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Teacher not found' });
    }

    res.json({ teacher: result.rows[0] });
  } catch (error) {
    console.error('Get me error:', error);
    res.status(500).json({ error: 'Failed to get teacher info' });
  }
});

/**
 * PUT /api/auth/password
 * Change password
 */
router.put('/password', authenticateTeacher, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        error: 'Missing required fields',
        required: ['currentPassword', 'newPassword']
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters' });
    }

    // Get current password hash
    const result = await db.query(
      'SELECT password_hash FROM teachers WHERE id = $1',
      [req.teacher.id]
    );

    const teacher = result.rows[0];

    // Verify current password
    const isValidPassword = await bcrypt.compare(currentPassword, teacher.password_hash);

    if (!isValidPassword) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }

    // Hash new password
    const salt = await bcrypt.genSalt(12);
    const newPasswordHash = await bcrypt.hash(newPassword, salt);

    // Update password
    await db.query(
      'UPDATE teachers SET password_hash = $1 WHERE id = $2',
      [newPasswordHash, req.teacher.id]
    );

    res.json({ message: 'Password changed successfully' });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ error: 'Failed to change password' });
  }
});

export default router;
