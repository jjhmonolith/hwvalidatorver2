'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { Users, Clock, Settings, ArrowRight, AlertCircle } from 'lucide-react';
import { joinApi, ApiError } from '@/lib/api';
import { useStudentStore } from '@/lib/store';
import { cn, getInterviewModeLabel, formatTime } from '@/lib/utils';

interface SessionInfo {
  title: string;
  description?: string;
  interview_mode: string;
  topic_count: number;
  topic_duration: number;
}

export default function JoinSessionPage() {
  const router = useRouter();
  const params = useParams();
  const { setSession, sessionToken, clearSession, setInterviewState, _hasHydrated } = useStudentStore();

  const accessCode = params.code as string;

  const [sessionInfo, setSessionInfo] = useState<SessionInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isJoining, setIsJoining] = useState(false);
  const [error, setError] = useState('');

  const [formData, setFormData] = useState({
    student_name: '',
    student_id: '',
  });

  // Ref to prevent reconnect after successful join
  const hasJoinedRef = useRef(false);

  useEffect(() => {
    // Wait for hydration to complete before checking sessionToken
    if (!_hasHydrated) return;

    // Don't reconnect if we just successfully joined
    if (hasJoinedRef.current) return;

    // If already has a session token, try to reconnect
    if (sessionToken) {
      handleReconnect();
      return;
    }

    loadSessionInfo();
  }, [accessCode, sessionToken, _hasHydrated]);

  const loadSessionInfo = async () => {
    try {
      setIsLoading(true);
      setError('');
      const res = await joinApi.getSessionInfo(accessCode);
      setSessionInfo(res.session);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('세션 정보를 불러올 수 없습니다');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleReconnect = async () => {
    if (!sessionToken) return;

    try {
      setIsLoading(true);
      const res = await joinApi.reconnect(sessionToken);

      // Save interview_state to store for immediate use
      if (res.interview_state) {
        setInterviewState(res.interview_state);
      }

      if (res.time_deducted && res.time_deducted > 0) {
        alert(`재접속 완료. 이탈 시간: ${formatTime(res.time_deducted)}`);
      }

      // Navigate to appropriate page based on status (use direct status field)
      const participantStatus = res.status;
      if (
        participantStatus === 'interview_in_progress' ||
        participantStatus === 'interview_paused'
      ) {
        // Handle show_transition_page for topic_expired_while_away
        if (res.show_transition_page) {
          const params = new URLSearchParams({
            showTransition: 'true',
            expiredWhileAway: 'true',
          });
          if (res.expired_topic_titles?.[0]) {
            params.set('expiredTitle', res.expired_topic_titles[0]);
          }
          router.push(`/interview?${params.toString()}`);
        } else {
          router.push('/interview');
        }
      } else if (participantStatus === 'file_submitted') {
        router.push('/interview/start');
      } else if (participantStatus === 'registered') {
        router.push('/interview/upload');
      } else {
        // completed, abandoned, timeout
        router.push('/interview/complete');
      }
    } catch (err) {
      // Token invalid, clear and show join form
      clearSession();
      loadSessionInfo();
    }
  };

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.student_name.trim()) return;

    try {
      setIsJoining(true);
      setError('');

      const res = await joinApi.join(accessCode, {
        student_name: formData.student_name.trim(),
        student_id: formData.student_id.trim() || undefined,
      });

      // Prevent reconnect from being triggered by sessionToken change
      hasJoinedRef.current = true;

      setSession(res.session_token, {
        ...res.participant,
        status: 'registered',
      });
      router.push('/interview/upload');
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('참여에 실패했습니다. 다시 시도해주세요.');
      }
    } finally {
      setIsJoining(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-gray-500 mt-2">로딩 중...</p>
        </div>
      </div>
    );
  }

  if (error && !sessionInfo) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="max-w-md w-full text-center">
          <AlertCircle className="w-16 h-16 text-red-400 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            세션을 찾을 수 없습니다
          </h1>
          <p className="text-gray-500 mb-6">{error}</p>
          <Link
            href="/"
            className="text-primary-600 hover:text-primary-700 font-medium"
          >
            홈으로 돌아가기
          </Link>
        </div>
      </div>
    );
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-4">
      <div className="max-w-lg w-full">
        <div className="bg-white rounded-xl shadow-lg p-8">
          {/* Session Info */}
          <div className="text-center mb-8">
            <h1 className="text-2xl font-bold text-gray-900 mb-2">
              {sessionInfo?.title}
            </h1>
            {sessionInfo?.description && (
              <p className="text-gray-500">{sessionInfo.description}</p>
            )}
          </div>

          {/* Session Details */}
          <div className="bg-gray-50 rounded-lg p-4 mb-6">
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <Settings className="w-5 h-5 text-gray-400 mx-auto mb-1" />
                <p className="text-sm text-gray-500">주제 수</p>
                <p className="font-semibold">{sessionInfo?.topic_count}개</p>
              </div>
              <div>
                <Clock className="w-5 h-5 text-gray-400 mx-auto mb-1" />
                <p className="text-sm text-gray-500">주제당 시간</p>
                <p className="font-semibold">
                  {sessionInfo && formatTime(sessionInfo.topic_duration)}
                </p>
              </div>
              <div>
                <Users className="w-5 h-5 text-gray-400 mx-auto mb-1" />
                <p className="text-sm text-gray-500">인터뷰 모드</p>
                <p className="font-semibold">
                  {sessionInfo && getInterviewModeLabel(sessionInfo.interview_mode)}
                </p>
              </div>
            </div>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
              {error}
            </div>
          )}

          {/* Join Form */}
          <form onSubmit={handleJoin} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                이름 *
              </label>
              <input
                type="text"
                required
                value={formData.student_name}
                onChange={(e) =>
                  setFormData({ ...formData, student_name: e.target.value })
                }
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                placeholder="홍길동"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                학번 (선택)
              </label>
              <input
                type="text"
                value={formData.student_id}
                onChange={(e) =>
                  setFormData({ ...formData, student_id: e.target.value })
                }
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                placeholder="2024001"
              />
            </div>

            <button
              type="submit"
              disabled={isJoining || !formData.student_name.trim()}
              className={cn(
                'w-full py-3 rounded-lg font-medium text-white transition-colors flex items-center justify-center gap-2',
                isJoining || !formData.student_name.trim()
                  ? 'bg-gray-400 cursor-not-allowed'
                  : 'bg-primary-600 hover:bg-primary-700'
              )}
            >
              {isJoining ? (
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  참여하기
                  <ArrowRight className="w-5 h-5" />
                </>
              )}
            </button>
          </form>

          <div className="mt-6 p-4 bg-yellow-50 rounded-lg">
            <h3 className="font-medium text-yellow-800 mb-2">주의사항</h3>
            <ul className="text-sm text-yellow-700 space-y-1">
              <li>• 한 번 시작한 인터뷰는 중단할 수 없습니다</li>
              <li>• 브라우저를 닫거나 새로고침해도 시간은 계속 흐릅니다</li>
              <li>• 30분 이상 이탈 시 인터뷰가 종료됩니다</li>
            </ul>
          </div>
        </div>
      </div>
    </main>
  );
}
