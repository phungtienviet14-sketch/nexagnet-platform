import { Button } from '../../../ui/Button';
import { Notice } from '../../../ui/Notice';
import { Sheet } from '../../../ui/Sheet';
import { Text } from '../../../ui/Text';
import type { CaptureChoice } from '../../../capture/use-capture';

/**
 * BA LUA CHON THAT THA cho mot to chung tu. Ghi RO nguon: anh "từ thư viện" duoc may chu danh dau
 * khac anh vua chup, va lai xe can biet dieu do TRUOC khi chon.
 */
export function CaptureChoiceSheet({
  visible,
  title,
  busy,
  failure,
  hint,
  allowPdf = true,
  onClose,
  onChoose,
}: {
  readonly visible: boolean;
  readonly title: string;
  readonly busy: boolean;
  readonly failure: string | null;
  readonly hint?: string;
  readonly allowPdf?: boolean;
  readonly onClose: () => void;
  readonly onChoose: (choice: CaptureChoice) => void;
}) {
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={title}
      subtitle={hint ?? 'Chụp rõ cả tờ giấy, đủ chữ ký và con số.'}
      footer={<Button kind="ghost" label="Huỷ" onPress={onClose} disabled={busy} />}
    >
      {failure ? <Notice tone="danger" icon="alert-circle-outline" title={failure} /> : null}
      <Button
        kind="primary"
        size="hero"
        label="Chụp ảnh"
        icon="camera"
        loading={busy}
        hint="Mở máy ảnh trong ứng dụng"
        onPress={() => onChoose('CAMERA')}
        testID="capture-camera"
      />
      <Button
        kind="secondary"
        label="Chọn từ thư viện"
        icon="image-multiple-outline"
        disabled={busy}
        hint="Ảnh sẽ được ghi là từ thư viện"
        onPress={() => onChoose('LIBRARY')}
        testID="capture-gallery"
      />
      <Text variant="caption" tone="faint">
        Ảnh chọn từ thư viện được ghi rõ là “từ thư viện” — văn phòng thấy khác ảnh vừa chụp.
      </Text>
      {allowPdf ? (
        <Button
          kind="secondary"
          label="Chọn tệp PDF"
          icon="file-pdf-box"
          disabled={busy}
          onPress={() => onChoose('PDF')}
          testID="capture-file"
        />
      ) : null}
    </Sheet>
  );
}
