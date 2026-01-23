import db from '../db/connection.js';

/**
 * Disconnect Checker Worker
 * 이탈 감지 및 타임아웃 처리 워커
 *
 * 주요 기능:
 * 1. 하트비트 15초 초과 시 이탈 감지
 * 2. 이탈 30분 초과 시 포기(abandoned) 처리
 * 3. 주제별 시간 초과 처리
 */

const HEARTBEAT_TIMEOUT = 15; // seconds - 이탈 감지 기준
const RECONNECT_TIMEOUT = 1800; // seconds (30분) - 포기 처리 기준
const CHECK_INTERVAL = 5000; // ms - 체크 주기

/**
 * 이탈 감지 - 하트비트 15초 초과 참가자
 * 인터뷰 진행 중인데 하트비트가 없는 경우 일시정지 처리
 */
async function checkDisconnectedParticipants() {
  try {
    // 인터뷰 진행 중이면서 하트비트가 15초 이상 없는 참가자 조회
    const result = await db.query(`
      UPDATE student_participants sp
      SET
        status = 'interview_paused',
        disconnected_at = COALESCE(disconnected_at, NOW()),
        updated_at = NOW()
      FROM interview_states ist
      WHERE sp.id = ist.participant_id
        AND sp.status = 'interview_in_progress'
        AND ist.current_phase IN ('topic_active', 'topic_intro')
        AND sp.last_active_at < NOW() - ($1 || ' seconds')::interval
      RETURNING sp.id, sp.student_name, sp.session_id
    `, [HEARTBEAT_TIMEOUT]);

    if (result.rows.length > 0) {
      // 인터뷰 상태도 일시정지로 변경
      for (const participant of result.rows) {
        await db.query(`
          UPDATE interview_states
          SET
            current_phase = CASE
              WHEN current_phase = 'topic_active' THEN 'topic_paused'
              ELSE current_phase
            END,
            topic_paused_at = NOW(),
            updated_at = NOW()
          WHERE participant_id = $1
            AND current_phase = 'topic_active'
        `, [participant.id]);

        console.log(`[DisconnectChecker] Participant disconnected: ${participant.student_name} (${participant.id})`);
      }
    }

    return result.rows.length;
  } catch (error) {
    console.error('[DisconnectChecker] Error checking disconnected participants:', error);
    return 0;
  }
}

/**
 * 타임아웃 처리 - 30분 이탈 후 포기 처리
 */
async function checkTimeoutParticipants() {
  try {
    const result = await db.query(`
      UPDATE student_participants
      SET
        status = 'abandoned',
        interview_ended_at = NOW(),
        updated_at = NOW()
      WHERE status = 'interview_paused'
        AND disconnected_at < NOW() - ($1 || ' seconds')::interval
      RETURNING id, student_name, session_id
    `, [RECONNECT_TIMEOUT]);

    if (result.rows.length > 0) {
      // 인터뷰 상태도 완료로 변경
      for (const participant of result.rows) {
        await db.query(`
          UPDATE interview_states
          SET
            current_phase = 'completed',
            updated_at = NOW()
          WHERE participant_id = $1
        `, [participant.id]);

        console.log(`[DisconnectChecker] Participant abandoned (timeout): ${participant.student_name} (${participant.id})`);
      }
    }

    return result.rows.length;
  } catch (error) {
    console.error('[DisconnectChecker] Error checking timeout participants:', error);
    return 0;
  }
}

/**
 * 주제 시간 초과 처리
 * 현재 주제의 남은 시간이 0 이하인 경우 처리
 *
 * 정책 변경:
 * - 이탈 중에도 시간이 계속 흐름 (accumulated_pause_time 제거)
 * - 이탈 중 시간 만료 시 topic_expired_while_away 상태로 변경 (자동 전환 안함)
 * - 접속 중 시간 만료 시 topic_transition 상태로 변경
 */
