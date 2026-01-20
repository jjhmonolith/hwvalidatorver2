import express from 'express';
import multer from 'multer';
import { textToSpeech, speechToText, isTTSAvailable, isSTTAvailable } from '../services/speech.js';
import { authenticateStudent } from '../middleware/studentAuth.js';
import db from '../db/connection.js';

const router = express.Router();

// Multer 설정 - 메모리 스토리지 (오디오 파일은 바로 처리)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
  },
  fileFilter: (req, file, cb) => {
    const allowedMimes = ['audio/webm', 'audio/wav', 'audio/mp3', 'audio/mpeg', 'audio/ogg', 'audio/m4a'];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid audio file type'));
    }
  }
});

/**
 * GET /api/speech/status
 * TTS/STT 서비스 상태 확인
 */
router.get('/status', (req, res) => {
  res.json({
    tts: {
      available: isTTSAvailable(),
      provider: 'ElevenLabs'
    },
    stt: {
      available: isSTTAvailable(),
      provider: 'OpenAI Whisper'
    }
  });
});

/**
 * POST /api/speech/tts
 * 텍스트를 음성으로 변환 (학생 인증 필요)
 */
router.post('/tts', authenticateStudent, async (req, res) => {
  try {
    if (!isTTSAvailable()) {
      return res.status(503).json({ error: 'TTS service not available' });
    }

    const { text } = req.body;

    if (!text || text.trim().length === 0) {
      return res.status(400).json({ error: 'Text is required' });
    }

    if (text.length > 5000) {
      return res.status(400).json({ error: 'Text too long (max 5000 characters)' });
    }

    // 학생의 인터뷰 모드가 voice인지 확인
    const participant = await db.query(`
      SELECT sp.chosen_interview_mode, ass.interview_mode
      FROM student_participants sp
      JOIN assignment_sessions ass ON ass.id = sp.session_id
      WHERE sp.id = $1
    `, [req.participant.id]);

    if (participant.rows.length === 0) {
      return res.status(404).json({ error: 'Participant not found' });
    }

    const { chosen_interview_mode, interview_mode } = participant.rows[0];
    const effectiveMode = chosen_interview_mode || interview_mode;

    if (effectiveMode !== 'voice' && interview_mode !== 'student_choice') {
      return res.status(403).json({ error: 'TTS not available for this interview mode' });
    }

    const audioBuffer = await textToSpeech(text);

    res.set({
      'Content-Type': 'audio/mpeg',
      'Content-Length': audioBuffer.length,
      'Cache-Control': 'no-cache'
    });

    res.send(audioBuffer);
  } catch (error) {
    console.error('TTS error:', error);
    res.status(500).json({ error: 'TTS conversion failed' });
  }
});

/**
 * POST /api/speech/stt
 * 음성을 텍스트로 변환 (학생 인증 필요)
 */
router.post('/stt', authenticateStudent, upload.single('audio'), async (req, res) => {
  try {
    if (!isSTTAvailable()) {
      return res.status(503).json({ error: 'STT service not available' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'Audio file is required' });
    }

    // 학생의 인터뷰 모드가 voice인지 확인
    const participant = await db.query(`
      SELECT
        sp.chosen_interview_mode,
        sp.extracted_text,
        ass.interview_mode,
        ist.current_topic_index,
        ist.topics_state
      FROM student_participants sp
      JOIN assignment_sessions ass ON ass.id = sp.session_id
      LEFT JOIN interview_states ist ON ist.participant_id = sp.id
      WHERE sp.id = $1
    `, [req.participant.id]);

    if (participant.rows.length === 0) {
      return res.status(404).json({ error: 'Participant not found' });
    }

    const { chosen_interview_mode, interview_mode, extracted_text, current_topic_index, topics_state } = participant.rows[0];
    const effectiveMode = chosen_interview_mode || interview_mode;

    if (effectiveMode !== 'voice' && interview_mode !== 'student_choice') {
      return res.status(403).json({ error: 'STT not available for this interview mode' });
    }

    // 컨텍스트 구성 - 현재 주제와 과제 내용 일부
    let context = '';
    if (topics_state && topics_state[current_topic_index]) {
      context += `주제: ${topics_state[current_topic_index].title}. `;
    }
    if (extracted_text) {
      context += extracted_text.slice(0, 300);
    }

    const transcription = await speechToText(
      req.file.buffer,
      req.file.mimetype,
      context
    );

    res.json({
      text: transcription,
      confidence: 1.0 // Whisper doesn't provide confidence scores
    });
  } catch (error) {
    console.error('STT error:', error);
    res.status(500).json({ error: 'STT conversion failed' });
  }
});

/**
 * POST /api/speech/tts-stream
 * 스트리밍 TTS (긴 텍스트용) - 현재는 일반 TTS와 동일
 */
router.post('/tts-stream', authenticateStudent, async (req, res) => {
  try {
    if (!isTTSAvailable()) {
      return res.status(503).json({ error: 'TTS service not available' });
    }

    const { text } = req.body;

    if (!text || text.trim().length === 0) {
      return res.status(400).json({ error: 'Text is required' });
    }

    const audioBuffer = await textToSpeech(text);

    res.set({
      'Content-Type': 'audio/mpeg',
      'Content-Length': audioBuffer.length,
      'Transfer-Encoding': 'chunked',
      'Cache-Control': 'no-cache'
    });

    res.send(audioBuffer);
  } catch (error) {
    console.error('TTS stream error:', error);
    res.status(500).json({ error: 'TTS conversion failed' });
  }
});

export default router;
