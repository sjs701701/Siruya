import {type DeviceControlBlockReason} from './deviceControl';

export function getControlBlockedMessage(reason: DeviceControlBlockReason) {
  switch (reason) {
    case 'setup':
      return '기기 설정이 아직 완료되지 않았습니다. 장치 등록을 먼저 완료해 주세요.';
    case 'missingToken':
      return '기기 제어 토큰이 없습니다. 보안 업데이트 이후 등록된 기기만 제어할 수 있어 기기를 다시 등록해 주세요.';
    case 'missingRoute':
      return '기기에 명령을 보낼 경로가 없습니다. 휴대폰과 기기가 같은 Wi-Fi에 연결되어 있는지 확인한 뒤 기기를 다시 등록해 주세요.';
    case 'offline':
    default:
      return '기기 상태를 먼저 다시 확인해 주세요. 제어 가능한 연결 상태일 때만 명령을 보낼 수 있습니다.';
  }
}

export function getCommandFailureMessage(error: unknown) {
  if (!(error instanceof Error)) {
    return '기기에 명령을 보내지 못했습니다. 연결 상태를 확인해 주세요.';
  }

  if (error.message === 'DEVICE_COMMAND_TOKEN_MISSING') {
    return getControlBlockedMessage('missingToken');
  }

  if (
    error.message === 'DEVICE_COMMAND_ROUTE_MISSING' ||
    error.message === 'DEVICE_IP_MISSING'
  ) {
    return getControlBlockedMessage('missingRoute');
  }

  return '기기에 명령을 보내지 못했습니다. 연결 상태를 확인해 주세요.';
}
