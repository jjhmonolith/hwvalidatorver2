import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import db from './db/connection.js';
import { startDisconnectChecker, stopDisconnectChecker } from './workers/disconnectChecker.js';

// Routes
import authRoutes from './routes/auth.js';
import sessionRoutes from './routes/sessions.js';
import joinRoutes from './routes/join.js';
import interviewRoutes from './routes/interview.js';
import speechRoutes from './routes/speech.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// CORS 설정 - 환경변수와 기본 도메인 병합
const defaultOrigins = [
  'http://localhost:3010',
  'https://hwvalidatorver2.vercel.app',
  'https://hwvalidatorver2-git-main-jjhmonoliths-projects.vercel.app'
];
const envOrigins = process.env.FRONT_ORIGIN?.split(',').map(o => o.trim()).filter(Boolean) || [];
const allowedOrigins = [...new Set([...defaultOrigins, ...envOrigins])];

const corsOptions = {
  origin: allowedOrigins,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Session-Token']
};

console.log('CORS allowed origins:', allowedOrigins);

app.use(cors(corsOptions));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Rate limiting
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15분
  max: 100, // 요청 수
  message: { error: 'Too many requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15분
  max: 10, // 로그인 시도 제한
  message: { error: 'Too many authentication attempts, please try again later' },
  standardHeaders: true,
  legacyHeaders: false
});

const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'Too many upload attempts, please try again later' }
});

// Apply rate limiters
app.use('/api/', generalLimiter);
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);
app.use('/api/interview/upload', uploadLimiter);

// Health check
app.get('/health', async (req, res) => {
  try {
    const dbHealth = await db.checkHealth();
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      database: dbHealth ? 'connected' : 'disconnected',
      version: '2.0.0'
    });
  } catch (error) {
    res.status(503).json({
      status: 'error',
      timestamp: new Date().toISOString(),
      database: 'error',
      error: error.message
    });
  }
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/sessions', sessionRoutes);
app.use('/api/join', joinRoutes);
app.use('/api/interview', interviewRoutes);
app.use('/api/speech', speechRoutes);

// 404 handler
app.use('/api/*', (req, res) => {
  res.status(404).json({ error: 'API endpoint not found' });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);

  // Multer 에러 처리
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: 'File too large' });
  }

  if (err.message === 'Invalid file type') {
    return res.status(400).json({ error: 'Invalid file type' });
  }

  res.status(500).json({
    error: process.env.NODE_ENV === 'production'
      ? 'Internal server error'
      : err.message
  });
});

// Graceful shutdown
async function gracefulShutdown(signal) {
  console.log(`\n${signal} received. Starting graceful shutdown...`);

  // 워커 중지
  stopDisconnectChecker();

  // 새 연결 거부하지 않고 기존 연결 처리 대기
  server.close(async () => {
    console.log('HTTP server closed');

    // DB 연결 종료
    await db.closePool();
    console.log('Database pool closed');

    process.exit(0);
  });

  // 10초 후 강제 종료
  setTimeout(() => {
    console.error('Forced shutdown after timeout');
    process.exit(1);
  }, 10000);
}

// Start server
const server = app.listen(PORT, async () => {
  console.log(`\n🚀 HW Validator v2 Backend running on port ${PORT}`);
  console.log(`📍 Environment: ${process.env.NODE_ENV || 'development'}`);

  // DB 연결 확인
  const dbConnected = await db.checkHealth();
  if (dbConnected) {
    console.log('✅ Database connected');
  } else {
    console.error('❌ Database connection failed');
  }

  // 이탈 감지 워커 시작
  startDisconnectChecker();
  console.log('✅ Disconnect checker worker started');

  console.log(`\n📋 Available endpoints:`);
  console.log(`   GET  /health`);
  console.log(`   POST /api/auth/register`);
  console.log(`   POST /api/auth/login`);
  console.log(`   POST /api/auth/logout`);
  console.log(`   GET  /api/auth/me`);
  console.log(`   GET  /api/sessions`);
  console.log(`   POST /api/sessions`);
  console.log(`   GET  /api/sessions/:id`);
  console.log(`   PUT  /api/sessions/:id`);
  console.log(`   DELETE /api/sessions/:id`);
  console.log(`   POST /api/sessions/:id/activate`);
  console.log(`   POST /api/sessions/:id/close`);
  console.log(`   GET  /api/sessions/:id/qr`);
  console.log(`   GET  /api/sessions/:id/participants`);
  console.log(`   GET  /api/join/:accessCode`);
  console.log(`   POST /api/join/:accessCode`);
  console.log(`   POST /api/join/reconnect`);
  console.log(`   POST /api/interview/upload`);
  console.log(`   POST /api/interview/start`);
  console.log(`   GET  /api/interview/state`);
  console.log(`   POST /api/interview/heartbeat`);
  console.log(`   POST /api/interview/answer`);
  console.log(`   POST /api/interview/next-topic`);
  console.log(`   POST /api/interview/complete`);
  console.log(`   GET  /api/speech/status`);
  console.log(`   POST /api/speech/tts`);
  console.log(`   POST /api/speech/stt`);
  console.log(`\n`);
});

// Shutdown handlers
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

export default app;
