'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Send, Mic, MicOff, Clock, ArrowRight, Volume2 } from 'lucide-react';
import { interviewApi, speechApi, ApiError } from '@/lib/api';
import { useStudentStore } from '@/lib/store';
import { cn, formatTime } from '@/lib/utils';

interface Message {
  role: 'ai' | 'student';
  content: string;
}

export default function InterviewPage() {
  const router = useRouter();
  const {
    sessionToken,
    participant,
    interviewState,
    currentQuestion,
    setInterviewState,
    setCurrentQuestion,
    updateTimeLeft,
    setConnected,
    clearSession,
  } = useStudentStore();

  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [error, setError] = useState('');
  const [timeLeft, setTimeLeft] = useState(0);
  const [showTransition, setShowTransition] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const heartbeatRef = useRef<NodeJS.Timeout | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);

  const isVoiceMode = participant?.status === 'interview_in_progress'; // Simplified check

  useEffect(() => {
    if (!sessionToken || !participant) {
      router.push('/');
      return;
    }

    // Initialize with current question
    if (currentQuestion) {
      setMessages([{ role: 'ai', content: currentQuestion }]);
    }

    // Load current state
    loadInterviewState();

    // Start heartbeat
    startHeartbeat();

    // Cleanup on unmount
    return () => {
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [sessionToken, participant, router]);

  // Update time left display
  useEffect(() => {
    if (interviewState?.topics_state) {
      const currentTopic = interviewState.topics_state[interviewState.current_topic_index];
      if (currentTopic) {
        setTimeLeft(currentTopic.timeLeft);
      }
    }
  }, [interviewState]);

  // Start timer countdown
  useEffect(() => {
    if (timeLeft > 0 && interviewState?.current_phase === 'topic_active') {
      timerRef.current = setInterval(() => {
        setTimeLeft((prev) => {
          const newTime = Math.max(0, prev - 1);
          updateTimeLeft(newTime);
          return newTime;
        });
      }, 1000);

      return () => {
        if (timerRef.current) clearInterval(timerRef.current);
      };
    }
  }, [interviewState?.current_phase]);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const loadInterviewState = async () => {
    if (!sessionToken) return;

    try {
      const res = await interviewApi.getState(sessionToken);
      setInterviewState(res.interview_state);

      // Get last AI question from conversations if available
      if (messages.length === 0 && res.conversations && res.conversations.length > 0) {
        const aiMessages = res.conversations.filter(c => c.role === 'ai');
        if (aiMessages.length > 0) {
          const lastQuestion = aiMessages[aiMessages.length - 1].content;
          setMessages([{ role: 'ai', content: lastQuestion }]);
        }
      }

      // Check if interview is completed
      if (
        res.participant.status === 'completed' ||
        res.participant.status === 'abandoned' ||
        res.participant.status === 'timeout'
      ) {
        router.push('/interview/complete');
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        clearSession();
        router.push('/');
      }
    }
  };

  const startHeartbeat = () => {
    if (heartbeatRef.current) clearInterval(heartbeatRef.current);

    heartbeatRef.current = setInterval(async () => {
      if (!sessionToken) return;

      try {
        const res = await interviewApi.heartbeat(sessionToken);
        setConnected(true);

        // Use remaining_time or time_left for backward compatibility
        const timeValue = res.remaining_time ?? res.time_left;
        if (timeValue !== undefined) {
          setTimeLeft(timeValue);
          updateTimeLeft(timeValue);
        }

        // Check for phase changes
        if (res.current_phase === 'topic_transition') {
          setShowTransition(true);
        } else if (res.current_phase === 'completed' || res.current_phase === 'finalizing') {
          router.push('/interview/complete');
        }
      } catch (err) {
        setConnected(false);
        if (err instanceof ApiError && err.status === 401) {
          clearSession();
          router.push('/');
        }
      }
    }, 5000);
  };

  const handleSubmitAnswer = useCallback(async (answer: string) => {
    if (!sessionToken || !answer.trim() || isSubmitting) return;

    try {
      setIsSubmitting(true);
      setError('');

      // Add student message
      setMessages((prev) => [...prev, { role: 'student', content: answer }]);
      setInputText('');

      const res = await interviewApi.submitAnswer(sessionToken, { answer });

      if (res.topic_complete) {
        if (res.is_last_topic) {
          // Interview complete
          router.push('/interview/complete');
        } else {
          // Show transition UI
          setShowTransition(true);
        }
      } else if (res.next_question) {
        // Add AI response
        setMessages((prev) => [...prev, { role: 'ai', content: res.next_question! }]);
        setCurrentQuestion(res.next_question);

        // Speak the question in voice mode
        if (isVoiceMode) {
          speakText(res.next_question);
        }
      }
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      }
    } finally {
      setIsSubmitting(false);
    }
  }, [sessionToken, isSubmitting, isVoiceMode, router]);

  const handleNextTopic = async () => {
    if (!sessionToken) return;

    try {
      setIsSubmitting(true);
      const res = await interviewApi.nextTopic(sessionToken);

      // Reset messages for new topic
      setMessages([{ role: 'ai', content: res.first_question }]);
      setCurrentQuestion(res.first_question);
      setShowTransition(false);

      // Reload state to get new topic info
      await loadInterviewState();

      // Speak in voice mode
      if (isVoiceMode) {
        speakText(res.first_question);
      }
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // Voice Mode Functions
  const speakText = async (text: string) => {
    if (!sessionToken) return;

    try {
      setIsSpeaking(true);
      const audioBuffer = await speechApi.textToSpeech(sessionToken, text);

      if (!audioContextRef.current) {
        audioContextRef.current = new AudioContext();
      }

      const audioData = await audioContextRef.current.decodeAudioData(audioBuffer);
      const source = audioContextRef.current.createBufferSource();
      source.buffer = audioData;
      source.connect(audioContextRef.current.destination);
      source.onended = () => setIsSpeaking(false);
      source.start(0);
    } catch (err) {
      console.error('TTS error:', err);
      setIsSpeaking(false);
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        stream.getTracks().forEach((track) => track.stop());

        if (!sessionToken) return;

        try {
          const res = await speechApi.speechToText(sessionToken, audioBlob);
          if (res.text) {
            handleSubmitAnswer(res.text);
          }
        } catch (err) {
          console.error('STT error:', err);
          setError('음성 인식에 실패했습니다');
        }
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (err) {
      console.error('Recording error:', err);
      setError('마이크 접근에 실패했습니다');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  if (!sessionToken || !participant) return null;

  // Transition UI
  if (showTransition) {
    return (
      <main className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="max-w-lg w-full text-center">
          <div className="bg-white rounded-xl shadow-lg p-8">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <ArrowRight className="w-8 h-8 text-green-600" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">
              주제 완료!
            </h1>
            <p className="text-gray-500 mb-6">
              다음 주제로 넘어갈 준비가 되면 버튼을 눌러주세요.
              <br />
              <span className="text-sm text-green-600">
                이 화면에서는 시간이 흐르지 않습니다.
              </span>
            </p>

            <button
              onClick={handleNextTopic}
              disabled={isSubmitting}
              className={cn(
                'w-full py-3 rounded-lg font-medium text-white transition-colors flex items-center justify-center gap-2',
                isSubmitting
                  ? 'bg-gray-400 cursor-not-allowed'
                  : 'bg-primary-600 hover:bg-primary-700'
              )}
            >
              {isSubmitting ? (
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  다음 주제 시작
                  <ArrowRight className="w-5 h-5" />
                </>
              )}
            </button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <header className="bg-white shadow-sm px-4 py-3">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="font-semibold text-gray-900">AI 인터뷰</h1>
            {interviewState && (
              <p className="text-sm text-gray-500">
                주제 {interviewState.current_topic_index + 1} /{' '}
                {interviewState.topics_state?.length || 0}
                {interviewState.topics_state?.[interviewState.current_topic_index] && (
                  <span className="ml-2">
                    - {interviewState.topics_state[interviewState.current_topic_index].title}
                  </span>
                )}
              </p>
            )}
          </div>

          {/* Timer */}
          <div
            className={cn(
              'flex items-center gap-2 px-4 py-2 rounded-lg font-mono text-lg',
              timeLeft <= 30
                ? 'bg-red-100 text-red-700'
                : timeLeft <= 60
                ? 'bg-yellow-100 text-yellow-700'
                : 'bg-gray-100 text-gray-700'
            )}
          >
            <Clock className="w-5 h-5" />
            {formatTime(timeLeft)}
          </div>
        </div>
      </header>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-6">
        <div className="max-w-4xl mx-auto space-y-4">
          {messages.map((msg, index) => (
            <div
              key={index}
              className={cn(
                'flex',
                msg.role === 'student' ? 'justify-end' : 'justify-start'
              )}
            >
              <div
                className={cn(
                  'max-w-[80%] px-4 py-3 rounded-2xl',
                  msg.role === 'student'
                    ? 'bg-primary-600 text-white rounded-br-md'
                    : 'bg-white shadow-sm rounded-bl-md'
                )}
              >
                {msg.role === 'ai' && (
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-medium text-gray-400">AI</span>
                    {isVoiceMode && !isSpeaking && (
                      <button
                        onClick={() => speakText(msg.content)}
                        className="text-gray-400 hover:text-gray-600"
                      >
                        <Volume2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                )}
                <p className="whitespace-pre-wrap">{msg.content}</p>
              </div>
            </div>
          ))}

          {isSubmitting && (
            <div className="flex justify-start">
              <div className="bg-white shadow-sm px-4 py-3 rounded-2xl rounded-bl-md">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" />
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce delay-100" />
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce delay-200" />
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="px-4 py-2 bg-red-50 border-t border-red-100">
          <div className="max-w-4xl mx-auto text-red-600 text-sm">
            {error}
            <button onClick={() => setError('')} className="ml-2 underline">
              닫기
            </button>
          </div>
        </div>
      )}

      {/* Input */}
      <div className="bg-white border-t px-4 py-4">
        <div className="max-w-4xl mx-auto">
          {isVoiceMode ? (
            // Voice Mode Input
            <div className="flex items-center justify-center">
              <button
                onMouseDown={startRecording}
                onMouseUp={stopRecording}
                onMouseLeave={stopRecording}
                onTouchStart={startRecording}
                onTouchEnd={stopRecording}
                disabled={isSubmitting || isSpeaking}
                className={cn(
                  'w-16 h-16 rounded-full flex items-center justify-center transition-all',
                  isRecording
                    ? 'bg-red-500 scale-110'
                    : isSubmitting || isSpeaking
                    ? 'bg-gray-300 cursor-not-allowed'
                    : 'bg-primary-600 hover:bg-primary-700'
                )}
              >
                {isRecording ? (
                  <MicOff className="w-8 h-8 text-white" />
                ) : (
                  <Mic className="w-8 h-8 text-white" />
                )}
              </button>
              <p className="ml-4 text-sm text-gray-500">
                {isRecording
                  ? '녹음 중... 손을 떼면 전송됩니다'
                  : isSpeaking
                  ? 'AI가 말하고 있습니다...'
                  : '버튼을 누르고 말하세요'}
              </p>
            </div>
          ) : (
            // Chat Mode Input
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSubmitAnswer(inputText);
              }}
              className="flex items-end gap-2"
            >
              <textarea
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSubmitAnswer(inputText);
                  }
                }}
                placeholder="답변을 입력하세요..."
                rows={1}
                className="flex-1 px-4 py-3 border border-gray-300 rounded-xl resize-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                style={{ minHeight: '48px', maxHeight: '120px' }}
              />
              <button
                type="submit"
                disabled={!inputText.trim() || isSubmitting}
                className={cn(
                  'p-3 rounded-xl transition-colors',
                  !inputText.trim() || isSubmitting
                    ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                    : 'bg-primary-600 text-white hover:bg-primary-700'
                )}
              >
                <Send className="w-5 h-5" />
              </button>
            </form>
          )}
        </div>
      </div>
    </main>
  );
}