async function checkTopicTimeouts() {
  try {
    // 주제 진행 중 또는 일시정지 상태에서 시간 체크
    // topic_active: 접속 중, topic_paused: 이탈 중
    const result = await db.query(`
      SELECT
        ist.id as state_id,
        ist.participant_id,
        ist.current_phase,
        ist.current_topic_index,
        ist.topics_state,
        ist.topic_started_at,
        sp.student_name,
        sp.status as participant_status,
        ass.topic_count,
        ass.topic_duration
      FROM interview_states ist
      JOIN student_participants sp ON sp.id = ist.participant_id
      JOIN assignment_sessions ass ON ass.id = sp.session_id
      WHERE ist.current_phase IN ('topic_active', 'topic_paused')
        AND sp.status IN ('interview_in_progress', 'interview_paused')
    `);

    let timeoutCount = 0;

    for (const row of result.rows) {
      const topicsState = row.topics_state || [];
      const currentTopic = topicsState[row.current_topic_index];

      if (!currentTopic || !row.topic_started_at) continue;

      // 실제 경과 시간 계산 (이탈 시간도 포함 - accumulated_pause_time 제거)
      const elapsedSeconds = Math.floor(
        (Date.now() - new Date(row.topic_started_at).getTime()) / 1000
      );

      const timeLeft = currentTopic.totalTime - elapsedSeconds;

      if (timeLeft <= 0) {
        // 시간 초과 - 현재 주제 완료 처리
        const updatedTopicsState = [...topicsState];
        updatedTopicsState[row.current_topic_index] = {
          ...currentTopic,
          timeLeft: 0,
          status: 'timeout'
        };

        const isLastTopic = row.current_topic_index >= row.topic_count - 1;
        const isDisconnected = row.participant_status === 'interview_paused';

        if (isLastTopic) {
          // 마지막 주제 - 인터뷰 완료
          await db.query(`
            UPDATE interview_states
            SET
              current_phase = 'finalizing',
              topics_state = $1,
              updated_at = NOW()
            WHERE id = $2
          `, [JSON.stringify(updatedTopicsState), row.state_id]);

          await db.query(`
            UPDATE student_participants
            SET
              status = 'timeout',
              interview_ended_at = NOW(),
              updated_at = NOW()
            WHERE id = $1
          `, [row.participant_id]);

          console.log(`[DisconnectChecker] Interview timeout (last topic): ${row.student_name}`);
        } else if (isDisconnected) {
          // 이탈 중 시간 만료 - 재접속 시 전환 페이지 표시 위해 별도 상태
          await db.query(`
            UPDATE interview_states
            SET
              current_phase = 'topic_expired_while_away',
              topics_state = $1,
              updated_at = NOW()
            WHERE id = $2
          `, [JSON.stringify(updatedTopicsState), row.state_id]);

          console.log(`[DisconnectChecker] Topic expired while disconnected: ${row.student_name} (topic ${row.current_topic_index + 1})`);
        } else {
          // 접속 중 시간 만료 - 다음 주제로 전환 대기
          await db.query(`
            UPDATE interview_states
            SET
              current_phase = 'topic_transition',
              topics_state = $1,
              topic_started_at = NULL,
              updated_at = NOW()
            WHERE id = $2
          `, [JSON.stringify(updatedTopicsState), row.state_id]);

          console.log(`[DisconnectChecker] Topic timeout, awaiting transition: ${row.student_name} (topic ${row.current_topic_index + 1})`);
        }

        timeoutCount++;
      }
    }

    return timeoutCount;
  } catch (error) {
    console.error('[DisconnectChecker] Error checking topic timeouts:', error);
    return 0;
  }
}

/**
 * 세션 종료 시간 체크
 * 세션의 ends_at이 지난 경우 세션 및 진행 중인 인터뷰 종료
 */
async function checkSessionExpiry() {
  try {
    // 종료 시간이 지난 활성 세션 조회
    const expiredSessions = await db.query(`
      UPDATE assignment_sessions
      SET
        status = 'closed',
        updated_at = NOW()
      WHERE status = 'active'
        AND ends_at IS NOT NULL
        AND ends_at < NOW()
      RETURNING id, title
    `);

    if (expiredSessions.rows.length > 0) {
      for (const session of expiredSessions.rows) {
        // 해당 세션의 진행 중인 모든 참가자 종료 처리
        await db.query(`
          UPDATE student_participants
          SET
            status = CASE
              WHEN status IN ('interview_in_progress', 'interview_paused') THEN 'timeout'
              ELSE status
            END,
            interview_ended_at = CASE
              WHEN interview_ended_at IS NULL AND status IN ('interview_in_progress', 'interview_paused')
              THEN NOW()
              ELSE interview_ended_at
            END,
            updated_at = NOW()
          WHERE session_id = $1
            AND status IN ('registered', 'file_submitted', 'interview_in_progress', 'interview_paused')
        `, [session.id]);

        console.log(`[DisconnectChecker] Session expired: ${session.title} (${session.id})`);
      }
    }

    return expiredSessions.rows.length;
  } catch (error) {
    console.error('[DisconnectChecker] Error checking session expiry:', error);
    return 0;
  }
}

/**
 * 메인 체크 루프
 */
async function runChecks() {
  const disconnected = await checkDisconnectedParticipants();
  const timedOut = await checkTimeoutParticipants();
  const topicTimeouts = await checkTopicTimeouts();
  const sessionExpired = await checkSessionExpiry();

  if (disconnected > 0 || timedOut > 0 || topicTimeouts > 0 || sessionExpired > 0) {
    console.log(`[DisconnectChecker] Check complete - Disconnected: ${disconnected}, Abandoned: ${timedOut}, Topic Timeouts: ${topicTimeouts}, Sessions Expired: ${sessionExpired}`);
  }
}

let intervalId = null;

/**
 * 워커 시작
 */
export function startDisconnectChecker() {
  if (intervalId) {
    console.log('[DisconnectChecker] Already running');
    return;
  }

  console.log(`[DisconnectChecker] Starting with ${CHECK_INTERVAL}ms interval`);
  intervalId = setInterval(runChecks, CHECK_INTERVAL);

  // 즉시 한 번 실행
  runChecks();
}

/**
 * 워커 중지
 */
export function stopDisconnectChecker() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
    console.log('[DisconnectChecker] Stopped');
  }
}

export default {
  startDisconnectChecker,
  stopDisconnectChecker,
  checkDisconnectedParticipants,
  checkTimeoutParticipants,
  checkTopicTimeouts,
  checkSessionExpiry
};
