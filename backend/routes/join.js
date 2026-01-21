import express from 'express';
import crypto from 'crypto';
import db from '../db/connection.js';

const router = express.Router();

// Generate a secure session token for student
function generateSessionToken() {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * GET /api/join/:accessCode
 * Get session information before joining
 */
router.get('/:accessCode', async (req, res) => {
  try {
    const { accessCode } = req.params;

    const result = await db.query(
      `SELECT
        s.id, s.title, s.description, s.topic_count, s.topic_duration,
        s.interview_mode, s.status, s.starts_at, s.ends_at,
        t.name as teacher_name
       FROM assignment_sessions s
       JOIN teachers t ON s.teacher_id = t.id
       WHERE s.access_code = $1`,
      [accessCode.toUpperCase()]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Session not found', code: 'SESSION_NOT_FOUND' });
    }

    const session = result.rows[0];

    // Check session status
    if (session.status === 'draft') {
      return res.status(403).json({
        error: 'Session is not yet active',
        code: 'SESSION_NOT_ACTIVE'
      });
    }

    if (session.status === 'closed') {
      return res.status(403).json({
        error: 'Session has been closed',
        code: 'SESSION_CLOSED'
      });
    }

    // Check if session has ended
    if (session.ends_at && new Date(session.ends_at) < new Date()) {
      return res.status(403).json({
        error: 'Session deadline has passed',
        code: 'SESSION_EXPIRED'
      });
    }

    // Return session info (without sensitive data)
    res.json({
      session: {
        id: session.id,
        title: session.title,
        description: session.description,
        topicCount: session.topic_count,
        topicDuration: session.topic_duration,
        interviewMode: session.interview_mode,
        teacherName: session.teacher_name,
        endsAt: session.ends_at,
      }
    });
  } catch (error) {
    console.error('Get session info error:', error);
    res.status(500).json({ error: 'Failed to get session info' });
  }
});

/**
 * POST /api/join/:accessCode
 * Join a session as a student
 */
router.post('/:accessCode', async (req, res) => {
  try {
    const { accessCode } = req.params;
    const { student_name: studentName, student_id: studentId } = req.body;

    if (!studentName || studentName.trim().length === 0) {
      return res.status(400).json({ error: 'Student name is required' });
    }

    // Get session
    const sessionResult = await db.query(
      `SELECT id, status, ends_at, topic_count, topic_duration, interview_mode
       FROM assignment_sessions
       WHERE access_code = $1`,
      [accessCode.toUpperCase()]
    );

    if (sessionResult.rows.length === 0) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const session = sessionResult.rows[0];

    // Validate session status
    if (session.status !== 'active') {
      return res.status(403).json({
        error: session.status === 'draft' ? 'Session is not yet active' : 'Session has been closed'
      });
    }

    if (session.ends_at && new Date(session.ends_at) < new Date()) {
      return res.status(403).json({ error: 'Session deadline has passed' });
    }

    // Check if student already joined (by name and studentId combination)
    const existingParticipant = await db.query(
      `SELECT id, session_token, status FROM student_participants
       WHERE session_id = $1 AND student_name = $2
       ${studentId ? 'AND student_id = $3' : 'AND student_id IS NULL'}`,
      studentId ? [session.id, studentName.trim(), studentId.trim()] : [session.id, studentName.trim()]
    );

    if (existingParticipant.rows.length > 0) {
      const existing = existingParticipant.rows[0];

      // If completed or abandoned, don't allow rejoining
      if (existing.status === 'completed' || existing.status === 'abandoned') {
        return res.status(403).json({
          error: 'You have already completed or been removed from this session',
          status: existing.status
        });
      }

      // Return existing token for reconnection
      return res.json({
        message: 'Reconnected to existing session',
        sessionToken: existing.session_token,
        participantId: existing.id,
        status: existing.status,
        isReconnection: true,
      });
    }

    // Generate session token
    const sessionToken = generateSessionToken();

    // Create participant
    const participantResult = await db.query(
      `INSERT INTO student_participants
       (session_id, student_name, student_id, session_token)
       VALUES ($1, $2, $3, $4)
       RETURNING id, status`,
      [session.id, studentName.trim(), studentId?.trim() || null, sessionToken]
    );

    const participant = participantResult.rows[0];

    res.status(201).json({
      message: 'Successfully joined session',
      sessionToken,
      participantId: participant.id,
      status: participant.status,
      isReconnection: false,
      sessionSettings: {
        topicCount: session.topic_count,
        topicDuration: session.topic_duration,
        interviewMode: session.interview_mode,
      }
    });
  } catch (error) {
    console.error('Join session error:', error);
    res.status(500).json({ error: 'Failed to join session' });
  }
});

/**
 * POST /api/join/reconnect
 * Reconnect to an existing session using stored token
 */
router.post('/reconnect', async (req, res) => {
  try {
    const { sessionToken } = req.body;

    if (!sessionToken) {
      return res.status(400).json({ error: 'Session token is required' });
    }

    // Get participant with session info
    const result = await db.query(
      `SELECT
        p.id, p.student_name, p.student_id, p.status, p.disconnected_at,
        p.submitted_file_name, p.extracted_text, p.analyzed_topics,
        p.chosen_interview_mode,
        s.id as session_id, s.title as session_title, s.topic_count,
        s.topic_duration, s.interview_mode, s.status as session_status,
        s.reconnect_timeout, s.ends_at,
        i.current_topic_index, i.current_phase, i.topics_state,
        i.topic_started_at, i.accumulated_pause_time
       FROM student_participants p
       JOIN assignment_sessions s ON p.session_id = s.id
       LEFT JOIN interview_states i ON i.participant_id = p.id
       WHERE p.session_token = $1`,
      [sessionToken]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const data = result.rows[0];

    // Check session status
    if (data.session_status !== 'active') {
      return res.status(403).json({ error: 'Session is no longer active' });
    }

    // Check if session deadline passed
    if (data.ends_at && new Date(data.ends_at) < new Date()) {
      return res.status(403).json({ error: 'Session deadline has passed' });
    }

    // Check participant status
    if (data.status === 'completed') {
      return res.status(403).json({
        error: 'Interview already completed',
        status: 'completed'
      });
    }

    if (data.status === 'abandoned' || data.status === 'timeout') {
      return res.status(403).json({
        error: 'Cannot continue this interview',
        status: data.status
      });
    }

    // Check reconnection timeout
    let timeDeducted = 0;
    if (data.disconnected_at) {
      const disconnectedAt = new Date(data.disconnected_at);
      const now = new Date();
      const disconnectedDuration = (now - disconnectedAt) / 1000;

      if (disconnectedDuration > data.reconnect_timeout) {
        // Too late - mark as abandoned
        await db.query(
          `UPDATE student_participants
           SET status = 'abandoned', interview_ended_at = NOW()
           WHERE id = $1`,
          [data.id]
        );

        return res.status(403).json({
          error: 'Reconnection timeout exceeded',
          disconnectedDuration: Math.floor(disconnectedDuration),
          reconnectTimeout: data.reconnect_timeout,
        });
      }

      // Calculate time deducted during disconnection (only if topic was active)
      if (data.current_phase === 'topic_active' || data.current_phase === 'topic_paused') {
        timeDeducted = Math.floor(disconnectedDuration);
      }

      // Clear disconnection status and restore interview_in_progress
      await db.query(
        `UPDATE student_participants
         SET disconnected_at = NULL,
             last_active_at = NOW(),
             status = CASE
               WHEN status = 'interview_paused' THEN 'interview_in_progress'
               ELSE status
             END
         WHERE id = $1`,
        [data.id]
      );
    }

    // Calculate remaining time for current topic
    let remainingTime = null;
    if (data.topics_state && data.current_topic_index !== null) {
      const currentTopic = data.topics_state[data.current_topic_index];
      if (currentTopic && data.topic_started_at) {
        const elapsed = (Date.now() - new Date(data.topic_started_at).getTime()) / 1000
                        - (data.accumulated_pause_time || 0);
        remainingTime = Math.max(0, currentTopic.totalTime - elapsed);
      } else if (currentTopic) {
        remainingTime = currentTopic.timeLeft || currentTopic.totalTime;
      }
    }

    res.json({
      message: 'Reconnection successful',
      participantId: data.id,
      studentName: data.student_name,
      status: data.status === 'interview_paused' ? 'interview_in_progress' : data.status,
      timeDeducted,
      sessionInfo: {
        id: data.session_id,
        title: data.session_title,
        topicCount: data.topic_count,
        topicDuration: data.topic_duration,
        interviewMode: data.interview_mode,
      },
      interviewState: data.topics_state ? {
        currentTopicIndex: data.current_topic_index,
        currentPhase: data.current_phase,
        topicsState: data.topics_state,
        remainingTime,
      } : null,
      fileSubmitted: !!data.submitted_file_name,
      analyzedTopics: data.analyzed_topics,
      chosenInterviewMode: data.chosen_interview_mode,
    });
  } catch (error) {
    console.error('Reconnect error:', error);
    res.status(500).json({ error: 'Failed to reconnect' });
  }
});

export default router;
