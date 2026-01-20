import jwt from 'jsonwebtoken';
import db from '../db/connection.js';

// JWT Secret must be set in environment - fail fast if not configured
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error('CRITICAL: JWT_SECRET environment variable is not set');
  if (process.env.NODE_ENV === 'production') {
    process.exit(1);
  }
}

/**
 * Teacher authentication middleware
 * Verifies JWT token and attaches teacher info to request
 */
export async function authenticateTeacher(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const token = authHeader.split(' ')[1];

    try {
      const decoded = jwt.verify(token, JWT_SECRET);

      // Verify teacher exists in database
      const result = await db.query(
        'SELECT id, email, name FROM teachers WHERE id = $1',
        [decoded.teacherId]
      );

      if (result.rows.length === 0) {
        return res.status(401).json({ error: 'Teacher not found' });
      }

      req.teacher = result.rows[0];
      next();
    } catch (jwtError) {
      if (jwtError.name === 'TokenExpiredError') {
        return res.status(401).json({ error: 'Token expired' });
      }
      return res.status(401).json({ error: 'Invalid token' });
    }
  } catch (error) {
    console.error('Auth middleware error:', error);
    return res.status(500).json({ error: 'Authentication failed' });
  }
}

/**
 * Optional teacher authentication
 * Attaches teacher info if token present, but doesn't require it
 */
export async function optionalTeacherAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next();
    }

    const token = authHeader.split(' ')[1];

    try {
      const decoded = jwt.verify(token, JWT_SECRET);

      const result = await db.query(
        'SELECT id, email, name FROM teachers WHERE id = $1',
        [decoded.teacherId]
      );

      if (result.rows.length > 0) {
        req.teacher = result.rows[0];
      }
    } catch {
      // Token invalid, continue without teacher
    }

    next();
  } catch (error) {
    console.error('Optional auth middleware error:', error);
    next();
  }
}

/**
 * Generate JWT token for teacher
 */
export function generateTeacherToken(teacherId) {
  return jwt.sign(
    { teacherId, type: 'teacher' },
    JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
  );
}

export default {
  authenticateTeacher,
  optionalTeacherAuth,
  generateTeacherToken,
};
