import express from 'express';
import multer from 'multer';
import pdfParse from 'pdf-parse';
import db from '../db/connection.js';
import { authenticateStudent, checkReconnection } from '../middleware/studentAuth.js';
import { analyzeAssignment, generateQuestion, generateSummary } from '../services/llm.js';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });

/**
 * POST /api/interview/upload
 * Upload assignment file and analyze topics
 */
router.post('/upload', authenticateStudent, upload.single('file'), async (req, res) => {
  try {
    const participant = req.participant;

    // Check if already submitted
    if (participant.status !== 'registered') {
      return res.status(400).json({
        error: 'File already submitted',
        currentStatus: participant.status
      });
    }

    // Check for file or text
    let assignmentText = req.body.assignmentText;
    let fileName = 'text_input';

    if (req.file) {
      // Parse PDF
      try {
        const parsed = await pdfParse(req.file.buffer);
        assignmentText = parsed.text;
        fileName = req.file.originalname;
      } catch (parseError) {
        console.error('PDF parse error:', parseError);
        return res.status(400).json({ error: 'Failed to extract text from PDF' });
      }
    }

    if (!assignmentText || assignmentText.trim().length < 100) {
      return res.status(400).json({ error: 'Assignment text is too short or empty' });
    }

    // Analyze and extract topics
    const topicCount = participant.topic_count;
    const { topics, fallback } = await analyzeAssignment(assignmentText, topicCount);

    // Store file URL (in production, upload to S3/Supabase Storage)
    // For now, we'll just store the filename
    const fileUrl = null; // TODO: implement file storage

    // Update participant
    await db.query(
      `UPDATE student_participants
       SET status = 'file_submitted',
           submitted_file_url = $1,
           submitted_file_name = $2,
           extracted_text = $3,
           analyzed_topics = $4,
           file_submitted_at = NOW()
       WHERE id = $5`,
      [fileUrl, fileName, assignmentText, JSON.stringify(topics), participant.id]
    );

    res.json({
      message: 'File uploaded and analyzed',
      topics,
      fallback,
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Failed to process file' });
  }
});

/**
 * POST /api/interview/start
 * Start the interview (create interview state)
 */
router.post('/start', authenticateStudent, async (req, res) => {
  try {
    const participant = req.participant;
    const { chosenInterviewMode } = req.body;

    // Validate status
    if (participant.status !== 'file_submitted') {
      return res.status(400).json({
        error: 'Cannot start interview',
        currentStatus: participant.status,
        message: participant.status === 'registered'
          ? 'Please upload your assignment first'
          : 'Interview already started or completed'
      });
    }

    // Determine interview mode
    let interviewMode = participant.session_interview_mode;
    if (interviewMode === 'student_choice') {
      if (!chosenInterviewMode || !['voice', 'chat'].includes(chosenInterviewMode)) {
        return res.status(400).json({ error: 'Please choose interview mode: voice or chat' });
      }
      interviewMode = chosenInterviewMode;
    }

    // Get topics
    const topics = participant.analyzed_topics || [];
    if (topics.length === 0) {
      return res.status(400).json({ error: 'No topics found. Please re-upload your assignment.' });
    }

    // Create topics state
    const topicsState = topics.map((topic, index) => ({
      index,
      title: topic.title,
      totalTime: participant.topic_duration,
      timeLeft: participant.topic_duration,
      status: index === 0 ? 'active' : 'pending',
      started: false,
    }));

    // Generate first question
    const firstTopic = topics[0];
    const { question } = await generateQuestion({
      topic: firstTopic,
      assignmentText: participant.extracted_text,
      previousQA: [],
      studentAnswer: null,
      interviewMode,
    });

    // Create interview state
    await db.query(
      `INSERT INTO interview_states
       (participant_id, current_topic_index, current_phase, topics_state, topic_started_at)
       VALUES ($1, 0, 'topic_active', $2, NOW())`,
      [participant.id, JSON.stringify(topicsState)]
    );

    // Save first AI question
    await db.query(
      `INSERT INTO interview_conversations
       (participant_id, topic_index, turn_index, role, content)
       VALUES ($1, 0, 0, 'ai', $2)`,
      [participant.id, question]
    );

    // Update participant status
    await db.query(
      `UPDATE student_participants
       SET status = 'interview_in_progress',
           chosen_interview_mode = $1,
           interview_started_at = NOW()
       WHERE id = $2`,
      [interviewMode, participant.id]
    );

    res.json({
      message: 'Interview started',
      interview_mode: interviewMode,
      current_topic_index: 0,
      current_topic: firstTopic,
      topics_state: topicsState,
      first_question: question,
      interview_state: {
        current_topic_index: 0,
        current_phase: 'topic_active',
        topics_state: topicsState,
      },
    });
  } catch (error) {
    console.error('Start interview error:', error);
    res.status(500).json({ error: 'Failed to start interview' });
  }
});

/**
 * GET /api/interview/state
 * Get current interview state
 */
router.get('/state', authenticateStudent, checkReconnection, async (req, res) => {
  try {
    const participant = req.participant;

    // Get interview state
    const stateResult = await db.query(
      'SELECT * FROM interview_states WHERE participant_id = $1',
      [participant.id]
    );

    if (stateResult.rows.length === 0) {
      return res.json({
        status: participant.status,
        participant: {
          id: participant.id,
          student_name: participant.student_name,
          status: participant.status,
        },
        interview_state: null,
        has_started: false,
      });
    }

    const state = stateResult.rows[0];

    // Calculate remaining time
    let remainingTime = null;
    const topicsState = state.topics_state;

    if (topicsState && state.current_topic_index !== null) {
      const currentTopic = topicsState[state.current_topic_index];

      if (state.current_phase === 'topic_active' && state.topic_started_at) {
        const elapsed = (Date.now() - new Date(state.topic_started_at).getTime()) / 1000
                        - (state.accumulated_pause_time || 0);
        remainingTime = Math.max(0, currentTopic.totalTime - elapsed);
      } else if (state.current_phase === 'topic_transition') {
        remainingTime = currentTopic.totalTime; // Full time for next topic
      } else {
        remainingTime = currentTopic.timeLeft;
      }
    }

    // Get recent conversations
    const conversationsResult = await db.query(
      `SELECT topic_index, turn_index, role, content
       FROM interview_conversations
       WHERE participant_id = $1 AND topic_index = $2
       ORDER BY turn_index`,
      [participant.id, state.current_topic_index]
    );

    res.json({
      status: participant.status,
      participant: {
        id: participant.id,
        student_name: participant.student_name,
        status: participant.status,
      },
      interview_state: {
        current_topic_index: state.current_topic_index,
        current_phase: state.current_phase,
        topics_state: topicsState,
        remaining_time: Math.max(0, Math.floor(remainingTime || 0)),
      },
      conversations: conversationsResult.rows,
      reconnection_info: req.reconnectionInfo || null,
      analyzed_topics: participant.analyzed_topics,
      chosen_interview_mode: participant.chosen_interview_mode,
    });
  } catch (error) {
    console.error('Get state error:', error);
    res.status(500).json({ error: 'Failed to get interview state' });
  }
});

/**
 * POST /api/interview/heartbeat
 * Heartbeat to maintain connection and sync state
 */
router.post('/heartbeat', authenticateStudent, async (req, res) => {
  try {
    const participant = req.participant;

    // Get interview state
    const stateResult = await db.query(
      'SELECT * FROM interview_states WHERE participant_id = $1',
      [participant.id]
    );

    if (stateResult.rows.length === 0) {
      return res.json({
        status: participant.status,
        current_phase: null,
        remaining_time: null,
        time_left: null,
      });
    }

    const state = stateResult.rows[0];
    const topicsState = state.topics_state;

    // Calculate remaining time
    let remainingTime = null;
    let timeExpired = false;

    if (topicsState && state.current_topic_index !== null) {
      const currentTopic = topicsState[state.current_topic_index];

      if (state.current_phase === 'topic_active' && state.topic_started_at) {
        const elapsed = (Date.now() - new Date(state.topic_started_at).getTime()) / 1000
                        - (state.accumulated_pause_time || 0);
        remainingTime = Math.max(0, currentTopic.totalTime - elapsed);

        // Check if time expired
        if (remainingTime <= 0) {
          timeExpired = true;
        }
      } else if (state.current_phase === 'topic_transition') {
        remainingTime = currentTopic.totalTime;
      }
    }

    res.json({
      status: participant.status,
      current_topic_index: state.current_topic_index,
      current_phase: state.current_phase,
      remaining_time: Math.max(0, Math.floor(remainingTime || 0)),
      time_left: Math.max(0, Math.floor(remainingTime || 0)),
      time_expired: timeExpired,
      topics_state: topicsState,
    });
  } catch (error) {
    console.error('Heartbeat error:', error);
    res.status(500).json({ error: 'Heartbeat failed' });
  }
});

/**
 * POST /api/interview/answer
 * Submit student answer and get next question
 */
router.post('/answer', authenticateStudent, async (req, res) => {
  try {
    const participant = req.participant;
    const { answer, audioUrl } = req.body;

    if (!answer || answer.trim().length === 0) {
      return res.status(400).json({ error: 'Answer is required' });
    }

    // Get current state
    const stateResult = await db.query(
      'SELECT * FROM interview_states WHERE participant_id = $1',
      [participant.id]
    );

    if (stateResult.rows.length === 0) {
      return res.status(400).json({ error: 'Interview not started' });
    }

    const state = stateResult.rows[0];

    if (state.current_phase !== 'topic_active') {
      return res.status(400).json({
        error: 'Cannot submit answer in current phase',
        currentPhase: state.current_phase
      });
    }

    // Get current conversation count for turn index
    const turnCountResult = await db.query(
      `SELECT COUNT(*) as count FROM interview_conversations
       WHERE participant_id = $1 AND topic_index = $2`,
      [participant.id, state.current_topic_index]
    );
    const turnIndex = parseInt(turnCountResult.rows[0].count);

    // Save student answer
    await db.query(
      `INSERT INTO interview_conversations
       (participant_id, topic_index, turn_index, role, content, audio_url)
       VALUES ($1, $2, $3, 'student', $4, $5)`,
      [participant.id, state.current_topic_index, turnIndex, answer.trim(), audioUrl || null]
    );

    // Get previous Q&A for context
    const previousQA = await db.query(
      `SELECT role, content as text FROM interview_conversations
       WHERE participant_id = $1 AND topic_index = $2
       ORDER BY turn_index`,
      [participant.id, state.current_topic_index]
    );

    // Generate next question
    const topics = participant.analyzed_topics || [];
    const currentTopic = topics[state.current_topic_index];

    const { question } = await generateQuestion({
      topic: currentTopic,
      assignmentText: participant.extracted_text,
      previousQA: previousQA.rows,
      studentAnswer: answer,
      interviewMode: participant.chosen_interview_mode,
    });

    // Save AI question
    await db.query(
      `INSERT INTO interview_conversations
       (participant_id, topic_index, turn_index, role, content)
       VALUES ($1, $2, $3, 'ai', $4)`,
      [participant.id, state.current_topic_index, turnIndex + 1, question]
    );

    // Update topics state to mark as started
    const topicsState = state.topics_state;
    topicsState[state.current_topic_index].started = true;
    await db.query(
      'UPDATE interview_states SET topics_state = $1 WHERE participant_id = $2',
      [JSON.stringify(topicsState), participant.id]
    );

    res.json({
      message: 'Answer submitted',
      next_question: question,
      turn_index: turnIndex + 1,
    });
  } catch (error) {
    console.error('Answer error:', error);
    res.status(500).json({ error: 'Failed to process answer' });
  }
});

/**
 * POST /api/interview/next-topic
 * Move to the next topic
 */
router.post('/next-topic', authenticateStudent, async (req, res) => {
  try {
    const participant = req.participant;

    // Get current state
    const stateResult = await db.query(
      'SELECT * FROM interview_states WHERE participant_id = $1',
      [participant.id]
    );

    if (stateResult.rows.length === 0) {
      return res.status(400).json({ error: 'Interview not started' });
    }

    const state = stateResult.rows[0];
    const topicsState = state.topics_state;
    const currentIndex = state.current_topic_index;
    const nextIndex = currentIndex + 1;

    // Check if there's a next topic
    if (nextIndex >= topicsState.length) {
      return res.status(400).json({
        error: 'No more topics',
        shouldFinalize: true
      });
    }

    // Mark current topic as completed
    topicsState[currentIndex].status = 'completed';
    topicsState[currentIndex].timeLeft = 0;

    // Mark next topic as active
    topicsState[nextIndex].status = 'active';

    // Generate first question for next topic
    const topics = participant.analyzed_topics || [];
    const nextTopic = topics[nextIndex];

    const { question } = await generateQuestion({
      topic: nextTopic,
      assignmentText: participant.extracted_text,
      previousQA: [],
      studentAnswer: null,
      interviewMode: participant.chosen_interview_mode,
    });

    // Save AI question
    await db.query(
      `INSERT INTO interview_conversations
       (participant_id, topic_index, turn_index, role, content)
       VALUES ($1, $2, 0, 'ai', $3)`,
      [participant.id, nextIndex, question]
    );

    // Update state
    await db.query(
      `UPDATE interview_states
       SET current_topic_index = $1,
           current_phase = 'topic_active',
           topics_state = $2,
           topic_started_at = NOW(),
           topic_paused_at = NULL,
           accumulated_pause_time = 0
       WHERE participant_id = $3`,
      [nextIndex, JSON.stringify(topicsState), participant.id]
    );

    res.json({
      message: 'Moved to next topic',
      current_topic_index: nextIndex,
      topic_index: nextIndex,
      current_topic: nextTopic,
      topic_title: nextTopic.title,
      first_question: question,
      topics_state: topicsState,
    });
  } catch (error) {
    console.error('Next topic error:', error);
    res.status(500).json({ error: 'Failed to move to next topic' });
  }
});

/**
 * POST /api/interview/topic-timeout
 * Handle topic timeout (called when time expires)
 */
router.post('/topic-timeout', authenticateStudent, async (req, res) => {
  try {
    const participant = req.participant;

    // Get current state
    const stateResult = await db.query(
      'SELECT * FROM interview_states WHERE participant_id = $1',
      [participant.id]
    );

    if (stateResult.rows.length === 0) {
      return res.status(400).json({ error: 'Interview not started' });
    }

    const state = stateResult.rows[0];
    const topicsState = state.topics_state;
    const currentIndex = state.current_topic_index;
    const nextIndex = currentIndex + 1;

    // Mark current topic as completed (timed out)
    topicsState[currentIndex].status = 'completed';
    topicsState[currentIndex].timeLeft = 0;

    // Check if there are more topics
    if (nextIndex >= topicsState.length) {
      // No more topics - transition to finalizing
      await db.query(
        `UPDATE interview_states
         SET current_phase = 'finalizing',
             topics_state = $1
         WHERE participant_id = $2`,
        [JSON.stringify(topicsState), participant.id]
      );

      return res.json({
        message: 'Topic timed out - all topics completed',
        should_finalize: true,
        topics_state: topicsState,
      });
    }

    // Transition to next topic (waiting state)
    await db.query(
      `UPDATE interview_states
       SET current_topic_index = $1,
           current_phase = 'topic_transition',
           topics_state = $2,
           topic_started_at = NULL,
           topic_paused_at = NULL,
           accumulated_pause_time = 0
       WHERE participant_id = $3`,
      [nextIndex, JSON.stringify(topicsState), participant.id]
    );

    res.json({
      message: 'Topic timed out - ready for next topic',
      next_topic_index: nextIndex,
      topics_state: topicsState,
      should_finalize: false,
    });
  } catch (error) {
    console.error('Topic timeout error:', error);
    res.status(500).json({ error: 'Failed to handle topic timeout' });
  }
});

/**
 * POST /api/interview/complete
 * Complete the interview and generate summary
 */
router.post('/complete', authenticateStudent, async (req, res) => {
  try {
    const participant = req.participant;

    // Get all conversations
    const conversationsResult = await db.query(
      `SELECT topic_index, role, content
       FROM interview_conversations
       WHERE participant_id = $1
       ORDER BY topic_index, turn_index`,
      [participant.id]
    );

    // Build transcript
    const transcript = conversationsResult.rows
      .map(turn => `${turn.role === 'ai' ? 'AI' : '학생'}: ${turn.content}`)
      .join('\n');

    // Generate summary
    const topics = participant.analyzed_topics || [];
    const { summary } = await generateSummary({
      transcript,
      topics,
      assignmentText: participant.extracted_text,
      interviewMode: participant.chosen_interview_mode,
    });

    // Update interview state
    await db.query(
      `UPDATE interview_states
       SET current_phase = 'completed'
       WHERE participant_id = $1`,
      [participant.id]
    );

    // Update participant
    await db.query(
      `UPDATE student_participants
       SET status = 'completed',
           interview_ended_at = NOW(),
           summary = $1
       WHERE id = $2`,
      [JSON.stringify(summary), participant.id]
    );

    res.json({
      message: 'Interview completed',
      summary,
    });
  } catch (error) {
    console.error('Complete interview error:', error);
    res.status(500).json({ error: 'Failed to complete interview' });
  }
});

export default router;
