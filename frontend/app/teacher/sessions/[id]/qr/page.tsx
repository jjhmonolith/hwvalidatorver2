'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Copy, Check, ExternalLink } from 'lucide-react';
import { sessionsApi, ApiError } from '@/lib/api';
import { useAuthStore } from '@/lib/store';

export default function SessionQRPage() {
  const router = useRouter();
  const params = useParams();
  const { token, isAuthenticated, logout } = useAuthStore();

  const [qrCode, setQrCode] = useState<string | null>(null);
  const [accessUrl, setAccessUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  const sessionId = params.id as string;

  useEffect(() => {
    if (!isAuthenticated || !token) {
      router.push('/teacher/login');
      return;
    }

    loadQRCode();
  }, [isAuthenticated, token, sessionId, router]);

  const loadQRCode = async () => {
    if (!token) return;

    try {
      setIsLoading(true);
      const res = await sessionsApi.getQR(token, sessionId);
      setQrCode(res.qr_code);
      setAccessUrl(res.access_url);
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

  const copyLink = () => {
    if (accessUrl) {
      navigator.clipboard.writeText(accessUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (!isAuthenticated) return null;

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <Link
            href={`/teacher/sessions/${sessionId}`}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-900"
          >
            <ArrowLeft className="w-5 h-5" />
            세션으로 돌아가기
          </Link>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-12">
        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-600">
            {error}
          </div>
        )}

        <div className="bg-white rounded-xl shadow-lg p-8 text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            학생 접속 QR 코드
          </h1>
          <p className="text-gray-500 mb-8">
            학생들이 이 QR 코드를 스캔하여 세션에 참여할 수 있습니다
          </p>

          {isLoading ? (
            <div className="w-64 h-64 mx-auto bg-gray-100 rounded-lg flex items-center justify-center">
              <div className="w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : qrCode ? (
            <div className="inline-block p-4 bg-white border-4 border-gray-200 rounded-xl">
              <img
                src={qrCode}
                alt="QR Code"
                className="w-64 h-64"
              />
            </div>
          ) : (
            <div className="w-64 h-64 mx-auto bg-gray-100 rounded-lg flex items-center justify-center">
              <p className="text-gray-500">QR 코드를 불러올 수 없습니다</p>
            </div>
          )}

          {accessUrl && (
            <div className="mt-8">
              <p className="text-sm text-gray-500 mb-2">또는 링크로 접속</p>
              <div className="flex items-center justify-center gap-2">
                <code className="bg-gray-100 px-4 py-2 rounded-lg text-sm break-all">
                  {accessUrl}
                </code>
                <button
                  onClick={copyLink}
                  className="p-2 text-gray-400 hover:text-gray-600"
                  title="링크 복사"
                >
                  {copied ? (
                    <Check className="w-5 h-5 text-green-500" />
                  ) : (
                    <Copy className="w-5 h-5" />
                  )}
                </button>
                <a
                  href={accessUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-2 text-gray-400 hover:text-gray-600"
                  title="새 탭에서 열기"
                >
                  <ExternalLink className="w-5 h-5" />
                </a>
              </div>
            </div>
          )}

          <div className="mt-8 p-4 bg-blue-50 rounded-lg text-left">
            <h3 className="font-medium text-blue-900 mb-2">사용 안내</h3>
            <ul className="text-sm text-blue-700 space-y-1">
              <li>• 학생들이 QR 코드를 스캔하거나 링크를 클릭하면 참여 페이지로 이동합니다</li>
              <li>• 학생은 이름(필수)과 학번(선택)을 입력하여 세션에 참여합니다</li>
              <li>• 세션이 활성 상태일 때만 학생이 참여할 수 있습니다</li>
            </ul>
          </div>
        </div>
      </main>
    </div>
  );
}
