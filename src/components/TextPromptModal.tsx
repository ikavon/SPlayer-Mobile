/**
 * 通用文本输入弹窗：用于新建/重命名歌单。
 * 透明遮罩 + 居中卡片，autoFocus，空文本不触发 onConfirm；点遮罩或取消关闭。
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useTheme, type Palette } from '../theme';

export default function TextPromptModal({
  visible,
  title,
  placeholder,
  initialValue = '',
  confirmText = '确定',
  onConfirm,
  onCancel,
}: {
  visible: boolean;
  title: string;
  placeholder?: string;
  initialValue?: string;
  confirmText?: string;
  onConfirm: (text: string) => void;
  onCancel: () => void;
}) {
  const t = useTheme();
  const s = useMemo(() => useStyles(t), [t]);
  const [value, setValue] = useState(initialValue);
  const inputRef = useRef<TextInput>(null);

  // 每次打开重置为 initialValue 并聚焦
  useEffect(() => {
    if (visible) {
      setValue(initialValue);
      const t = setTimeout(() => inputRef.current?.focus(), 60);
      return () => clearTimeout(t);
    }
  }, [visible, initialValue]);

  const submit = () => {
    const v = value.trim();
    if (!v) return;
    onConfirm(v);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable style={s.overlay} onPress={onCancel}>
        <Pressable style={s.card} onPress={(e) => e.stopPropagation()}>
          <Text style={s.title}>{title}</Text>
          <TextInput
            ref={inputRef}
            style={s.input}
            value={value}
            onChangeText={setValue}
            placeholder={placeholder}
            placeholderTextColor={t.text4}
            onSubmitEditing={submit}
            returnKeyType="done"
            maxLength={40}
          />
          <View style={s.btns}>
            <Pressable style={s.btn} onPress={onCancel} hitSlop={6}>
              <Text style={s.cancelText}>取消</Text>
            </Pressable>
            <Pressable style={[s.btn, s.confirmBtn]} onPress={submit} hitSlop={6}>
              <Text style={s.confirmText}>{confirmText}</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const useStyles = (t: Palette) =>
  StyleSheet.create({
    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center' },
    card: { width: '80%', backgroundColor: t.bg, borderRadius: 14, padding: 20 },
    title: { fontSize: 16, fontWeight: '700', color: t.text, marginBottom: 14, textAlign: 'center' },
    input: {
      borderWidth: 1,
      borderColor: t.border,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 14,
      color: t.text,
      marginBottom: 16,
    },
    btns: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
    btn: { paddingVertical: 8, paddingHorizontal: 16, borderRadius: 8 },
    confirmBtn: { backgroundColor: t.accent },
    cancelText: { fontSize: 14, color: t.text3 },
    confirmText: { fontSize: 14, color: '#fff', fontWeight: '700' },
  });
