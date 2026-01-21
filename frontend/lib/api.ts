import type { InterviewState, StudentParticipant } from './store';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4010';

interface FetchOptions extends RequestInit {
  token?: string;
  sessionToken?: string;
}

// Summary types
export interface InterviewSummary {
  overall_assessment?: string;
  score?: number;
  key_findings?: string[];
  topic_summaries?: Array<{
    topic: string;
    assessment: string;
  }>;
}

class ApiError extends Error {
  status: number;
  data: unknown;

  constructor(message: string, status: number, data?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}

async function fetchApi<T>(endpoint: string, options: FetchOptions = {}): Promise<T> {
  const { token, sessionToken, ...fetchOptions } = options;

  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  if (token) {
    (headers as Record<string, string>)['Authorization'] = `Bearer ${token}`;
  }

  if (sessionToken) {
    (headers as Record<string, string>)['X-Session-Token'] = sessionToken;
  }

  const response = await fetch(`${API_URL}${endpoint}`, {
    ...fetchOptions,
    headers,
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new ApiError(data.error || 'Request failed', response.status, data);
  }

  return data as T;
}

// Auth API
export const authApi = {
  register: (data: { email: string; password: string; name: string }) =>
    fetchApi<{ message: string; teacher: { id: string; email: string; name: string }; token: string }>(
      '/api/auth/register',
      { method: 'POST', body: JSON.stringify(data) }
    ),

  login: (data: { email: string; password: string }) =>
    fetchApi<{ message: string; teacher: { id: string; email: string; name: string }; token: string }>(
      '/api/auth/login',
      { method: 'POST', body: JSON.stringify(data) }
    ),

  logout: (token: string) =>
    fetchApi<{ message: string }>('/api/auth/logout', { method: 'POST', token }),

  getMe: (token: string) =>
    fetchApi<{ teacher: { id: string; email: string; name: string; created_at: string; session_count: number } }>(
      '/api/auth/me',
      { token }
    ),

  changePassword: (token: string, data: { currentPassword: string; newPassword: string }) =>
    fetchApi<{ message: string }>('/api/auth/password', { method: 'PUT', token, body: JSON.stringify(data) }),
};

// Session types
interface SessionSettings {
  topic_count: number;
  topic_duration: number;
  interview_mode: 'voice' | 'chat' | 'student_choice';
}

interface Session {
  id: string;
  title: string;
  description?: string;
  topic_count: number;
  topic_duration: number;
  interview_mode: string;
  access_code: string;
  qr_code_url?: string;
  status: 'draft' | 'active' | 'closed';
  starts_at?: string;
  ends_at?: string;
  created_at: string;
  participant_count?: number;
}

interface Participant {
  id: string;
  student_name: string;
  student_id?: string;
  status: string;
  registered_at: string;
  file_submitted_at?: string;
  interview_started_at?: string;
  interview_ended_at?: string;
  summary?: InterviewSummary;
}

// Sessions API
export const sessionsApi = {
  list: (token: string) =>
    fetchApi<{ sessions: Session[] }>('/api/sessions', { token }),

  get: (token: string, id: string) =>
    fetchApi<{ session: Session }>(`/api/sessions/${id}`, { token }),

  create: (token: string, data: {
    title: string;
    description?: string;
    topic_count?: number;
    topic_duration?: number;
    interview_mode?: 'voice' | 'chat' | 'student_choice';
  }) =>
    fetchApi<{ message: string; session: Session }>('/api/sessions', { method: 'POST', token, body: JSON.stringify(data) }),

  update: (token: string, id: string, data: Partial<{ title: string; description: string } & SessionSettings>) =>
    fetchApi<{ message: string; session: Session }>(`/api/sessions/${id}`, { method: 'PUT', token, body: JSON.stringify(data) }),

  delete: (token: string, id: string) =>
    fetchApi<{ message: string }>(`/api/sessions/${id}`, { method: 'DELETE', token }),

  activate: (token: string, id: string, data?: { starts_at?: string; ends_at?: string }) =>
    fetchApi<{ message: string; session: Session }>(`/api/sessions/${id}/activate`, { method: 'POST', token, body: JSON.stringify(data || {}) }),

  close: (token: string, id: string) =>
    fetchApi<{ message: string; session: Session }>(`/api/sessions/${id}/close`, { method: 'POST', token }),

  getQR: (token: string, id: string) =>
    fetchApi<{ qr_code: string; access_url: string }>(`/api/sessions/${id}/qr`, { token }),

  getParticipants: (token: string, id: string) =>
    fetchApi<{ participants: Participant[] }>(`/api/sessions/${id}/participants`, { token }),

  getParticipantDetail: (token: string, sessionId: string, participantId: string) =>
    fetchApi<{ participant: Participant & {
      conversations: Array<{ role: 'ai' | 'student'; content: string; topic_index: number; created_at: string }>;
      extracted_text?: string;
      analyzed_topics?: Array<{ title: string; description: string }>;
    } }>(
      `/api/sessions/${sessionId}/participants/${participantId}`,
      { token }
    ),
};

// Join API (for students)
export const joinApi = {
  getSessionInfo: (accessCode: string) =>
    fetchApi<{
      session: {
        title: string;
        description?: string;
        interview_mode: string;
        topic_count: number;
        topic_duration: number;
      };
    }>(`/api/join/${accessCode}`),

  join: (accessCode: string, data: { student_name: string; student_id?: string }) =>
    fetchApi<{
      message: string;
      participant: { id: string; student_name: string };
      session_token: string;
    }>(`/api/join/${accessCode}`, { method: 'POST', body: JSON.stringify(data) }),

  reconnect: (sessionToken: string) =>
    fetchApi<{
      message: string;
      participant: Participant;
      interview_state?: InterviewState;
      time_deducted?: number;
    }>('/api/join/reconnect', { method: 'POST', body: JSON.stringify({ sessionToken }) }),
};

// Interview API
export const interviewApi = {
  uploadFile: async (sessionToken: string, file: File) => {
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch(`${API_URL}/api/interview/upload`, {
      method: 'POST',
      headers: {
        'X-Session-Token': sessionToken,
      },
      body: formData,
    });

    const data = await response.json();
    if (!response.ok) {
      throw new ApiError(data.error || 'Upload failed', response.status, data);
    }
    return data as {
      message: string;
      topics: Array<{ title: string; description: string }>;
    };
  },

  start: (sessionToken: string, data?: { interview_mode?: 'voice' | 'chat' }) =>
    fetchApi<{
      message: string;
      interview_state: InterviewState;
      first_question: string;
    }>('/api/interview/start', { method: 'POST', sessionToken, body: JSON.stringify(data || {}) }),

  getState: (sessionToken: string) =>
    fetchApi<{
      participant: Participant;
      interview_state: InterviewState;
      current_question?: string;
    }>('/api/interview/state', { sessionToken }),

  heartbeat: (sessionToken: string) =>
    fetchApi<{
      status: string;
      current_phase: string;
      time_left?: number;
    }>('/api/interview/heartbeat', { method: 'POST', sessionToken }),

  submitAnswer: (sessionToken: string, data: { answer: string }) =>
    fetchApi<{
      next_question?: string;
      topic_complete?: boolean;
      is_last_topic?: boolean;
    }>('/api/interview/answer', { method: 'POST', sessionToken, body: JSON.stringify(data) }),

  nextTopic: (sessionToken: string) =>
    fetchApi<{
      message: string;
      topic_index: number;
      topic_title: string;
      first_question: string;
    }>('/api/interview/next-topic', { method: 'POST', sessionToken }),

  complete: (sessionToken: string) =>
    fetchApi<{
      message: string;
      summary: InterviewSummary;
    }>('/api/interview/complete', { method: 'POST', sessionToken }),
};

// Speech API
export const speechApi = {
  getStatus: () =>
    fetchApi<{
      tts: { available: boolean; provider: string };
      stt: { available: boolean; provider: string };
    }>('/api/speech/status'),

  textToSpeech: async (sessionToken: string, text: string): Promise<ArrayBuffer> => {
    const response = await fetch(`${API_URL}/api/speech/tts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Session-Token': sessionToken,
      },
      body: JSON.stringify({ text }),
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new ApiError(data.error || 'TTS failed', response.status, data);
    }

    return response.arrayBuffer();
  },

  speechToText: async (sessionToken: string, audioBlob: Blob): Promise<{ text: string }> => {
    const formData = new FormData();
    formData.append('audio', audioBlob, 'audio.webm');

    const response = await fetch(`${API_URL}/api/speech/stt`, {
      method: 'POST',
      headers: {
        'X-Session-Token': sessionToken,
      },
      body: formData,
    });

    const data = await response.json();
    if (!response.ok) {
      throw new ApiError(data.error || 'STT failed', response.status, data);
    }
    return data;
  },
};

export { ApiError };
