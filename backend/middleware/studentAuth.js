import db from '../db/connection.js';

/**
 * Student session token authentication middleware
 * Verifies session token and attaches participant info to request
 */
export async function authenticateStudent(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    const xSessionToken = req.headers['x-session-token'];

    // Support both Authorization: Bearer and X-Session-Token headers
    let sessionToken;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      sessionToken = authHeader.split(' ')[1];
    } else if (xSessionToken) {
      sessionToken = xSessionToken;
    } else {
      return res.status(401).json({ error: 'Session token required' });
    }

    // Get participant with session info
    const result = await db.query(
      `SELECT
        p.id, p.session_id, p.student_name, p.student_id, p.status,
        p.submitted_file_url, p.submitted_file_name, p.extracted_text,
        p.analyzed_topics, p.chosen_interview_mode, p.disconnected_at,
        p.last_active_at, p.summary,
        s.title as session_title, s.topic_count, s.topic_duration,
        s.interview_mode as session_interview_mode, s.status as session_status,
        s.reconnect_timeout, s.ends_at
      FROM student_participants p
      JOIN assignment_sessions s ON p.session_id = s.id
      WHERE p.session_token = $1`,
      [sessionToken]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid session token' });
    }

    const participant = result.rows[0];

    // Check if session is active
    if (participant.session_status !== 'active') {
      return res.status(403).json({
        error: 'Session not active',
        sessionStatus: participant.session_status
      });
    }

    // Check if session has ended
    if (participant.ends_at && new Date(participant.ends_at) < new Date()) {
      return res.status(403).json({ error: 'Session has ended' });
    }

    // Check if participant is abandoned or timed out (cannot continue)
    if (participant.status === 'abandoned' || participant.status === 'timeout') {
      return res.status(403).json({
        error: 'Cannot continue interview',
        status: participant.status,
        message: participant.status === 'abandoned'
          ? 'Reconnection timeout exceeded'
          : 'Interview time exceeded'
      });
    }

    // Update last active timestamp
    await db.query(
      'UPDATE student_participants SET last_active_at = NOW() WHERE id = $1',
      [participant.id]
    );

    req.participant = participant;
    req.sessionToken = sessionToken;
    next();
  } catch (error) {
    console.error('Student auth middleware error:', error);
    return res.status(500).json({ error: 'Authentication failed' });
  }
}

/**
 * Check if participant can reconnect
 * Used for reconnection attempts
 */
export async function checkReconnection(req, res, next) {
  try {
    const participant = req.participant;

    if (!participant.disconnected_at) {
      // Not disconnected, proceed normally
      return next();
    }

    const disconnectedAt = new Date(participant.disconnected_at);
    const now = new Date();
    const disconnectedDuration = (now - disconnectedAt) / 1000; // in seconds

    if (disconnectedDuration > participant.reconnect_timeout) {
      // Too late to reconnect - mark as abandoned
      await db.query(
        `UPDATE student_participants
         SET status = 'abandoned', interview_ended_at = NOW()
         WHERE id = $1`,
        [participant.id]
      );

      return res.status(403).json({
        error: 'Reconnection timeout exceeded',
        disconnectedDuration: Math.floor(disconnectedDuration),
        reconnectTimeout: participant.reconnect_timeout,
      });
    }

    // Can reconnect - clear disconnection status
    await db.query(
      `UPDATE student_participants
       SET disconnected_at = NULL,
           status = CASE
             WHEN status = 'interview_paused' THEN 'interview_in_progress'
             ELSE status
           END
       WHERE id = $1`,
      [participant.id]
    );

    // Add reconnection info to request
    req.reconnectionInfo = {
      wasDisconnected: true,
      disconnectedDuration: Math.floor(disconnectedDuration),
    };

    next();
  } catch (error) {
    console.error('Reconnection check error:', error);
    return res.status(500).json({ error: 'Reconnection check failed' });
  }
}

/**
 * Validate session token without full authentication
 * Used for lightweight checks
 */
export async function validateSessionToken(sessionToken) {
  const result = await db.query(
    `SELECT p.id, p.status, p.disconnected_at, s.reconnect_timeout
     FROM student_participants p
     JOIN assignment_sessions s ON p.session_id = s.id
     WHERE p.session_token = $1`,
    [sessionToken]
  );

  if (result.rows.length === 0) {
    return { valid: false, error: 'Invalid token' };
  }

  const participant = result.rows[0];

  if (participant.status === 'abandoned' || participant.status === 'timeout') {
    return {
      valid: false,
      error: 'Cannot continue',
      status: participant.status
    };
  }

  return {
    valid: true,
    participantId: participant.id,
    status: participant.status,
  };
}

export default {
  authenticateStudent,
  checkReconnection,
  validateSessionToken,
};
