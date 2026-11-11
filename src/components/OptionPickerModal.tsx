/**
 * 通用单选弹窗：从一组选项中选一项（Alert action sheet 在 Android 仅支持 3 按钮，
 * 选项多时改用此 Modal 避免截断）。
 */
import { useMemo } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTheme, type Palette } from '../theme';

export default function OptionPickerModal<T extends string | number>({
  visible,
  title,
  options,
  currentValue,
  onPick,
  onCancel,
}: {
  visible: boolean;
  title: string;
  options: T[];
  currentValue?: T;
  onPick: (value: T) => void;
  onCancel: () => void;
}) {
  const t = useTheme();
  const s = useMemo(() => useStyles(t), [t]);
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable style={s.overlay} onPress={onCancel}>
        <Pressable style={s.card} onPress={(e) => e.stopPropagation()}>
          <Text style={s.title}>{title}</Text>
          <ScrollView style={{ maxHeight: 320 }}>
            {options.map((opt) => {
              const active = opt === currentValue;
              return (
                <Pressable
                  key={String(opt)}
                  style={[s.option, active && s.optionActive]}
                  onPress={() => onPick(opt)}
                >
                  <Text style={[s.optionText, active && s.optionTextActive]}>
                    {String(opt)}{active ? '  ✓' : ''}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
          <Pressable style={s.cancelBtn} onPress={onCancel} hitSlop={6}>
            <Text style={s.cancelText}>取消</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const useStyles = (t: Palette) =>
  StyleSheet.create({
    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center' },
    card: { width: '76%', backgroundColor: t.bg, borderRadius: 14, padding: 16, maxHeight: '70%' },
    title: { fontSize: 15, fontWeight: '700', color: t.text, marginBottom: 10, textAlign: 'center' },
    option: {
      paddingVertical: 13,
      paddingHorizontal: 12,
      borderRadius: 10,
      alignItems: 'center',
    },
    optionActive: { backgroundColor: `${t.accent}1a` },
    optionText: { fontSize: 15, color: t.text },
    optionTextActive: { color: t.accent, fontWeight: '700' },
    cancelBtn: { marginTop: 8, paddingVertical: 12, alignItems: 'center', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.border },
    cancelText: { fontSize: 15, color: t.text3 },
  });
