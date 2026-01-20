-- HW Validator v2 Database Schema
-- PostgreSQL / Supabase compatible

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Teachers table (교사 테이블)
CREATE TABLE teachers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  name VARCHAR(100) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Assignment sessions table (과제 세션 테이블)
CREATE TABLE assignment_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  teacher_id UUID REFERENCES teachers(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  description TEXT,

  -- Session settings (세션 설정)
  topic_count INT DEFAULT 3 CHECK (topic_count BETWEEN 1 AND 5),
  topic_duration INT DEFAULT 180 CHECK (topic_duration BETWEEN 60 AND 600),
  interview_mode VARCHAR(20) DEFAULT 'student_choice' CHECK (interview_mode IN ('voice', 'chat', 'student_choice')),

  -- Session access (세션 링크)
  access_code VARCHAR(8) UNIQUE NOT NULL,
  qr_code_url TEXT,

  -- Session state (상태)
  status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'closed')),
  starts_at TIMESTAMP WITH TIME ZONE,
  ends_at TIMESTAMP WITH TIME ZONE,
  reconnect_timeout INT DEFAULT 1800, -- 재접속 허용 시간 (초, 기본 30분)

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Student participants table (학생 참여 테이블)
CREATE TABLE student_participants (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID REFERENCES assignment_sessions(id) ON DELETE CASCADE,

  -- Student identification (학생 식별 - 비로그인)
  student_name VARCHAR(100) NOT NULL,
  student_id VARCHAR(50), -- 학번 등 (선택)
  session_token VARCHAR(64) UNIQUE NOT NULL, -- 접속 토큰

  -- Status (상태)
  status VARCHAR(30) DEFAULT 'registered' CHECK (status IN (
    'registered',           -- 등록됨
    'file_submitted',       -- 파일 제출됨
    'interview_in_progress', -- 인터뷰 진행 중
    'interview_paused',     -- 인터뷰 일시정지 (이탈)
    'completed',            -- 완료
    'abandoned',            -- 포기 (30분 타임아웃)
    'timeout'               -- 시간 초과
  )),

  -- Submitted file (제출 파일)
  submitted_file_url TEXT,
  submitted_file_name VARCHAR(255),
  extracted_text TEXT, -- PDF에서 추출한 텍스트
  analyzed_topics JSONB, -- AI가 분석한 주제들

  -- Interview choice (인터뷰 선택 - student_choice 모드 시)
  chosen_interview_mode VARCHAR(20) CHECK (chosen_interview_mode IN ('voice', 'chat')),

  -- Timing (타이밍)
  registered_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  file_submitted_at TIMESTAMP WITH TIME ZONE,
  interview_started_at TIMESTAMP WITH TIME ZONE,
  interview_ended_at TIMESTAMP WITH TIME ZONE,
  last_active_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  disconnected_at TIMESTAMP WITH TIME ZONE, -- 이탈 시점

  -- Final result (최종 결과)
  summary JSONB, -- AI 평가 요약

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Interview states table (인터뷰 상태 테이블 - 실시간 상태 추적)
CREATE TABLE interview_states (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  participant_id UUID REFERENCES student_participants(id) ON DELETE CASCADE UNIQUE,

  -- Current progress state (현재 진행 상태)
  current_topic_index INT DEFAULT 0,
  current_phase VARCHAR(30) DEFAULT 'waiting' CHECK (current_phase IN (
    'waiting',           -- 대기 중
    'topic_intro',       -- 주제 소개
    'topic_active',      -- 주제 진행 중 (시간 차감)
    'topic_paused',      -- 주제 일시정지
    'topic_transition',  -- 주제 전환 (시간 차감 안함)
    'finalizing',        -- 최종화 진행 중
    'completed'          -- 완료
  )),

  -- Topics state (주제별 상태)
  topics_state JSONB, -- [{index, title, totalTime, timeLeft, status, started}]

  -- Time tracking (시간 추적)
  topic_started_at TIMESTAMP WITH TIME ZONE, -- 현재 주제 시작 시간
  topic_paused_at TIMESTAMP WITH TIME ZONE,  -- 일시정지 시간 (이탈 시)
  accumulated_pause_time INT DEFAULT 0,       -- 누적 일시정지 시간 (초)

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Interview conversations table (인터뷰 대화 기록 테이블)
CREATE TABLE interview_conversations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  participant_id UUID REFERENCES student_participants(id) ON DELETE CASCADE,
  topic_index INT NOT NULL,
  turn_index INT NOT NULL,

  role VARCHAR(20) NOT NULL CHECK (role IN ('ai', 'student')),
  content TEXT NOT NULL,

  -- Voice mode additional info (음성 모드 시 추가 정보)
  audio_url TEXT, -- 학생 음성 녹음 URL (선택)

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes (인덱스)
CREATE INDEX idx_sessions_access_code ON assignment_sessions(access_code);
CREATE INDEX idx_sessions_teacher ON assignment_sessions(teacher_id);
CREATE INDEX idx_sessions_status ON assignment_sessions(status);
CREATE INDEX idx_participants_session ON student_participants(session_id);
CREATE INDEX idx_participants_token ON student_participants(session_token);
CREATE INDEX idx_participants_status ON student_participants(status);
CREATE INDEX idx_participants_last_active ON student_participants(last_active_at);
CREATE INDEX idx_conversations_participant ON interview_conversations(participant_id);
CREATE INDEX idx_conversations_topic ON interview_conversations(participant_id, topic_index);
CREATE INDEX idx_interview_states_participant ON interview_states(participant_id);

-- Update timestamp trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply update timestamp triggers
CREATE TRIGGER update_teachers_updated_at
    BEFORE UPDATE ON teachers
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_sessions_updated_at
    BEFORE UPDATE ON assignment_sessions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_participants_updated_at
    BEFORE UPDATE ON student_participants
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_interview_states_updated_at
    BEFORE UPDATE ON interview_states
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
