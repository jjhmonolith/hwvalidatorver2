'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Users, ArrowRight, ArrowLeft } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function JoinPage() {
  const router = useRouter();
  const [accessCode, setAccessCode] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const code = accessCode.trim().toUpperCase();

    if (!code) {
      setError('접속 코드를 입력해주세요');
      return;
    }

    if (code.length !== 6) {
      setError('접속 코드는 6자리입니다');
      return;
    }

    router.push(`/join/${code}`);
  };

  return (
    <main className="min-h-screen flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        <div className="bg-white rounded-xl shadow-lg p-8">
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Users className="w-8 h-8 text-blue-600" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">
              세션 참여
            </h1>
            <p className="text-gray-500">
              교사에게 받은 접속 코드를 입력하세요
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                접속 코드
              </label>
              <input
                type="text"
                value={accessCode}
                onChange={(e) => {
                  setAccessCode(e.target.value.toUpperCase());
                  setError('');
                }}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-center text-2xl font-mono tracking-widest uppercase"
                placeholder="ABC123"
                maxLength={6}
                autoFocus
              />
              {error && (
                <p className="mt-2 text-sm text-red-600">{error}</p>
              )}
            </div>

            <button
              type="submit"
              disabled={!accessCode.trim()}
              className={cn(
                'w-full py-3 rounded-lg font-medium text-white transition-colors flex items-center justify-center gap-2',
                !accessCode.trim()
                  ? 'bg-gray-400 cursor-not-allowed'
                  : 'bg-blue-600 hover:bg-blue-700'
              )}
            >
              참여하기
              <ArrowRight className="w-5 h-5" />
            </button>
          </form>

          <div className="mt-6 text-center">
            <Link
              href="/"
              className="text-gray-500 hover:text-gray-700 text-sm inline-flex items-center gap-1"
            >
              <ArrowLeft className="w-4 h-4" />
              홈으로 돌아가기
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
