# HW Validator ver.2 - 이탈 및 재접속 정책

## 개요

학생이 인터뷰 진행 중 브라우저를 닫거나 네트워크가 끊어지는 등의 이탈 상황에서도
인터뷰를 계속 진행할 수 있도록 하는 재접속 기능입니다.

### 핵심 원칙

1. **시간은 계속 흐른다**: 학생이 이탈해도 현재 주제의 시간은 서버에서 계속 차감
2. **현재 주제만 영향**: 이탈 중에는 현재 주제 시간만 차감, 다음 주제는 대기 상태 유지
3. **자연스러운 복귀**: 재접속 시 전환 페이지를 통해 다음 주제로 안내
4. **명확한 상태 표시**: 교사 대시보드에서 학생의 상태를 정확히 파악 가능

---

## 시간 흐름 정책

### 기존 ver1 동작
- 클라이언트 기반 타이머
- 페이지 이탈 시 타이머 정지
- 재접속 개념 없음

### ver2 개선사항
- 서버 기반 타이머 (Heartbeat 동기화)
- 이탈 시에도 서버에서 시간 계속 차감
- 재접속 시 남은 시간으로 계속 진행
- 30분 재접속 타임아웃

```
┌─────────────────────────────────────────────────────────────┐
│                    시간 흐름 비교                            │
├─────────────────────────────────────────────────────────────┤
│  ver1: 이탈 ─────[시간 정지]───── 재접속 → 이어서 진행       │
│  ver2: 이탈 ─────[시간 흐름]───── 재접속 → 남은 시간으로 진행 │
└─────────────────────────────────────────────────────────────┘
```

---

## 케이스별 시나리오

### 케이스 1: 정상 인터뷰 진행

```
학생 접속 → 주제 1 진행 → 완료 → 주제 2 → ... → 인터뷰 완료
```

- 타이머: 클라이언트 1초 간격 + 서버 Heartbeat 5초 동기화
- 상태: `interview_in_progress` → `completed`
- 결과: 요약 및 평가 표시

---

### 케이스 2: 이탈 후 시간 내 재접속

```
학생 접속 → 주제 1 진행 중 (시간 2분 남음) → 이탈
          → [서버: 시간 계속 차감]
          → 30초 후 재접속
          → 남은 시간 1분 30초로 표시, 계속 진행
```

**동작:**
- 이탈 감지: 15초간 Heartbeat 없음 → `interview_paused` 상태
- 시간 차감: `topic_started_at` 기준으로 경과 시간 계산
- 재접속: 남은 시간 = `totalTime - elapsed` (pause 시간 제외 없음)

---

### 케이스 3: 이탈 중 주제 시간 만료 (다음 주제 있음)

```
학생 접속 → 주제 1 진행 중 (시간 30초 남음) → 이탈
          → [서버: 30초 후 시간 만료 감지]
          → [서버: current_phase = 'topic_expired_while_away']
          → 2분 후 재접속
          → 전환 페이지 표시: "주제 1 시간이 만료되었습니다"
          → 학생 확인 클릭 → 주제 2 시작 (새로 전체 시간)
```

**전환 페이지 UI:**
```
┌────────────────────────────────────────┐
│           ⏰ 주제 시간 종료             │
│                                        │
│         "주제 1 제목"                   │
│    이전 주제의 시간이 종료되었습니다.    │
│    다음 주제로 넘어갈 준비가 되면        │
│    버튼을 눌러주세요.                   │
│                                        │
│    ⓘ 이 화면에서는 시간이 흐르지 않습니다 │
│                                        │
│        [ 다음 주제 시작 → ]             │
└────────────────────────────────────────┘
```

**핵심 정책:**
- 이탈 중 **현재 주제 시간만** 차감
- 다음 주제는 **재접속 후 학생 확인 시** 시작
- 다음 주제 시간은 이탈 중에 차감되지 않음

---

### 케이스 4: 이탈 중 마지막 주제 시간 만료

