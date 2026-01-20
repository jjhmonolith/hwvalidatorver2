'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Upload, FileText, X, ArrowRight, AlertCircle } from 'lucide-react';
import { interviewApi, ApiError } from '@/lib/api';
import { useStudentStore } from '@/lib/store';
import { cn } from '@/lib/utils';

export default function UploadPage() {
  const router = useRouter();
  const { sessionToken, participant, clearSession } = useStudentStore();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadComplete, setUploadComplete] = useState(false);
  const [topics, setTopics] = useState<Array<{ title: string; description: string }>>([]);
  const [error, setError] = useState('');
  const [dragOver, setDragOver] = useState(false);

  useEffect(() => {
    if (!sessionToken || !participant) {
      router.push('/');
      return;
    }
  }, [sessionToken, participant, router]);

  const handleFileSelect = (selectedFile: File) => {
    if (selectedFile.type !== 'application/pdf') {
      setError('PDF 파일만 업로드할 수 있습니다');
      return;
    }

    if (selectedFile.size > 10 * 1024 * 1024) {
      setError('파일 크기는 10MB를 초과할 수 없습니다');
      return;
    }

    setFile(selectedFile);
    setError('');
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);

    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) {
      handleFileSelect(droppedFile);
    }
  };

  const handleUpload = async () => {
    if (!file || !sessionToken) return;

    try {
      setIsUploading(true);
      setError('');

      const res = await interviewApi.uploadFile(sessionToken, file);
      setTopics(res.topics);
      setUploadComplete(true);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 401) {
          clearSession();
          router.push('/');
          return;
        }
        setError(err.message);
      } else {
        setError('업로드에 실패했습니다. 다시 시도해주세요.');
      }
    } finally {
      setIsUploading(false);
    }
  };

  const handleProceed = () => {
    router.push('/interview/start');
  };

  if (!sessionToken || !participant) return null;

  return (
    <main className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="max-w-2xl w-full">
        <div className="bg-white rounded-xl shadow-lg p-8">
          <div className="text-center mb-8">
            <h1 className="text-2xl font-bold text-gray-900 mb-2">
              과제 파일 업로드
            </h1>
            <p className="text-gray-500">
              {participant.student_name}님, 과제 파일을 업로드해주세요
            </p>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 flex items-center gap-2">
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
              {error}
            </div>
          )}

          {!uploadComplete ? (
            <>
              {/* Upload Area */}
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={cn(
                  'border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-colors',
                  dragOver
                    ? 'border-primary-500 bg-primary-50'
                    : file
                    ? 'border-green-500 bg-green-50'
                    : 'border-gray-300 hover:border-primary-400 hover:bg-gray-50'
                )}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf"
                  onChange={(e) => {
                    const selectedFile = e.target.files?.[0];
                    if (selectedFile) handleFileSelect(selectedFile);
                  }}
                  className="hidden"
                />

                {file ? (
                  <div className="flex items-center justify-center gap-3">
                    <FileText className="w-12 h-12 text-green-500" />
                    <div className="text-left">
                      <p className="font-medium text-gray-900">{file.name}</p>
                      <p className="text-sm text-gray-500">
                        {(file.size / 1024 / 1024).toFixed(2)} MB
                      </p>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setFile(null);
                      }}
                      className="p-1 text-gray-400 hover:text-red-500"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                ) : (
                  <>
                    <Upload className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                    <p className="text-gray-600 mb-2">
                      PDF 파일을 드래그하거나 클릭하여 선택
                    </p>
                    <p className="text-sm text-gray-400">
                      최대 10MB까지 업로드 가능
                    </p>
                  </>
                )}
              </div>

              {/* Upload Button */}
              <button
                onClick={handleUpload}
                disabled={!file || isUploading}
                className={cn(
                  'w-full mt-6 py-3 rounded-lg font-medium text-white transition-colors flex items-center justify-center gap-2',
                  !file || isUploading
                    ? 'bg-gray-400 cursor-not-allowed'
                    : 'bg-primary-600 hover:bg-primary-700'
                )}
              >
                {isUploading ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    AI가 과제를 분석하고 있습니다...
                  </>
                ) : (
                  <>
                    <Upload className="w-5 h-5" />
                    파일 업로드 및 분석
                  </>
                )}
              </button>
            </>
          ) : (
            <>
              {/* Analysis Complete */}
              <div className="bg-green-50 rounded-lg p-4 mb-6">
                <div className="flex items-center gap-2 text-green-700 font-medium mb-2">
                  <FileText className="w-5 h-5" />
                  파일 분석 완료
                </div>
                <p className="text-green-600 text-sm">
                  AI가 과제를 분석하여 {topics.length}개의 주제를 선정했습니다
                </p>
              </div>

              {/* Topics Preview */}
              <div className="space-y-3 mb-6">
                <h3 className="font-medium text-gray-700">인터뷰 주제</h3>
                {topics.map((topic, index) => (
                  <div key={index} className="p-4 bg-gray-50 rounded-lg">
                    <div className="font-medium text-gray-900">
                      {index + 1}. {topic.title}
                    </div>
                    <p className="text-sm text-gray-500 mt-1">
                      {topic.description}
                    </p>
                  </div>
                ))}
              </div>

              {/* Proceed Button */}
              <button
                onClick={handleProceed}
                className="w-full py-3 rounded-lg font-medium text-white bg-primary-600 hover:bg-primary-700 transition-colors flex items-center justify-center gap-2"
              >
                인터뷰 시작하기
                <ArrowRight className="w-5 h-5" />
              </button>
            </>
          )}

          <div className="mt-6 p-4 bg-blue-50 rounded-lg">
            <h3 className="font-medium text-blue-800 mb-2">안내</h3>
            <ul className="text-sm text-blue-700 space-y-1">
              <li>• AI가 제출한 과제를 분석하여 인터뷰 주제를 선정합니다</li>
              <li>• 분석에는 약 10-30초가 소요될 수 있습니다</li>
              <li>• 분석이 완료되면 인터뷰를 시작할 수 있습니다</li>
            </ul>
          </div>
        </div>
      </div>
    </main>
  );
}
