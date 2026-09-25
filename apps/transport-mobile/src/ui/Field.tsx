import { forwardRef, useState } from 'react';
import { StyleSheet, TextInput, View, type TextInputProps } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { RADIUS, SPACE, TOUCH } from '../theme/tokens';
import { FONT } from '../theme/typography';
import { Text } from './Text';

export interface FieldProps extends TextInputProps {
  readonly label: string;
  readonly hint?: string;
  readonly error?: string | null;
  readonly suffix?: string;
}

/** O nhap co nhan PHIA TREN (khong dung placeholder lam nhan — mat khi go). */
export const Field = forwardRef<TextInput, FieldProps>(function Field(
  { label, hint, error, suffix, style, onFocus, onBlur, ...rest },
  ref,
) {
  const { color } = useTheme();
  const [focused, setFocused] = useState(false);
  const border = error ? color.danger : focused ? color.brand : color.lineStrong;
  return (
    <View style={styles.wrap}>
      <Text variant="label" tone="muted">
        {label}
      </Text>
      <View style={[styles.box, { borderColor: border, backgroundColor: color.surfaceRaised }]}>
        <TextInput
          ref={ref}
          placeholderTextColor={color.inkFaint}
          accessibilityLabel={label}
          accessibilityHint={hint}
          onFocus={(event) => {
            setFocused(true);
            onFocus?.(event);
          }}
          onBlur={(event) => {
            setFocused(false);
            onBlur?.(event);
          }}
          style={[styles.input, { color: color.ink }, style]}
          {...rest}
        />
        {suffix ? (
          <Text variant="label" tone="muted">
            {suffix}
          </Text>
        ) : null}
      </View>
      {error ? (
        <Text variant="caption" tone="danger" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : hint ? (
        <Text variant="caption" tone="faint">
          {hint}
        </Text>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: { gap: SPACE.xs },
  box: {
    minHeight: TOUCH.min,
    borderWidth: 1.5,
    borderRadius: RADIUS.control,
    paddingHorizontal: SPACE.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.sm,
  },
  input: { flex: 1, fontFamily: FONT.medium, fontSize: 17, paddingVertical: SPACE.md },
});