```
학생 접속 → 주제 3 (마지막) 진행 중 → 이탈 (시간 30초 남음)
          → [서버: 30초 후 시간 만료 감지]
          → [서버: 자동 종료, status = 'timeout']
          → 5분 후 재접속
          → 완료 페이지로 이동 (요약/평가 표시)
```

**동작:**
- 마지막 주제 만료 시 인터뷰 자동 종료
- 요약 생성 후 `completed` 또는 `timeout` 상태
- 재접속 시 `/interview/complete` 페이지로 리다이렉트

---

### 케이스 5: 30분 재접속 타임아웃 초과

```
학생 접속 → 인터뷰 진행 중 → 이탈
          → [서버: 30분 경과, 재접속 없음]
          → [서버: status = 'abandoned']
          → 학생 재접속 시도
          → 오류: "세션이 만료되었습니다"
```

**교사 대시보드 표시:**

| 상태 | 표시 텍스트 | 색상 |
|------|------------|------|
| `completed` | 완료 | 녹색 |
| `timeout` | 시간 초과 | 빨간색 |
| `abandoned` | **중도 이탈** | 빨간색 |
| `interview_in_progress` | 진행 중 | 보라색 |
| `interview_paused` | 일시 정지 | 주황색 |

---

## 상태 전이 다이어그램

```
                         ┌──────────────────────────────────────────┐
                         │                                          │
                         ▼                                          │
                   ┌──────────┐                                     │
                   │registered│                                     │
                   └────┬─────┘                                     │
                        │ 파일 제출                                  │
                        ▼                                           │
                ┌──────────────┐                                    │
                │file_submitted│                                    │
                └──────┬───────┘                                    │
                       │ 인터뷰 시작                                 │
                       ▼                                            │
     ┌─────────────────────────┐      15초 Heartbeat 없음           │
     │interview_in_progress    │◄─────────────────┐                 │
     └────┬────────────────────┘                  │                 │
          │                                       │                 │
          │ 15초 Heartbeat 없음                   │ 재접속          │
          ▼                                       │ (30분 이내)     │
     ┌──────────────────┐                         │                 │
     │interview_paused  │─────────────────────────┘                 │
     └────┬─────────────┘                                           │
          │                                                         │
          │ 30분 초과                                                │
          ▼                                                         │
     ┌──────────┐          ┌─────────┐         ┌──────────┐        │
     │abandoned │          │timeout  │         │completed │────────┘
     │(중도이탈)│          │(시간초과)│         │(완료)    │
     └──────────┘          └─────────┘         └──────────┘
```

### 인터뷰 Phase 상태

| Phase | 설명 |
|-------|------|
| `topic_active` | 주제 진행 중 (타이머 작동) |
| `topic_paused` | 이탈로 인한 일시 정지 (타이머는 계속 차감) |
| `topic_transition` | 주제 완료, 다음 주제 전환 대기 |
| `topic_expired_while_away` | 이탈 중 시간 만료, 재접속 시 전환 페이지 표시 |
| `finalizing` | 인터뷰 종료 처리 중 |
| `completed` | 인터뷰 완료 |

---

## 기술 구현

### 백엔드

#### 1. Disconnect Checker Worker (`backend/workers/disconnectChecker.js`)

```javascript
// 15초간 Heartbeat 없으면 이탈로 판정
const HEARTBEAT_TIMEOUT = 15;

// 30분간 재접속 없으면 abandoned 처리
const RECONNECT_TIMEOUT = 30 * 60; // 1800초

// 시간 계산 (accumulated_pause_time 제외)
const elapsedSeconds = Math.floor(
  (Date.now() - new Date(topic_started_at).getTime()) / 1000
);
const remainingTime = totalTime - elapsedSeconds;
```

#### 2. Heartbeat API (`backend/routes/interview.js`)

```javascript
// POST /api/interview/heartbeat
{
  status: 'interview_in_progress',
  current_topic_index: 0,
  current_phase: 'topic_active',
  remaining_time: 120,  // 초 단위
  time_expired: false,
  show_transition_page: false,
  topics_state: [...]
}
```

