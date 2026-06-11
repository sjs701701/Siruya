import {
  createSeedNotifications,
  formatNotificationTime,
} from '../notifications';

const NOW = 1_750_000_000_000;

describe('formatNotificationTime', () => {
  it('formats elapsed time into Korean buckets', () => {
    expect(formatNotificationTime(NOW - 30 * 1000, NOW)).toBe('방금 전');
    expect(formatNotificationTime(NOW - 5 * 60 * 1000, NOW)).toBe('5분 전');
    expect(formatNotificationTime(NOW - 3 * 60 * 60 * 1000, NOW)).toBe(
      '3시간 전',
    );
    expect(formatNotificationTime(NOW - 2 * 24 * 60 * 60 * 1000, NOW)).toBe(
      '2일 전',
    );
  });

  it('treats future timestamps as just now', () => {
    expect(formatNotificationTime(NOW + 60 * 1000, NOW)).toBe('방금 전');
  });
});

describe('createSeedNotifications', () => {
  it('seeds exactly one test notification', () => {
    const seeded = createSeedNotifications(NOW);

    expect(seeded).toHaveLength(1);
    expect(seeded[0].title).toBe('알림 테스트');
    expect(seeded[0].createdAt).toBeLessThan(NOW);
  });
});
