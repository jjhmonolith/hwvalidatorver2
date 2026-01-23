'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { CheckCircle, XCircle, Clock, AlertTriangle, Home } from 'lucide-react';
import { interviewApi, ApiError } from '@/lib/api';
import { useStudentStore } from '@/lib/store';
import { cn, getStatusLabel } from '@/lib/utils';

interface Summary {
  overall_assessment?: string;
  score?: number;
  key_findings?: string[];
  topic_summaries?: Array<{
    topic: string;
    assessment: string;
  }>;
}

export default function InterviewCompletePage() {
  const router = useRouter();
  const { sessionToken, participant, clearSession, setParticipant, _hasHydrated } = useStudentStore();

  const [status, setStatus] = useState<string>('');
  const [summary, setSummary] = useState<Summary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    // Wait for hydration
    if (!_hasHydrated) return;

    if (!sessionToken) {
      router.push('/');
      return;
    }

    loadCompletionStatus();
  }, [sessionToken, router, _hasHydrated]);

  const loadCompletionStatus = async () => {
    if (!sessionToken) return;

    try {
      setIsLoading(true);

      // Try to complete the interview (generates summary if not already done)
      try {
        const completeRes = await interviewApi.complete(sessionToken);
        setSummary(completeRes.summary as Summary);
      } catch {
        // Already completed, just get state
      }

      // Get current state
      const stateRes = await interviewApi.getState(sessionToken);
      setStatus(stateRes.participant.status);

      // Restore participant info if missing (after page refresh)
      if (stateRes.participant && !participant) {
        setParticipant({
          id: stateRes.participant.id,
          student_name: stateRes.participant.student_name,
          status: stateRes.participant.status,
        });
      }

      if (stateRes.participant.summary) {
        setSummary(stateRes.participant.summary as Summary);
      }
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 401) {
          clearSession();
          router.push('/');
          return;
        }
        setError(err.message);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleExit = () => {
    clearSession();
    router.push('/');
  };

  const getStatusIcon = () => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="w-16 h-16 text-green-500" />;
      case 'timeout':
        return <Clock className="w-16 h-16 text-orange-500" />;
      case 'abandoned':
        return <XCircle className="w-16 h-16 text-red-500" />;
      default:
        return <AlertTriangle className="w-16 h-16 text-yellow-500" />;
    }
  };

  const getStatusMessage = () => {
    switch (status) {
      case 'completed':
        return '인터뷰를 완료했습니다!';
      case 'timeout':
        return '시간이 초과되어 인터뷰가 종료되었습니다.';
      case 'abandoned':
        return '장시간 이탈로 인터뷰가 종료되었습니다.';
      default:
        return '인터뷰가 종료되었습니다.';
    }
  };

  // Wait for hydration
  if (!_hasHydrated) return null;

  // No session token - will redirect to home in useEffect
  if (!sessionToken) return null;

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-gray-500 mt-4">결과를 불러오고 있습니다...</p>
        </div>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="max-w-2xl w-full">
        <div className="bg-white rounded-xl shadow-lg p-8">
          {/* Status */}
          <div className="text-center mb-8">
            {getStatusIcon()}
            <h1 className="text-2xl font-bold text-gray-900 mt-4 mb-2">
              {getStatusMessage()}
            </h1>
            <p className="text-gray-500">
              {participant?.student_name}님의 인터뷰 결과
            </p>
            <span
              className={cn(
                'inline-block mt-2 px-3 py-1 text-sm font-medium rounded-full',
                status === 'completed'
                  ? 'bg-green-100 text-green-800'
                  : status === 'timeout'
                  ? 'bg-orange-100 text-orange-800'
                  : 'bg-red-100 text-red-800'
              )}
            >
              {getStatusLabel(status)}
            </span>
          </div>

          {error && (
            <div className="mb-6 p-3 bg-red-50 border border-red-200 rounded-lg text-red-600">
              {error}
            </div>
          )}

          {/* Summary */}
          {summary && (
            <div className="space-y-6">
              {/* Score */}
              {summary.score !== undefined && (
                <div className="text-center p-6 bg-primary-50 rounded-xl">
                  <p className="text-sm text-primary-600 mb-1">종합 점수</p>
                  <p className="text-4xl font-bold text-primary-700">
                    {summary.score}
                    <span className="text-xl">/100</span>
                  </p>
                </div>
              )}

              {/* Overall Assessment */}
              {summary.overall_assessment && (
                <div className="p-4 bg-gray-50 rounded-lg">
                  <h3 className="font-medium text-gray-900 mb-2">종합 평가</h3>
                  <p className="text-gray-700 whitespace-pre-wrap">
                    {summary.overall_assessment}
                  </p>
                </div>
              )}

              {/* Key Findings */}
              {summary.key_findings && summary.key_findings.length > 0 && (
                <div className="p-4 bg-gray-50 rounded-lg">
                  <h3 className="font-medium text-gray-900 mb-2">주요 발견점</h3>
                  <ul className="space-y-2">
                    {summary.key_findings.map((finding, index) => (
                      <li
                        key={index}
                        className="flex items-start gap-2 text-gray-700"
                      >
                        <span className="text-primary-500 mt-1">•</span>
                        {finding}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Topic Summaries */}
              {summary.topic_summaries && summary.topic_summaries.length > 0 && (
                <div>
                  <h3 className="font-medium text-gray-900 mb-3">주제별 평가</h3>
                  <div className="space-y-3">
                    {summary.topic_summaries.map((topic, index) => (
                      <div key={index} className="p-4 bg-gray-50 rounded-lg">
                        <div className="font-medium text-gray-800 mb-1">
                          {index + 1}. {topic.topic}
                        </div>
                        <p className="text-sm text-gray-600">{topic.assessment}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* No Summary */}
          {!summary && (
            <div className="text-center py-8 text-gray-500">
              <p>평가 결과를 생성하지 못했습니다.</p>
              <p className="text-sm mt-1">교사에게 문의해주세요.</p>
            </div>
          )}

          {/* Actions */}
          <div className="mt-8 pt-6 border-t border-gray-200">
            <button
              onClick={handleExit}
              className="w-full py-3 rounded-lg font-medium text-white bg-primary-600 hover:bg-primary-700 transition-colors flex items-center justify-center gap-2"
            >
              <Home className="w-5 h-5" />
              홈으로 돌아가기
            </button>
          </div>

          <p className="text-center text-sm text-gray-400 mt-4">
            이 창을 닫으면 다시 접속할 수 없습니다.
          </p>
        </div>
      </div>
    </main>
  );
}
