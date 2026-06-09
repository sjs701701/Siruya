import {DeviceRuntime, FirmwareUpdateStatus} from './types';

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

export function hasActiveAutoCountdown(
  runtime: DeviceRuntime | undefined,
  now: number,
) {
  return (
    runtime?.autoState === 'preparing' ||
    runtime?.autoState === 'watering' ||
    getRemainingAutoNextRunMs(runtime, now) > 0
  );
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
  if (runtime?.autoState === 'preparing') {
    return '곧 분사';
  }

  if (runtime?.autoState === 'watering') {
    return '분사 중';
  }

  const remainingMs = getRemainingAutoNextRunMs(runtime, now);

  if (remainingMs <= 0) {
    return '예약 없음';
  }

  return formatDuration(remainingMs);
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
