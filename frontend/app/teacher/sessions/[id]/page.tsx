'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Users,
  Clock,
  Settings,
  QrCode,
  Play,
  Square,
  FileText,
  MessageSquare,
  ChevronDown,
  ChevronUp,
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
  summary?: {
    overall_assessment?: string;
    score?: number;
    key_findings?: string[];
  };
}

interface ConversationTurn {
  role: 'ai' | 'student';
  content: string;
  topic_index: number;
  created_at: string;
}

interface ParticipantDetail extends Participant {
  conversations: ConversationTurn[];
  extracted_text?: string;
  analyzed_topics?: Array<{ title: string; description: string }>;
}

export default function SessionDetailPage() {
  const router = useRouter();
  const params = useParams();
  const { token, isAuthenticated, logout } = useAuthStore();

  const [session, setSession] = useState<Session | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [selectedParticipant, setSelectedParticipant] = useState<ParticipantDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [expandedTopics, setExpandedTopics] = useState<number[]>([]);

  const sessionId = params.id as string;

  useEffect(() => {
    if (!isAuthenticated || !token) {
      router.push('/teacher/login');
      return;
    }

    loadSessionData();
  }, [isAuthenticated, token, sessionId, router]);

  const loadSessionData = async () => {
    if (!token) return;

    try {
      setIsLoading(true);
      const [sessionRes, participantsRes] = await Promise.all([
        sessionsApi.get(token, sessionId),
        sessionsApi.getParticipants(token, sessionId),
      ]);
      setSession(sessionRes.session);
      setParticipants(participantsRes.participants);
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

  const loadParticipantDetail = async (participantId: string) => {
    if (!token) return;

    try {
      const res = await sessionsApi.getParticipantDetail(token, sessionId, participantId);
      setSelectedParticipant(res.participant);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      }
    }
  };

  const handleActivate = async () => {
    if (!token || !session) return;
    try {
      await sessionsApi.activate(token, session.id);
      loadSessionData();
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
    }
  };

  const handleClose = async () => {
    if (!token || !session) return;
    try {
      await sessionsApi.close(token, session.id);
      loadSessionData();
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
    }
  };

  const toggleTopic = (index: number) => {
    setExpandedTopics((prev) =>
      prev.includes(index) ? prev.filter((i) => i !== index) : [...prev, index]
    );
  };

  const groupConversationsByTopic = (conversations: ConversationTurn[]) => {
    const grouped: Record<number, ConversationTurn[]> = {};
    conversations.forEach((conv) => {
      if (!grouped[conv.topic_index]) {
        grouped[conv.topic_index] = [];
      }
      grouped[conv.topic_index].push(conv);
    });
    return grouped;
  };

  if (!isAuthenticated) return null;

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!session) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-500">세션을 찾을 수 없습니다</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <Link
            href="/teacher/dashboard"
            className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-4"
          >
            <ArrowLeft className="w-5 h-5" />
            대시보드로 돌아가기
          </Link>
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold text-gray-900">
                  {session.title}
                </h1>
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
                <p className="text-gray-500 mt-1">{session.description}</p>
              )}
            </div>

            <div className="flex items-center gap-2">
              {session.status === 'active' && (
                <Link
                  href={`/teacher/sessions/${session.id}/qr`}
                  className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
                >
                  <QrCode className="w-5 h-5" />
                  QR 코드
                </Link>
              )}
              {session.status === 'draft' && (
                <button
                  onClick={handleActivate}
                  className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                >
                  <Play className="w-5 h-5" />
                  활성화
                </button>
              )}
              {session.status === 'active' && (
                <button
                  onClick={handleClose}
                  className="flex items-center gap-2 px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors"
                >
                  <Square className="w-5 h-5" />
                  종료
                </button>
              )}
            </div>
          </div>

          {/* Session Info */}
          <div className="flex flex-wrap gap-4 mt-4 text-sm text-gray-600">
            <span className="flex items-center gap-1">
              <Settings className="w-4 h-4" />
              {session.topic_count}개 주제
            </span>
            <span className="flex items-center gap-1">
              <Clock className="w-4 h-4" />
              주제당 {formatTime(session.topic_duration)}
            </span>
            <span>{getInterviewModeLabel(session.interview_mode)} 모드</span>
            {session.status === 'active' && (
              <span className="font-mono bg-gray-100 px-2 py-0.5 rounded">
                코드: {session.access_code}
              </span>
            )}
          </div>
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

        <div className="grid lg:grid-cols-3 gap-6">
          {/* Participants List */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <Users className="w-5 h-5" />
                참여 학생 ({participants.length}명)
              </h2>

              {participants.length === 0 ? (
                <p className="text-gray-500 text-center py-8">
                  아직 참여한 학생이 없습니다
                </p>
              ) : (
                <div className="space-y-2">
                  {participants.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => loadParticipantDetail(p.id)}
                      className={cn(
                        'w-full p-3 rounded-lg text-left transition-colors',
                        selectedParticipant?.id === p.id
                          ? 'bg-primary-50 border border-primary-200'
                          : 'hover:bg-gray-50 border border-transparent'
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-gray-900">
                          {p.student_name}
                        </span>
                        <span
                          className={cn(
                            'px-2 py-0.5 text-xs rounded-full',
                            getStatusColor(p.status)
                          )}
                        >
                          {getStatusLabel(p.status)}
                        </span>
                      </div>
                      {p.student_id && (
                        <span className="text-sm text-gray-500">
                          {p.student_id}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Participant Detail */}
          <div className="lg:col-span-2">
            {selectedParticipant ? (
              <div className="bg-white rounded-xl border border-gray-200 p-6">
                <div className="flex items-start justify-between mb-6">
                  <div>
                    <h2 className="text-xl font-semibold text-gray-900">
                      {selectedParticipant.student_name}
                    </h2>
                    {selectedParticipant.student_id && (
                      <p className="text-gray-500">
                        {selectedParticipant.student_id}
                      </p>
                    )}
                  </div>
                  <span
                    className={cn(
                      'px-3 py-1 text-sm font-medium rounded-full',
                      getStatusColor(selectedParticipant.status)
                    )}
                  >
                    {getStatusLabel(selectedParticipant.status)}
                  </span>
                </div>

                {/* Summary */}
                {selectedParticipant.summary && (
                  <div className="mb-6 p-4 bg-blue-50 rounded-lg">
                    <h3 className="font-medium text-blue-900 mb-2">
                      AI 평가 요약
                    </h3>
                    {selectedParticipant.summary.score !== undefined && (
                      <p className="text-blue-800 mb-2">
                        점수: {selectedParticipant.summary.score}점
                      </p>
                    )}
                    {selectedParticipant.summary.overall_assessment && (
                      <p className="text-blue-800">
                        {selectedParticipant.summary.overall_assessment}
                      </p>
                    )}
                    {selectedParticipant.summary.key_findings && (
                      <ul className="mt-2 list-disc list-inside text-blue-700 text-sm">
                        {selectedParticipant.summary.key_findings.map((f, i) => (
                          <li key={i}>{f}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}

                {/* Analyzed Topics */}
                {selectedParticipant.analyzed_topics && (
                  <div className="mb-6">
                    <h3 className="font-medium text-gray-900 mb-2 flex items-center gap-2">
                      <FileText className="w-5 h-5" />
                      분석된 주제
                    </h3>
                    <div className="space-y-2">
                      {selectedParticipant.analyzed_topics.map((topic, i) => (
                        <div
                          key={i}
                          className="p-3 bg-gray-50 rounded-lg"
                        >
                          <div className="font-medium text-gray-800">
                            {i + 1}. {topic.title}
                          </div>
                          <p className="text-sm text-gray-600">
                            {topic.description}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Conversations */}
                {selectedParticipant.conversations.length > 0 && (
                  <div>
                    <h3 className="font-medium text-gray-900 mb-2 flex items-center gap-2">
                      <MessageSquare className="w-5 h-5" />
                      인터뷰 기록
                    </h3>
                    <div className="space-y-2">
                      {Object.entries(
                        groupConversationsByTopic(selectedParticipant.conversations)
                      ).map(([topicIndex, convs]) => (
                        <div key={topicIndex} className="border rounded-lg">
                          <button
                            onClick={() => toggleTopic(parseInt(topicIndex))}
                            className="w-full p-3 flex items-center justify-between text-left hover:bg-gray-50"
                          >
                            <span className="font-medium">
                              주제 {parseInt(topicIndex) + 1}
                            </span>
                            {expandedTopics.includes(parseInt(topicIndex)) ? (
                              <ChevronUp className="w-5 h-5" />
                            ) : (
                              <ChevronDown className="w-5 h-5" />
                            )}
                          </button>
                          {expandedTopics.includes(parseInt(topicIndex)) && (
                            <div className="p-3 pt-0 space-y-3">
                              {convs.map((conv, i) => (
                                <div
                                  key={i}
                                  className={cn(
                                    'p-3 rounded-lg',
                                    conv.role === 'ai'
                                      ? 'bg-blue-50 text-blue-900'
                                      : 'bg-gray-100 text-gray-900 ml-8'
                                  )}
                                >
                                  <div className="text-xs text-gray-500 mb-1">
                                    {conv.role === 'ai' ? 'AI' : '학생'}
                                  </div>
                                  <p className="whitespace-pre-wrap">
                                    {conv.content}
                                  </p>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
                <Users className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                <p className="text-gray-500">
                  왼쪽에서 학생을 선택하여 상세 정보를 확인하세요
                </p>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
