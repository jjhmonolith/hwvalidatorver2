'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Mic, MessageSquare, Play, AlertTriangle } from 'lucide-react';
import { interviewApi, ApiError } from '@/lib/api';
import { useStudentStore } from '@/lib/store';
import { cn } from '@/lib/utils';

export default function InterviewStartPage() {
  const router = useRouter();
  const { sessionToken, participant, setInterviewState, setCurrentQuestion, clearSession, _hasHydrated } =
    useStudentStore();

  const [selectedMode, setSelectedMode] = useState<'voice' | 'chat' | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [error, setError] = useState('');
  const [showModeSelection, setShowModeSelection] = useState(false);

  useEffect(() => {
    // Wait for hydration
    if (!_hasHydrated) return;

    if (!sessionToken || !participant) {
      router.push('/');
      return;
    }

    // Check if mode selection is needed
    checkInterviewState();
  }, [sessionToken, participant, router, _hasHydrated]);

  const checkInterviewState = async () => {
    if (!sessionToken) return;

    try {
      const res = await interviewApi.getState(sessionToken);

      // If interview already started, redirect
      if (
        res.participant.status === 'interview_in_progress' ||
        res.participant.status === 'interview_paused'
      ) {
        router.push('/interview');
        return;
      }

      // Check if mode selection is needed (student_choice mode)
      if (res.session_interview_mode === 'student_choice') {
        setShowModeSelection(true);
      } else if (res.session_interview_mode === 'voice' || res.session_interview_mode === 'chat') {
        // Teacher has set a specific mode, auto-select it
        setSelectedMode(res.session_interview_mode);
        setShowModeSelection(false);
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        clearSession();
        router.push('/');
      }
    }
  };

  const handleStart = async () => {
    if (!sessionToken) return;

    // If mode selection is shown but no mode selected, require selection
    if (showModeSelection && !selectedMode) {
      setError('인터뷰 모드를 선택해주세요');
      return;
    }

    try {
      setIsStarting(true);
      setError('');

      const res = await interviewApi.start(sessionToken, {
        chosenInterviewMode: selectedMode || undefined,
      });

      // Use interview_state from response
      const state = res.interview_state || {
        current_topic_index: res.current_topic_index,
        current_phase: 'topic_active',
        topics_state: res.topics_state,
      };
      setInterviewState(state);
      setCurrentQuestion(res.first_question);
      router.push('/interview');
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 401) {
          clearSession();
          router.push('/');
          return;
        }
        setError(err.message);
      } else {
        setError('인터뷰를 시작할 수 없습니다. 다시 시도해주세요.');
      }
    } finally {
      setIsStarting(false);
    }
  };

  if (!_hasHydrated || !sessionToken || !participant) return null;

  return (
    <main className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="max-w-lg w-full">
        <div className="bg-white rounded-xl shadow-lg p-8">
          <div className="text-center mb-8">
            <h1 className="text-2xl font-bold text-gray-900 mb-2">
              인터뷰 준비
            </h1>
            <p className="text-gray-500">
              {participant.student_name}님, 인터뷰를 시작할 준비가 되었습니다
            </p>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-600">
              {error}
            </div>
          )}

          {/* Mode Selection */}
          {showModeSelection && (
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-3">
                인터뷰 모드 선택
              </label>
              <div className="grid grid-cols-2 gap-4">
                <button
                  onClick={() => setSelectedMode('voice')}
                  className={cn(
                    'p-6 rounded-xl border-2 transition-all text-center',
                    selectedMode === 'voice'
                      ? 'border-primary-500 bg-primary-50'
                      : 'border-gray-200 hover:border-primary-300'
                  )}
                >
                  <Mic
                    className={cn(
                      'w-10 h-10 mx-auto mb-3',
                      selectedMode === 'voice' ? 'text-primary-600' : 'text-gray-400'
                    )}
                  />
                  <div className="font-medium text-gray-900">음성 모드</div>
                  <p className="text-sm text-gray-500 mt-1">
                    AI와 음성으로 대화
                  </p>
                </button>

                <button
                  onClick={() => setSelectedMode('chat')}
                  className={cn(
                    'p-6 rounded-xl border-2 transition-all text-center',
                    selectedMode === 'chat'
                      ? 'border-primary-500 bg-primary-50'
                      : 'border-gray-200 hover:border-primary-300'
                  )}
                >
                  <MessageSquare
                    className={cn(
                      'w-10 h-10 mx-auto mb-3',
                      selectedMode === 'chat' ? 'text-primary-600' : 'text-gray-400'
                    )}
                  />
                  <div className="font-medium text-gray-900">채팅 모드</div>
                  <p className="text-sm text-gray-500 mt-1">
                    텍스트로 답변 입력
                  </p>
                </button>
              </div>
            </div>
          )}

          {/* Warning */}
          <div className="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-yellow-600 mt-0.5" />
              <div>
                <h3 className="font-medium text-yellow-800">시작 전 확인사항</h3>
                <ul className="text-sm text-yellow-700 mt-2 space-y-1">
                  <li>• 인터뷰가 시작되면 중단할 수 없습니다</li>
                  <li>• 브라우저를 닫거나 새로고침해도 시간은 계속 흐릅니다</li>
                  <li>• 주제 진행 중 이탈 시 시간이 차감됩니다</li>
                  <li>• 30분 이상 이탈 시 인터뷰가 자동 종료됩니다</li>
                </ul>
              </div>
            </div>
          </div>

          {/* Start Button */}
          <button
            onClick={handleStart}
            disabled={isStarting || (showModeSelection && !selectedMode)}
            className={cn(
              'w-full py-4 rounded-lg font-medium text-white transition-colors flex items-center justify-center gap-2 text-lg',
              isStarting || (showModeSelection && !selectedMode)
                ? 'bg-gray-400 cursor-not-allowed'
                : 'bg-green-600 hover:bg-green-700'
            )}
          >
            {isStarting ? (
              <>
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                인터뷰 시작 중...
              </>
            ) : (
              <>
                <Play className="w-6 h-6" />
                인터뷰 시작
              </>
            )}
          </button>
        </div>
      </div>
    </main>
  );
}
