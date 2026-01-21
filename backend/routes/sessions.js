import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import QRCode from 'qrcode';
import db from '../db/connection.js';
import { authenticateTeacher } from '../middleware/auth.js';

const router = express.Router();

// Generate a short access code (6 alphanumeric characters)
function generateAccessCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Excluding confusing chars
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// Generate QR code as data URL
async function generateQRCode(url) {
  try {
    return await QRCode.toDataURL(url, {
      width: 256,
      margin: 2,
      color: { dark: '#000000', light: '#ffffff' },
    });
  } catch (error) {
    console.error('QR code generation failed:', error);
    return null;
  }
}

/**
 * POST /api/sessions
 * Create a new assignment session
 */
router.post('/', authenticateTeacher, async (req, res) => {
  try {
    const {
      title,
      description,
      settings,
      // snake_case 지원
      topic_count,
      topic_duration,
      interview_mode,
      starts_at,
      ends_at,
      // camelCase 레거시 지원
      topicCount,
      topicDuration,
      interviewMode,
      startsAt,
      endsAt,
    } = req.body;

    // 우선순위: snake_case > camelCase > settings > 기본값
    const resolvedTopicCount = topic_count ?? topicCount ?? settings?.topic_count ?? 3;
    const resolvedTopicDuration = topic_duration ?? topicDuration ?? settings?.topic_duration ?? 180;
    const resolvedInterviewMode = interview_mode ?? interviewMode ?? settings?.interview_mode ?? 'student_choice';
    const resolvedStartsAt = starts_at ?? startsAt ?? null;
    const resolvedEndsAt = ends_at ?? endsAt ?? null;

    // Validation
    if (!title) {
      return res.status(400).json({ error: 'Title is required' });
    }

    // Generate unique access code
    let accessCode;
    let attempts = 0;
    while (attempts < 10) {
      accessCode = generateAccessCode();
      const existing = await db.query(
        'SELECT id FROM assignment_sessions WHERE access_code = $1',
        [accessCode]
      );
      if (existing.rows.length === 0) break;
      attempts++;
    }

    if (attempts === 10) {
      return res.status(500).json({ error: 'Failed to generate unique access code' });
    }

    // Generate QR code URL (will be updated with actual frontend URL)
    const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3010';
    const joinUrl = `${baseUrl}/join/${accessCode}`;
    const qrCodeUrl = await generateQRCode(joinUrl);

    // Create session
    const result = await db.query(
      `INSERT INTO assignment_sessions
       (teacher_id, title, description, topic_count, topic_duration, interview_mode,
        access_code, qr_code_url, starts_at, ends_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [
        req.teacher.id,
        title,
        description || null,
        resolvedTopicCount,
        resolvedTopicDuration,
        resolvedInterviewMode,
        accessCode,
        qrCodeUrl,
        resolvedStartsAt,
        resolvedEndsAt,
      ]
    );

    res.status(201).json({
      message: 'Session created',
      session: result.rows[0],
      joinUrl,
    });
  } catch (error) {
    console.error('Create session error:', error);
    res.status(500).json({ error: 'Failed to create session' });
  }
});

/**
 * GET /api/sessions
 * List all sessions for the authenticated teacher
 */
router.get('/', authenticateTeacher, async (req, res) => {
  try {
    const { status } = req.query;

    let query = `
      SELECT s.*,
        (SELECT COUNT(*) FROM student_participants WHERE session_id = s.id) as participant_count,
        (SELECT COUNT(*) FROM student_participants WHERE session_id = s.id AND status = 'completed') as completed_count
      FROM assignment_sessions s
      WHERE s.teacher_id = $1
    `;
    const params = [req.teacher.id];

    if (status) {
      query += ' AND s.status = $2';
      params.push(status);
    }

    query += ' ORDER BY s.created_at DESC';

    const result = await db.query(query, params);

    res.json({ sessions: result.rows });
  } catch (error) {
    console.error('List sessions error:', error);
    res.status(500).json({ error: 'Failed to list sessions' });
  }
});

/**
 * GET /api/sessions/:id
 * Get session details with participants summary
 */
router.get('/:id', authenticateTeacher, async (req, res) => {
  try {
    const { id } = req.params;

    const sessionResult = await db.query(
      `SELECT * FROM assignment_sessions WHERE id = $1 AND teacher_id = $2`,
      [id, req.teacher.id]
    );

    if (sessionResult.rows.length === 0) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const session = sessionResult.rows[0];

    // Get participants summary
    const participantsResult = await db.query(
      `SELECT status, COUNT(*) as count
       FROM student_participants
       WHERE session_id = $1
       GROUP BY status`,
      [id]
    );

    const statusCounts = participantsResult.rows.reduce((acc, row) => {
      acc[row.status] = parseInt(row.count);
      return acc;
    }, {});

    // Generate join URL
    const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3010';
    const joinUrl = `${baseUrl}/join/${session.access_code}`;

    res.json({
      session,
      joinUrl,
      participantsSummary: statusCounts,
    });
  } catch (error) {
    console.error('Get session error:', error);
    res.status(500).json({ error: 'Failed to get session' });
  }
});

/**
 * GET /api/sessions/:id/qr
 * Get QR code and access URL for a session
 */
router.get('/:id/qr', authenticateTeacher, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await db.query(
      `SELECT qr_code_url, access_code FROM assignment_sessions
       WHERE id = $1 AND teacher_id = $2`,
      [id, req.teacher.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const session = result.rows[0];

    if (!session.qr_code_url) {
      return res.status(404).json({ error: 'QR code not available for this session' });
    }

    const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3010';
    const accessUrl = `${baseUrl}/join/${session.access_code}`;

    res.json({
      qr_code: session.qr_code_url,
      access_url: accessUrl,
    });
  } catch (error) {
    console.error('Get QR code error:', error);
    res.status(500).json({ error: 'Failed to get QR code' });
  }
});

/**
 * PUT /api/sessions/:id
 * Update session settings
 */
router.put('/:id', authenticateTeacher, async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, topicCount, topicDuration, interviewMode, startsAt, endsAt, reconnectTimeout } = req.body;

    // Check session exists and belongs to teacher
    const existing = await db.query(
      'SELECT * FROM assignment_sessions WHERE id = $1 AND teacher_id = $2',
      [id, req.teacher.id]
    );

    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Session not found' });
    }

    // Don't allow updating closed sessions
    if (existing.rows[0].status === 'closed') {
      return res.status(400).json({ error: 'Cannot update closed session' });
    }

    const result = await db.query(
      `UPDATE assignment_sessions
       SET title = COALESCE($1, title),
           description = COALESCE($2, description),
           topic_count = COALESCE($3, topic_count),
           topic_duration = COALESCE($4, topic_duration),
           interview_mode = COALESCE($5, interview_mode),
           starts_at = COALESCE($6, starts_at),
           ends_at = COALESCE($7, ends_at),
           reconnect_timeout = COALESCE($8, reconnect_timeout)
       WHERE id = $9 AND teacher_id = $10
       RETURNING *`,
      [title, description, topicCount, topicDuration, interviewMode, startsAt, endsAt, reconnectTimeout, id, req.teacher.id]
    );

    res.json({ message: 'Session updated', session: result.rows[0] });
  } catch (error) {
    console.error('Update session error:', error);
    res.status(500).json({ error: 'Failed to update session' });
  }
});

/**
 * DELETE /api/sessions/:id
 * Delete a session (only draft sessions)
 */
router.delete('/:id', authenticateTeacher, async (req, res) => {
  try {
    const { id } = req.params;

    const existing = await db.query(
      'SELECT status FROM assignment_sessions WHERE id = $1 AND teacher_id = $2',
      [id, req.teacher.id]
    );

    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Session not found' });
    }

    if (existing.rows[0].status !== 'draft') {
      return res.status(400).json({ error: 'Can only delete draft sessions' });
    }

    await db.query('DELETE FROM assignment_sessions WHERE id = $1', [id]);

    res.json({ message: 'Session deleted' });
  } catch (error) {
    console.error('Delete session error:', error);
    res.status(500).json({ error: 'Failed to delete session' });
  }
});

/**
 * POST /api/sessions/:id/activate
 * Activate a session (make it available for students to join)
 */
router.post('/:id/activate', authenticateTeacher, async (req, res) => {
  try {
    const { id } = req.params;

    const existing = await db.query(
      'SELECT status FROM assignment_sessions WHERE id = $1 AND teacher_id = $2',
      [id, req.teacher.id]
    );

    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Session not found' });
    }

    if (existing.rows[0].status === 'closed') {
      return res.status(400).json({ error: 'Cannot activate closed session' });
    }

    const result = await db.query(
      `UPDATE assignment_sessions
       SET status = 'active'
       WHERE id = $1 AND teacher_id = $2
       RETURNING *`,
      [id, req.teacher.id]
    );

    res.json({ message: 'Session activated', session: result.rows[0] });
  } catch (error) {
    console.error('Activate session error:', error);
    res.status(500).json({ error: 'Failed to activate session' });
  }
});

/**
 * POST /api/sessions/:id/close
 * Close a session (prevent new participants)
 */
router.post('/:id/close', authenticateTeacher, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await db.query(
      `UPDATE assignment_sessions
       SET status = 'closed'
       WHERE id = $1 AND teacher_id = $2
       RETURNING *`,
      [id, req.teacher.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Session not found' });
    }

    res.json({ message: 'Session closed', session: result.rows[0] });
  } catch (error) {
    console.error('Close session error:', error);
    res.status(500).json({ error: 'Failed to close session' });
  }
});

/**
 * GET /api/sessions/:id/participants
 * List all participants in a session
 */
router.get('/:id/participants', authenticateTeacher, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.query;

    // Verify session belongs to teacher
    const sessionCheck = await db.query(
      'SELECT id FROM assignment_sessions WHERE id = $1 AND teacher_id = $2',
      [id, req.teacher.id]
    );

    if (sessionCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Session not found' });
    }

    let query = `
      SELECT
        p.id, p.student_name, p.student_id, p.status,
        p.submitted_file_name, p.chosen_interview_mode,
        p.file_submitted_at, p.interview_started_at, p.interview_ended_at,
        p.last_active_at, p.disconnected_at,
        CASE WHEN p.summary IS NOT NULL THEN true ELSE false END as has_summary
      FROM student_participants p
      WHERE p.session_id = $1
    `;
    const params = [id];

    if (status) {
      query += ' AND p.status = $2';
      params.push(status);
    }

    query += ' ORDER BY p.registered_at DESC';

    const result = await db.query(query, params);

    res.json({ participants: result.rows });
  } catch (error) {
    console.error('List participants error:', error);
    res.status(500).json({ error: 'Failed to list participants' });
  }
});

/**
 * GET /api/sessions/:id/participants/:pid
 * Get detailed participant info including file, transcript, and summary
 */
router.get('/:id/participants/:pid', authenticateTeacher, async (req, res) => {
  try {
    const { id, pid } = req.params;

    // Verify session belongs to teacher
    const sessionCheck = await db.query(
      'SELECT id FROM assignment_sessions WHERE id = $1 AND teacher_id = $2',
      [id, req.teacher.id]
    );

    if (sessionCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Session not found' });
    }

    // Get participant details
    const participantResult = await db.query(
      `SELECT * FROM student_participants WHERE id = $1 AND session_id = $2`,
      [pid, id]
    );

    if (participantResult.rows.length === 0) {
      return res.status(404).json({ error: 'Participant not found' });
    }

    const participant = participantResult.rows[0];

    // Get interview state if exists
    const stateResult = await db.query(
      'SELECT * FROM interview_states WHERE participant_id = $1',
      [pid]
    );

    // Get conversation history
    const conversationResult = await db.query(
      `SELECT topic_index, turn_index, role, content, audio_url, created_at
       FROM interview_conversations
       WHERE participant_id = $1
       ORDER BY topic_index, turn_index`,
      [pid]
    );

    // Group conversations by topic
    const conversationsByTopic = conversationResult.rows.reduce((acc, turn) => {
      if (!acc[turn.topic_index]) {
        acc[turn.topic_index] = [];
      }
      acc[turn.topic_index].push(turn);
      return acc;
    }, {});

    res.json({
      participant,
      interviewState: stateResult.rows[0] || null,
      conversations: conversationsByTopic,
      totalTurns: conversationResult.rows.length,
    });
  } catch (error) {
    console.error('Get participant error:', error);
    res.status(500).json({ error: 'Failed to get participant details' });
  }
});

/**
 * GET /api/sessions/:id/participants/:pid/transcript
 * Get full interview transcript as text
 */
router.get('/:id/participants/:pid/transcript', authenticateTeacher, async (req, res) => {
  try {
    const { id, pid } = req.params;

    // Verify access
    const check = await db.query(
      `SELECT p.student_name, p.analyzed_topics, s.title as session_title
       FROM student_participants p
       JOIN assignment_sessions s ON p.session_id = s.id
       WHERE p.id = $1 AND s.id = $2 AND s.teacher_id = $3`,
      [pid, id, req.teacher.id]
    );

    if (check.rows.length === 0) {
      return res.status(404).json({ error: 'Not found' });
    }

    const { student_name, analyzed_topics, session_title } = check.rows[0];

    // Get conversations
    const conversations = await db.query(
      `SELECT topic_index, role, content, created_at
       FROM interview_conversations
       WHERE participant_id = $1
       ORDER BY topic_index, turn_index`,
      [pid]
    );

    // Build transcript text
    const topics = analyzed_topics || [];
    let transcript = `# 인터뷰 기록\n\n`;
    transcript += `세션: ${session_title}\n`;
    transcript += `학생: ${student_name}\n\n`;

    let currentTopicIndex = -1;

    for (const turn of conversations.rows) {
      if (turn.topic_index !== currentTopicIndex) {
        currentTopicIndex = turn.topic_index;
        const topicTitle = topics[currentTopicIndex]?.title || `주제 ${currentTopicIndex + 1}`;
        transcript += `\n## ${topicTitle}\n\n`;
      }

      const role = turn.role === 'ai' ? 'AI' : '학생';
      transcript += `**${role}**: ${turn.content}\n\n`;
    }

    res.json({ transcript, studentName: student_name, sessionTitle: session_title });
  } catch (error) {
    console.error('Get transcript error:', error);
    res.status(500).json({ error: 'Failed to get transcript' });
  }
});

export default router;
