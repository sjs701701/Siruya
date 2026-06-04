import React, {useMemo, useState} from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import AddDeviceModal from '../features/devices/AddDeviceModal';
import DeviceCard from '../features/devices/DeviceCard';
import {sendDeviceCommand} from '../features/devices/deviceCommands';
import DeviceDetailModal from '../features/devices/DeviceDetailModal';
import {getProductDefinition} from '../features/devices/deviceRegistry';
import {Device} from '../features/devices/types';
import {useDevices} from '../features/devices/useDevices';

function MainTab() {
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [pendingPowerDeviceId, setPendingPowerDeviceId] = useState<
    string | null
  >(null);
  const {
    devices,
    selectedDevice,
    onlineCount,
    addDevice,
    updateDevice,
    removeDevice,
    setSelectedDevice,
  } = useDevices();

  const groupedDevices = useMemo(() => {
    return devices.reduce<Record<string, Device[]>>((groups, device) => {
      const product = getProductDefinition(device.type);
      const key = product.sectionLabel;
      groups[key] = [...(groups[key] ?? []), device];
      return groups;
    }, {});
  }, [devices]);

  const toggleDevicePower = async (device: Device) => {
    if (pendingPowerDeviceId) {
      return;
    }

    const nextValue = !device.controls.running;
    setPendingPowerDeviceId(device.id);

    try {
      await sendDeviceCommand({
        device,
        command: 'running',
        value: nextValue,
      });
      updateDevice(device.id, current => ({
        ...current,
        status: 'online',
        controls: {
          ...current.controls,
          running: nextValue,
        },
      }));
    } catch {
      Alert.alert(
        '명령 전송 실패',
        '기기에 전원 명령을 보내지 못했습니다. 장치 IP와 Wi-Fi 연결을 확인해주세요.',
      );
      updateDevice(device.id, current => ({
        ...current,
        status: 'offline',
      }));
    } finally {
      setPendingPowerDeviceId(null);
    }
  };

  return (
    <SafeAreaView edges={['top', 'bottom']} style={styles.screen}>
      <StatusBar barStyle="dark-content" backgroundColor="#eef7ff" />
      <View style={styles.header}>
        <View>
          <Text style={styles.homeLabel}>시루야</Text>
          <Text style={styles.headerSub}>
            연결됨 {onlineCount}대 · 전체 {devices.length}대
          </Text>
        </View>
        <View style={styles.headerActions}>
          <Pressable
            accessibilityLabel="알림"
            style={styles.iconButton}
            onPress={() => Alert.alert('알림', '새 알림이 없습니다.')}>
            <Text style={styles.iconButtonText}>!</Text>
          </Pressable>
          <Pressable
            accessibilityLabel="장치 추가"
            style={[styles.iconButton, styles.addButton]}
            onPress={() => setIsAddOpen(true)}>
            <Text style={[styles.iconButtonText, styles.addButtonText]}>+</Text>
          </Pressable>
        </View>
      </View>

      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentInner}
        showsVerticalScrollIndicator={false}>
        {Object.entries(groupedDevices).map(([section, sectionDevices]) => (
          <View key={section}>
            <Text style={styles.sectionLabel}>{section}</Text>
            <View style={styles.grid}>
              {sectionDevices.map(device => (
                <DeviceCard
                  key={device.id}
                  device={device}
                  onPress={() => setSelectedDevice(device)}
                  onPower={() => toggleDevicePower(device)}
                />
              ))}
            </View>
          </View>
        ))}

        <Text style={styles.sectionLabel}>기기 관리</Text>
        <View style={styles.carePanel}>
          <Text style={styles.careTitle}>청소 모드 안내</Text>
          <Text style={styles.careText}>
            콩나물을 다 키운 뒤 기기를 열고 청소 모드를 실행하면 펌프로
            물을 순환시켜 내부를 세척합니다.
          </Text>
        </View>
      </ScrollView>

      <AddDeviceModal
        visible={isAddOpen}
        onClose={() => setIsAddOpen(false)}
        onAdd={addDevice}
      />
      <DeviceDetailModal
        device={selectedDevice}
        onClose={() => setSelectedDevice(null)}
        onUpdate={updateDevice}
        onRemove={removeDevice}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#eef7ff',
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 22,
    paddingTop: 18,
    paddingBottom: 12,
  },
  homeLabel: {
    color: '#111827',
    fontSize: 24,
    fontWeight: '800',
  },
  headerSub: {
    color: '#64748b',
    fontSize: 13,
    marginTop: 4,
  },
  headerActions: {
    flexDirection: 'row',
    gap: 10,
  },
  iconButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.82)',
    borderRadius: 18,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  addButton: {
    backgroundColor: '#1d9bf0',
  },
  iconButtonText: {
    color: '#111827',
    fontSize: 21,
    fontWeight: '700',
    lineHeight: 24,
  },
  addButtonText: {
    color: '#ffffff',
    fontSize: 25,
  },
  content: {
    flex: 1,
  },
  contentInner: {
    paddingBottom: 30,
    paddingHorizontal: 18,
  },
  sectionLabel: {
    color: '#94a3b8',
    fontSize: 15,
    fontWeight: '800',
    marginBottom: 12,
    marginTop: 26,
    paddingHorizontal: 4,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 14,
  },
  carePanel: {
    backgroundColor: '#ffffff',
    borderRadius: 8,
    padding: 18,
  },
  careTitle: {
    color: '#111827',
    fontSize: 17,
    fontWeight: '800',
  },
  careText: {
    color: '#64748b',
    fontSize: 13,
    lineHeight: 19,
    marginTop: 8,
  },
});

export default MainTab;
