import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function getStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    draft: '초안',
    active: '활성',
    closed: '종료',
    registered: '등록됨',
    file_submitted: '파일 제출됨',
    interview_in_progress: '인터뷰 중',
    interview_paused: '일시정지',
    completed: '완료',
    abandoned: '중도 이탈',
    timeout: '시간 초과',
  };
  return labels[status] || status;
}

export function getStatusColor(status: string): string {
  const colors: Record<string, string> = {
    draft: 'bg-gray-100 text-gray-800',
    active: 'bg-green-100 text-green-800',
    closed: 'bg-red-100 text-red-800',
    registered: 'bg-blue-100 text-blue-800',
    file_submitted: 'bg-yellow-100 text-yellow-800',
    interview_in_progress: 'bg-purple-100 text-purple-800',
    interview_paused: 'bg-orange-100 text-orange-800',
    completed: 'bg-green-100 text-green-800',
    abandoned: 'bg-red-100 text-red-800',
    timeout: 'bg-red-100 text-red-800',
  };
  return colors[status] || 'bg-gray-100 text-gray-800';
}

export function getInterviewModeLabel(mode: string): string {
  const labels: Record<string, string> = {
    voice: '음성',
    chat: '채팅',
    student_choice: '학생 선택',
  };
  return labels[mode] || mode;
}
