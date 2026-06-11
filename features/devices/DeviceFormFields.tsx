import React from 'react';
import {StyleSheet, Switch, Text, TextInput, View} from 'react-native';
import {triggerToggleHaptic} from './HapticPressable';

type ControlRowProps = {
  title: string;
  description: string;
  value: boolean;
  onValueChange: () => void;
  disabled?: boolean;
};

export function ControlRow({
  title,
  description,
  value,
  onValueChange,
  disabled = false,
}: ControlRowProps) {
  const handleValueChange = (nextValue: boolean) => {
    triggerToggleHaptic(nextValue);
    onValueChange();
  };

  return (
    <View style={[styles.controlRow, disabled && styles.controlRowDisabled]}>
      <View style={styles.controlCopy}>
        <Text style={styles.controlTitle}>{title}</Text>
        <Text style={styles.controlDescription}>{description}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={handleValueChange}
        disabled={disabled}
      />
    </View>
  );
}

type LabeledInputProps = {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder: string;
  secureTextEntry?: boolean;
};

export function LabeledInput({
  label,
  value,
  onChangeText,
  placeholder,
  secureTextEntry,
}: LabeledInputProps) {
  return (
    <View style={styles.inputGroup}>
      <Text style={styles.inputLabel}>{label}</Text>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#94a3b8"
        secureTextEntry={secureTextEntry}
        autoCapitalize="none"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  controlRow: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 12,
    padding: 16,
  },
  controlRowDisabled: {
    opacity: 0.55,
  },
  controlCopy: {
    flex: 1,
    paddingRight: 12,
  },
  controlTitle: {
    color: '#111827',
    fontSize: 17,
    fontWeight: '700',
  },
  controlDescription: {
    color: '#64748b',
    fontSize: 13,
    lineHeight: 19,
    marginTop: 4,
  },
  inputGroup: {
    marginBottom: 16,
  },
  inputLabel: {
    color: '#334155',
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#ffffff',
    borderColor: '#e2e8f0',
    borderRadius: 8,
    borderWidth: 1,
    color: '#111827',
    fontSize: 16,
    minHeight: 52,
    paddingHorizontal: 14,
  },
});
