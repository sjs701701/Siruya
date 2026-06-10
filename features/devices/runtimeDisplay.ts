import {DeviceRuntime, FirmwareUpdateStatus} from './types';

// 펌웨어 자동분사 주기(AUTO_CHECK_INTERVAL_MS = 2시간)와 같은 값이어야
// 물 공급주기 게이지가 전체 주기에 걸쳐 차오른다.
export const WATER_AUTO_CYCLE_MS = 2 * 60 * 60 * 1000;

// 카운트다운이 0에 닿은 뒤 기기가 preparing/watering을 보고할 때까지의 공백.
// 기기 상태 푸시(3초)·HTTP 폴링(5초) 주기를 덮을 만큼만 유지한다.
const SPRAY_IMMINENT_GRACE_MS = 12 * 1000;

const MIN_COUNTING_PROGRESS = 0.05;
const PRE_SPRAY_PROGRESS = 0.97;

export type AutoCyclePhase =
  | 'watering'
  | 'preparing'
  | 'imminent'
  | 'counting'
  | 'none';

export function getRemainingAutoNextRunMs(
  runtime: DeviceRuntime | undefined,
  now: number,
) {
  if (!runtime?.autoNextRunInMs || runtime.autoNextRunInMs <= 0) {
    return 0;
  }

  const elapsed = runtime.lastSeenAt ? now - runtime.lastSeenAt : 0;
  return Math.max(runtime.autoNextRunInMs - elapsed, 0);
}

export function getAutoCyclePhase(
  runtime: DeviceRuntime | undefined,
  now: number,
): AutoCyclePhase {
  if (runtime?.autoState === 'watering') {
    return 'watering';
  }

  if (runtime?.autoState === 'preparing') {
    return 'preparing';
  }

  if (!runtime?.autoNextRunInMs || runtime.autoNextRunInMs <= 0) {
    return 'none';
  }

  if (getRemainingAutoNextRunMs(runtime, now) > 0) {
    return 'counting';
  }

  const elapsed = runtime.lastSeenAt ? now - runtime.lastSeenAt : 0;
  const sinceCountdownEnd = elapsed - runtime.autoNextRunInMs;
  return sinceCountdownEnd <= SPRAY_IMMINENT_GRACE_MS ? 'imminent' : 'none';
}

export function getWaterCycleProgress(
  runtime: DeviceRuntime | undefined,
  now: number,
) {
  const phase = getAutoCyclePhase(runtime, now);

  if (phase === 'watering') {
    return 1;
  }

  if (phase === 'preparing' || phase === 'imminent') {
    return PRE_SPRAY_PROGRESS;
  }

  if (phase === 'none') {
    return 0;
  }

  const remainingMs = getRemainingAutoNextRunMs(runtime, now);
  const elapsedRatio = 1 - Math.min(remainingMs / WATER_AUTO_CYCLE_MS, 1);
  return Math.min(
    Math.max(elapsedRatio, MIN_COUNTING_PROGRESS),
    PRE_SPRAY_PROGRESS,
  );
}

export function hasActiveAutoCountdown(
  runtime: DeviceRuntime | undefined,
  now: number,
) {
  return getAutoCyclePhase(runtime, now) !== 'none';
}

export function getAutoStateLabel(runtime: DeviceRuntime | undefined) {
  if (runtime?.autoState === 'preparing') {
    return '자동분사 준비 중';
  }

  if (runtime?.autoState === 'watering') {
    return '자동분사 중';
  }

  return '대기 중';
}

export function getNextSprayText(
  runtime: DeviceRuntime | undefined,
  now: number,
) {
  const phase = getAutoCyclePhase(runtime, now);

  if (phase === 'watering') {
    return '분사 중';
  }

  if (phase === 'preparing' || phase === 'imminent') {
    return '곧 분사';
  }

  if (phase === 'none') {
    return '예약 없음';
  }

  return formatDuration(getRemainingAutoNextRunMs(runtime, now));
}

export function formatDuration(ms: number) {
  const totalSeconds = Math.ceil(Math.max(ms, 0) / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}시간 ${minutes}분`;
  }

  if (minutes > 0) {
    return `${minutes}분 ${seconds}초`;
  }

  return `${seconds}초`;
}

export function getFirmwareStatusLabel(
  status: FirmwareUpdateStatus | undefined,
  progress = 0,
) {
  if (status === 'available') {
    return '업데이트 가능';
  }

  if (status === 'updating') {
    return progress > 0 ? `업데이트 중 ${progress}%` : '업데이트 준비 중';
  }

  if (status === 'updated') {
    return '최신 버전 적용 완료';
  }

  if (status === 'failed') {
    return '업데이트 실패';
  }

  return '최신 상태 확인 대기';
}
