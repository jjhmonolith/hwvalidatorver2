'use client';

import Link from 'next/link';
import { BookOpen, Users, GraduationCap } from 'lucide-react';

export default function HomePage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-8">
      <div className="max-w-4xl w-full text-center">
        <h1 className="text-4xl font-bold text-gray-900 mb-4">
          HW Validator
        </h1>
        <p className="text-xl text-gray-600 mb-12">
          과제 검증 AI 인터뷰 시스템
        </p>

        <div className="grid md:grid-cols-2 gap-6 mb-12">
          <Link
            href="/teacher/login"
            className="flex flex-col items-center p-8 bg-white rounded-xl shadow-lg hover:shadow-xl transition-shadow border border-gray-100"
          >
            <div className="w-16 h-16 bg-primary-100 rounded-full flex items-center justify-center mb-4">
              <GraduationCap className="w-8 h-8 text-primary-600" />
            </div>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">
              교사 로그인
            </h2>
            <p className="text-gray-500">
              세션 생성 및 학생 관리
            </p>
          </Link>

          <Link
            href="/join"
            className="flex flex-col items-center p-8 bg-white rounded-xl shadow-lg hover:shadow-xl transition-shadow border border-gray-100"
          >
            <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mb-4">
              <Users className="w-8 h-8 text-blue-600" />
            </div>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">
              학생 참여
            </h2>
            <p className="text-gray-500 mb-4">
              링크 또는 QR 코드로 접속
            </p>
            <p className="text-sm text-gray-400">
              교사에게 받은 접속 코드를 사용하세요
            </p>
          </Link>
        </div>

        <div className="bg-gray-50 rounded-xl p-6">
          <div className="flex items-center justify-center gap-2 mb-4">
            <BookOpen className="w-5 h-5 text-gray-500" />
            <h3 className="font-medium text-gray-700">사용 방법</h3>
          </div>
          <div className="grid md:grid-cols-3 gap-4 text-sm text-gray-600">
            <div className="bg-white p-4 rounded-lg">
              <div className="font-medium text-gray-900 mb-1">1. 세션 생성</div>
              <p>교사가 과제 인터뷰 세션을 생성합니다</p>
            </div>
            <div className="bg-white p-4 rounded-lg">
              <div className="font-medium text-gray-900 mb-1">2. 학생 참여</div>
              <p>학생이 링크/QR로 접속하여 파일을 업로드합니다</p>
            </div>
            <div className="bg-white p-4 rounded-lg">
              <div className="font-medium text-gray-900 mb-1">3. AI 인터뷰</div>
              <p>AI가 과제 내용에 대해 질문하고 평가합니다</p>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
