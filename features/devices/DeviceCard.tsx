import React, {useEffect, useMemo, useState} from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import {getProductDefinition} from './deviceRegistry';
import {
  getAutoStateLabel,
  getNextSprayText,
  hasActiveAutoCountdown,
} from './runtimeDisplay';
import {Device} from './types';

type Props = {
  device: Device;
  onPress: () => void;
  onPower: () => void;
};

function DeviceCard({device, onPress, onPower}: Props) {
  const product = getProductDefinition(device.type);
  const isActive = device.controls.running;
  const [now, setNow] = useState(Date.now());
  const nextSprayText = useMemo(
    () => getNextSprayText(device.runtime, now),
    [device.runtime, now],
  );
  const hasCountdown = useMemo(
    () => hasActiveAutoCountdown(device.runtime, now),
    [device.runtime, now],
  );

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <Pressable
      style={[styles.card, isActive && styles.cardActive]}
      onPress={onPress}>
      <View style={styles.cardTop}>
        <View style={[styles.icon, isActive && styles.iconActive]}>
          <Text style={styles.iconText}>{product.badge}</Text>
        </View>
        <Pressable
          accessibilityLabel={`${device.name} 전원`}
          style={[styles.powerButton, isActive && styles.powerButtonActive]}
          onPress={event => {
            event.stopPropagation();
            onPower();
          }}>
          <Text style={[styles.powerText, isActive && styles.powerTextActive]}>
            {isActive ? 'ON' : 'OFF'}
          </Text>
        </Pressable>
      </View>

      <Text style={styles.name} numberOfLines={1}>
        {device.name}
      </Text>
      <Text style={styles.meta} numberOfLines={1}>
        {device.room} · {device.status === 'online' ? '온라인' : '오프라인'}
      </Text>

      {device.runtime?.autoRunning && (
        <View style={styles.autoBadge}>
          <Text style={styles.autoBadgeText}>
            {getAutoStateLabel(device.runtime)}
          </Text>
        </View>
      )}

      {device.type === 'sprout-grower' && hasCountdown && (
        <View style={styles.nextSprayBadge}>
          <Text style={styles.nextSprayText}>다음 {nextSprayText}</Text>
        </View>
      )}

      {device.type === 'sprout-grower' && (
        <View style={styles.signals}>
          <Text style={styles.signalText}>
            물 {device.controls.water ? 'ON' : 'OFF'}
          </Text>
          <Text style={styles.signalText}>
            팬 {device.controls.fan ? 'ON' : 'OFF'}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 8,
    minHeight: 174,
    padding: 16,
    width: '47.8%',
  },
  cardActive: {
    backgroundColor: '#d9ecfb',
  },
  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  icon: {
    alignItems: 'center',
    backgroundColor: '#e5e7eb',
    borderRadius: 7,
    height: 38,
    justifyContent: 'center',
    width: 38,
  },
  iconActive: {
    backgroundColor: '#8fd3f9',
  },
  iconText: {
    color: '#334155',
    fontSize: 14,
    fontWeight: '900',
  },
  powerButton: {
    alignItems: 'center',
    backgroundColor: '#f1f5f9',
    borderRadius: 20,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  powerButtonActive: {
    backgroundColor: '#37a7f5',
  },
  powerText: {
    color: '#475569',
    fontSize: 12,
    fontWeight: '900',
  },
  powerTextActive: {
    color: '#ffffff',
  },
  name: {
    color: '#111827',
    fontSize: 18,
    fontWeight: '800',
    marginTop: 28,
  },
  meta: {
    color: '#7c8794',
    fontSize: 13,
    fontWeight: '600',
    marginTop: 5,
  },
  autoBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#0f766e',
    borderRadius: 6,
    marginTop: 10,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  autoBadgeText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '900',
  },
  nextSprayBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#e0f2fe',
    borderColor: '#38bdf8',
    borderRadius: 6,
    borderWidth: 1,
    marginTop: 8,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  nextSprayText: {
    color: '#075985',
    fontSize: 11,
    fontWeight: '900',
  },
  signals: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
  signalText: {
    color: '#475569',
    fontSize: 11,
    fontWeight: '800',
  },
});

export default DeviceCard;
