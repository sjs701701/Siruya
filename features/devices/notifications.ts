import {useCallback, useState} from 'react';

export type AppNotification = {
  id: string;
  title: string;
  message: string;
  createdAt: number;
};

// 실제 알림 연동 전까지 화면 확인용으로 쓰는 테스트 알림.
export function createSeedNotifications(now = Date.now()): AppNotification[] {
  return [
    {
      id: 'test-notification',
      title: '알림 테스트',
      message:
        '시루야 알림이 도착하면 이렇게 표시됩니다. 오른쪽 x 버튼으로 지울 수 있습니다.',
      createdAt: now - 5 * 60 * 1000,
    },
  ];
}

export function formatNotificationTime(createdAt: number, now = Date.now()) {
  const elapsedMinutes = Math.floor(Math.max(now - createdAt, 0) / 60000);

  if (elapsedMinutes < 1) {
    return '방금 전';
  }

  if (elapsedMinutes < 60) {
    return `${elapsedMinutes}분 전`;
  }

  const elapsedHours = Math.floor(elapsedMinutes / 60);

  if (elapsedHours < 24) {
    return `${elapsedHours}시간 전`;
  }

  return `${Math.floor(elapsedHours / 24)}일 전`;
}

export function useNotifications() {
  const [notifications, setNotifications] = useState<AppNotification[]>(() =>
    createSeedNotifications(),
  );

  const dismissNotification = useCallback((id: string) => {
    setNotifications(current =>
      current.filter(notification => notification.id !== id),
    );
  }, []);

  const clearNotifications = useCallback(() => {
    setNotifications([]);
  }, []);

  return {clearNotifications, dismissNotification, notifications};
}