#### 3. Reconnect API (`backend/routes/join.js`)

```javascript
// POST /api/join/reconnect
{
  message: 'Reconnection successful',
  participant_id: '...',
  status: 'interview_in_progress',
  time_deducted: 30,  // 이탈 중 차감된 시간
  session_info: {...},
  interview_state: {...},
  show_transition_page: true,  // 전환 페이지 표시 여부
  expired_topic_titles: ['주제 1'],  // 만료된 주제 제목
  next_topic_index: 1
}
```

#### 4. Confirm Transition API (`backend/routes/interview.js`)

```javascript
// POST /api/interview/confirm-transition
// 전환 페이지에서 "다음 주제 시작" 클릭 시 호출

{
  message: 'Moving to next topic',
  should_finalize: false,
  current_topic_index: 1,
  current_topic: { title: '주제 2', description: '...' },
  first_question: 'AI가 생성한 첫 번째 질문...',
  topics_state: [...]
}
```

### 프론트엔드

#### 1. 타임아웃 핸들링 (`frontend/app/interview/page.tsx`)

```typescript
// 시간 초기화 여부 추적 (초기값 0으로 인한 오작동 방지)
const [hasTimeInitialized, setHasTimeInitialized] = useState(false);

// 시간 만료 시 자동 처리
useEffect(() => {
  if (
    timeLeft === 0 &&
    hasTimeInitialized &&
    interviewState?.current_phase === 'topic_active' &&
    !handlingTimeout
  ) {
    handleTopicTimeout();
  }
}, [timeLeft, hasTimeInitialized, ...]);
```

#### 2. 전환 페이지 분기

```typescript
// topic_expired_while_away: 이탈 중 만료 → confirmTransition API
// topic_transition: 정상 완료 → nextTopic API
<button onClick={isTopicExpiredWhileAway ? handleConfirmTransition : handleNextTopic}>
  다음 주제 시작
</button>
```

---

## 설정 값

| 설정 | 기본값 | 설명 |
|------|--------|------|
| `HEARTBEAT_INTERVAL` | 5초 | 클라이언트 Heartbeat 전송 주기 |
| `HEARTBEAT_TIMEOUT` | 15초 | 이탈 판정 기준 시간 |
| `RECONNECT_TIMEOUT` | 30분 | 재접속 허용 시간 (session별 설정 가능) |
| `topic_duration` | 세션 설정 | 주제당 할당 시간 |

---

## 테스트 시나리오 체크리스트

- [ ] 정상 인터뷰 완료 후 요약 페이지 표시
- [ ] 이탈 후 시간 내 재접속 → 남은 시간으로 계속 진행
- [ ] 이탈 중 주제 1 만료 → 재접속 → 전환 페이지 → 주제 2
- [ ] 이탈 중 마지막 주제 만료 → 재접속 → 완료 페이지
- [ ] 30분 타임아웃 → abandoned → 교사 대시보드 "중도 이탈"
- [ ] 장시간 이탈 (주제 1만 만료) → 재접속 → 주제 2 전환 (새 시간)
- [ ] 인터뷰 시작 직후 전환 페이지 나타나지 않음

---

## 관련 파일

| 파일 | 역할 |
|------|------|
| `backend/workers/disconnectChecker.js` | 이탈 감지, 시간 만료 처리 |
| `backend/routes/interview.js` | Heartbeat, 상태 관리, 전환 API |
| `backend/routes/join.js` | 재접속 처리 |
| `frontend/app/interview/page.tsx` | 인터뷰 UI, 타임아웃 처리 |
| `frontend/lib/api.ts` | API 클라이언트 |
| `frontend/lib/utils.ts` | 상태 라벨/색상 정의 |

---

## 변경 이력

| 날짜 | 변경 내용 |
|------|----------|
| 2025-01-23 | 초기 문서 작성 |
| 2025-01-23 | `hasTimeInitialized` 플래그 추가 (시작 시 전환 페이지 버그 수정) |
