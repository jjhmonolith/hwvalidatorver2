'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Plus,
  LogOut,
  Settings,
  Users,
  Clock,
  QrCode,
  Play,
  Square,
  Trash2,
  Eye,
  Copy,
  Check,
} from 'lucide-react';
import { sessionsApi, ApiError } from '@/lib/api';
import { useAuthStore } from '@/lib/store';
import {
  cn,
  formatDate,
  getStatusLabel,
  getStatusColor,
  getInterviewModeLabel,
  formatTime,
} from '@/lib/utils';

interface Session {
  id: string;
  title: string;
  description?: string;
  topic_count: number;
  topic_duration: number;
  interview_mode: string;
  access_code: string;
  status: 'draft' | 'active' | 'closed';
  created_at: string;
  participant_count?: number;
}

export default function TeacherDashboard() {
  const router = useRouter();
  const { token, teacher, isAuthenticated, logout } = useAuthStore();

  const [sessions, setSessions] = useState<Session[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  // Create session modal state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newSession, setNewSession] = useState({
    title: '',
    description: '',
    topic_count: 3,
    topic_duration: 180,
    interview_mode: 'student_choice' as 'voice' | 'chat' | 'student_choice',
  });
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    if (!isAuthenticated || !token) {
      router.push('/teacher/login');
      return;
    }

    loadSessions();
  }, [isAuthenticated, token, router]);

  const loadSessions = async () => {
    if (!token) return;

    try {
      setIsLoading(true);
      const response = await sessionsApi.list(token);
      setSessions(response.sessions);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 401) {
          logout();
          router.push('/teacher/login');
          return;
        }
        setError(err.message);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateSession = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;

    try {
      setIsCreating(true);
      await sessionsApi.create(token, {
        title: newSession.title,
        description: newSession.description || undefined,
        settings: {
          topic_count: newSession.topic_count,
          topic_duration: newSession.topic_duration,
          interview_mode: newSession.interview_mode,
        },
      });
      setShowCreateModal(false);
      setNewSession({
        title: '',
        description: '',
        topic_count: 3,
        topic_duration: 180,
        interview_mode: 'student_choice',
      });
      loadSessions();
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      }
    } finally {
      setIsCreating(false);
    }
  };

  const handleActivate = async (sessionId: string) => {
    if (!token) return;
    try {
      await sessionsApi.activate(token, sessionId);
      loadSessions();
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
    }
  };

  const handleClose = async (sessionId: string) => {
    if (!token) return;
    try {
      await sessionsApi.close(token, sessionId);
      loadSessions();
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
    }
  };

  const handleDelete = async (sessionId: string) => {
    if (!token) return;
    if (!confirm('정말로 이 세션을 삭제하시겠습니까?')) return;

    try {
      await sessionsApi.delete(token, sessionId);
      loadSessions();
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
    }
  };

  const copyAccessCode = (code: string) => {
    const url = `${window.location.origin}/join/${code}`;
    navigator.clipboard.writeText(url);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const handleLogout = () => {
    logout();
    router.push('/');
  };

  if (!isAuthenticated) return null;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">HW Validator</h1>
            <p className="text-sm text-gray-500">
              안녕하세요, {teacher?.name}님
            </p>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-900"
          >
            <LogOut className="w-5 h-5" />
            로그아웃
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-600">
            {error}
            <button onClick={() => setError('')} className="ml-2 underline">
              닫기
            </button>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-gray-900">내 세션</h2>
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 bg-primary-600 text-white px-4 py-2 rounded-lg hover:bg-primary-700 transition-colors"
          >
            <Plus className="w-5 h-5" />
            새 세션 만들기
          </button>
        </div>

        {/* Sessions List */}
        {isLoading ? (
          <div className="text-center py-12">
            <div className="w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-gray-500 mt-2">로딩 중...</p>
          </div>
        ) : sessions.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-xl border border-gray-200">
            <Settings className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500">아직 세션이 없습니다</p>
            <button
              onClick={() => setShowCreateModal(true)}
              className="mt-4 text-primary-600 hover:text-primary-700 font-medium"
            >
              첫 번째 세션 만들기
            </button>
          </div>
        ) : (
          <div className="grid gap-4">
            {sessions.map((session) => (
              <div
                key={session.id}
                className="bg-white rounded-xl border border-gray-200 p-6"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-lg font-semibold text-gray-900">
                        {session.title}
                      </h3>
                      <span
                        className={cn(
                          'px-2 py-1 text-xs font-medium rounded-full',
                          getStatusColor(session.status)
                        )}
                      >
                        {getStatusLabel(session.status)}
                      </span>
                    </div>
                    {session.description && (
                      <p className="text-gray-500 mb-3">{session.description}</p>
                    )}
                    <div className="flex flex-wrap gap-4 text-sm text-gray-600">
                      <span className="flex items-center gap-1">
                        <Settings className="w-4 h-4" />
                        {session.topic_count}개 주제
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="w-4 h-4" />
                        주제당 {formatTime(session.topic_duration)}
                      </span>
                      <span>
                        {getInterviewModeLabel(session.interview_mode)} 모드
                      </span>
                      <span className="flex items-center gap-1">
                        <Users className="w-4 h-4" />
                        {session.participant_count || 0}명 참여
                      </span>
                    </div>
                  </div>

                  {/* Access Code */}
                  {session.status === 'active' && (
                    <div className="ml-4 text-right">
                      <div className="text-sm text-gray-500 mb-1">접속 코드</div>
                      <div className="flex items-center gap-2">
                        <code className="bg-gray-100 px-3 py-1 rounded font-mono text-lg">
                          {session.access_code}
                        </code>
                        <button
                          onClick={() => copyAccessCode(session.access_code)}
                          className="p-2 text-gray-400 hover:text-gray-600"
                          title="링크 복사"
                        >
                          {copiedCode === session.access_code ? (
                            <Check className="w-5 h-5 text-green-500" />
                          ) : (
                            <Copy className="w-5 h-5" />
                          )}
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 mt-4 pt-4 border-t border-gray-100">
                  <Link
                    href={`/teacher/sessions/${session.id}`}
                    className="flex items-center gap-1 px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
                  >
                    <Eye className="w-4 h-4" />
                    상세보기
                  </Link>

                  {session.status === 'active' && (
                    <Link
                      href={`/teacher/sessions/${session.id}/qr`}
                      className="flex items-center gap-1 px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
                    >
                      <QrCode className="w-4 h-4" />
                      QR 코드
                    </Link>
                  )}

                  {session.status === 'draft' && (
                    <>
                      <button
                        onClick={() => handleActivate(session.id)}
                        className="flex items-center gap-1 px-3 py-1.5 text-sm text-green-600 hover:text-green-700 hover:bg-green-50 rounded-lg transition-colors"
                      >
                        <Play className="w-4 h-4" />
                        활성화
                      </button>
                      <button
                        onClick={() => handleDelete(session.id)}
                        className="flex items-center gap-1 px-3 py-1.5 text-sm text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                        삭제
                      </button>
                    </>
                  )}

                  {session.status === 'active' && (
                    <button
                      onClick={() => handleClose(session.id)}
                      className="flex items-center gap-1 px-3 py-1.5 text-sm text-orange-600 hover:text-orange-700 hover:bg-orange-50 rounded-lg transition-colors"
                    >
                      <Square className="w-4 h-4" />
                      종료
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Create Session Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <h2 className="text-xl font-bold text-gray-900 mb-4">
                새 세션 만들기
              </h2>

              <form onSubmit={handleCreateSession} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    세션 제목 *
                  </label>
                  <input
                    type="text"
                    required
                    value={newSession.title}
                    onChange={(e) =>
                      setNewSession({ ...newSession, title: e.target.value })
                    }
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    placeholder="예: 1주차 과제 검증"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    설명 (선택)
                  </label>
                  <textarea
                    value={newSession.description}
                    onChange={(e) =>
                      setNewSession({ ...newSession, description: e.target.value })
                    }
                    rows={3}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    placeholder="세션에 대한 설명을 입력하세요"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      주제 수
                    </label>
                    <select
                      value={newSession.topic_count}
                      onChange={(e) =>
                        setNewSession({
                          ...newSession,
                          topic_count: parseInt(e.target.value),
                        })
                      }
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    >
                      {[1, 2, 3, 4, 5].map((n) => (
                        <option key={n} value={n}>
                          {n}개
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      주제당 시간
                    </label>
                    <select
                      value={newSession.topic_duration}
                      onChange={(e) =>
                        setNewSession({
                          ...newSession,
                          topic_duration: parseInt(e.target.value),
                        })
                      }
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    >
                      <option value={60}>1분</option>
                      <option value={120}>2분</option>
                      <option value={180}>3분</option>
                      <option value={300}>5분</option>
                      <option value={600}>10분</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    인터뷰 모드
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {(['student_choice', 'voice', 'chat'] as const).map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() =>
                          setNewSession({ ...newSession, interview_mode: mode })
                        }
                        className={cn(
                          'px-4 py-2 rounded-lg border text-sm font-medium transition-colors',
                          newSession.interview_mode === mode
                            ? 'bg-primary-100 border-primary-500 text-primary-700'
                            : 'border-gray-300 text-gray-600 hover:bg-gray-50'
                        )}
                      >
                        {getInterviewModeLabel(mode)}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex items-center justify-end gap-3 pt-4">
                  <button
                    type="button"
                    onClick={() => setShowCreateModal(false)}
                    className="px-4 py-2 text-gray-600 hover:text-gray-900"
                  >
                    취소
                  </button>
                  <button
                    type="submit"
                    disabled={isCreating}
                    className={cn(
                      'px-4 py-2 rounded-lg font-medium text-white transition-colors',
                      isCreating
                        ? 'bg-gray-400 cursor-not-allowed'
                        : 'bg-primary-600 hover:bg-primary-700'
                    )}
                  >
                    {isCreating ? '생성 중...' : '세션 생성'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
