'use client';

import { useMemo, useState } from 'react';
import {
  PRICE_PERIOD_KIND_LABELS,
  classifyPricePeriod,
  planPricePeriod,
  pricePeriodPurposeOptions,
  type PricePeriodPlan,
  type PricePeriodPurpose,
} from '../../lib/price-period-view';
import { formatMonth } from '../../lib/settings-overview';
import type { PricePeriod } from '../../lib/settings';
import { SettingsPanelState } from './SettingsPanelState';

/**
 * Luong TAO bang gia co dan duong.
 *
 * Ban cu bay ba nut ten gan giong nhau canh nhau — `Sao chép kỳ này sang nháp mới`, `Tạo kỳ trống`
 * va `⚡ Khởi tạo nhanh … từ kỳ trước` — cong mot o tick "chỉ để test" nam roi o cho khac. Bam
 * nham mot cai la ra mot loai ky khac han y dinh, va do dung la chuyen da xay ra ngay 01/09/2026
 * (Issue #114): bang gia thang 7 thanh bang gia chinh thuc thang 9.
 *
 * O day nguoi dung chon MUC DICH truoc, doc he qua cua muc dich do, roi moi den thang va nguon.
 * `planPricePeriod()` la cho duy nhat dich muc dich ra loi goi API, nen khong con duong nao de mot
 * ky "chi de chay thu" lo tro thanh ky chinh thuc.
 */

type Props = {
  currentMonth: string;
  periods: readonly PricePeriod[];
  dataClassificationTest: boolean;
  pending: boolean;
  error?: string;
  onCancel: () => void;
  /** Doi buoc la mot CHUYEN TIEP — man cha dua con tro toi tieu de cua buoc moi. */
  onStepChange?: () => void;
  onSubmit: (plan: PricePeriodPlan) => void;
};

type Step = 'purpose' | 'details' | 'review';

const STEP_LABELS: readonly { step: Step; label: string }[] = [
  { step: 'purpose', label: 'Mục đích' },
  { step: 'details', label: 'Tháng & nguồn' },
  { step: 'review', label: 'Xem lại' },
];

/** Tieu de cua tung buoc — cai nguoi dung doc, khong phai nhan ngan tren thanh tien do. */
const STEP_TITLES: Readonly<Record<Step, string>> = {
  purpose: 'Bảng giá này dùng để làm gì?',
  details: 'Áp dụng cho tháng nào?',
  review: 'Xem lại trước khi tạo bản nháp',
};

export function PricePeriodWizard({
  currentMonth,
  periods,
  dataClassificationTest,
  pending,
  error,
  onCancel,
  onStepChange,
  onSubmit,
}: Props) {
  const [step, setStep] = useState<Step>('purpose');
  const [purpose, setPurpose] = useState<PricePeriodPurpose>('official');
  const [validMonth, setValidMonth] = useState(currentMonth);
  const [sourcePeriodId, setSourcePeriodId] = useState('');

  const copyableSources = useMemo(
    () => periods.filter((period) => period.prices.length > 0),
    [periods],
  );
  const options = pricePeriodPurposeOptions({
    dataClassificationTest,
    hasPeriodToCopy: copyableSources.length > 0,
  });
  const selectedOption = options.find((option) => option.purpose === purpose);
  const needsSource = purpose === 'copy-previous';
  const detailsComplete = Boolean(validMonth) && (!needsSource || Boolean(sourcePeriodId));

  /** Mot cho duy nhat doi buoc, nen khong co duong nao doi buoc ma quen bao cho man cha. */
  const goToStep = (next: Step) => {
    setStep(next);
    onStepChange?.();
  };

  const submit = () => {
    if (!detailsComplete) return;
    onSubmit(
      planPricePeriod({
        purpose,
        validMonth,
        ...(needsSource ? { sourcePeriodId } : {}),
      }),
    );
  };

  return (
    <section
      className="settings-wizard"
      aria-labelledby="settings-wizard-title"
      data-price-dominant="true"
      data-wizard-step={step}
    >
      <div className="settings-wizard__head">
        <h3 id="settings-wizard-title">Tạo bảng giá</h3>
        <ol className="settings-wizard__steps">
          {STEP_LABELS.map((entry, index) => (
            <li
              key={entry.step}
              className="settings-wizard__step"
              aria-current={entry.step === step ? 'step' : undefined}
              data-state={
                STEP_LABELS.findIndex((candidate) => candidate.step === step) > index
                  ? 'done'
                  : entry.step === step
                    ? 'current'
                    : 'todo'
              }
            >
              <span aria-hidden="true">{index + 1}</span>
              {entry.label}
            </li>
          ))}
        </ol>
      </div>

      {/* Tieu de cua BUOC — day la thu con tro nhay toi khi mo trinh tao va khi doi buoc, va cung
          la thu tra loi "tôi đang ở bước nào" ma khong phai doc thanh tien do (#144 §2). */}
      <h4
        className="settings-wizard__step-title"
        id="settings-wizard-step-title"
        tabIndex={-1}
        data-price-focus-target="true"
      >
        {STEP_TITLES[step]}
      </h4>

      {step === 'purpose' && (
        <div
          className="settings-wizard__body"
          role="radiogroup"
          aria-labelledby="settings-wizard-step-title"
        >
          {options.map((option) => (
            <label
              key={option.purpose}
              className="settings-choice"
              data-disabled={option.available ? undefined : 'true'}
            >
              <input
                type="radio"
                name="price-period-purpose"
                value={option.purpose}
                checked={purpose === option.purpose}
                disabled={!option.available}
                onChange={() => setPurpose(option.purpose)}
              />
              <span>
                <strong>{option.label}</strong>
                <small>{option.summary}</small>
                <small className="settings-choice__consequence">{option.consequence}</small>
                {!option.available && option.unavailableReason && (
                  <small className="settings-choice__blocked">{option.unavailableReason}</small>
                )}
              </span>
            </label>
          ))}
        </div>
      )}

      {step === 'details' && (
        <div className="settings-wizard__body">
          <label className="settings-field">
            <span>Tháng áp dụng</span>
            <input
              type="month"
              value={validMonth}
              onChange={(event) => setValidMonth(event.target.value)}
            />
          </label>
          {needsSource && (
            <label className="settings-field">
              <span>Chép giá từ kỳ nào?</span>
              <select
                value={sourcePeriodId}
                onChange={(event) => setSourcePeriodId(event.target.value)}
              >
                <option value="">— Chọn một kỳ giá —</option>
                {copyableSources.map((period) => (
                  <option key={period.id} value={period.id}>
                    {formatMonth(period.validMonth ?? '')} ·{' '}
                    {PRICE_PERIOD_KIND_LABELS[classifyPricePeriod(period, currentMonth)]} ·{' '}
                    {period.prices.length} mặt hàng
                  </option>
                ))}
              </select>
            </label>
          )}
          {needsSource && (
            <SettingsPanelState
              tone="neutral"
              title="Chép xong vẫn phải sửa lại giá"
              detail="Giá của kỳ cũ không tự nhiên đúng cho tháng mới. Chỉ kích hoạt sau khi đã đối chiếu với văn bản giá mới của công ty."
            />
          )}
        </div>
      )}

      {step === 'review' && selectedOption && (
        <div className="settings-wizard__body">
          <dl className="settings-dialog__facts">
            <dt>Loại bảng giá</dt>
            <dd>{selectedOption.label}</dd>
            <dt>Áp dụng cho</dt>
            <dd>{formatMonth(validMonth)}</dd>
            {needsSource && (
              <>
                <dt>Chép từ</dt>
                <dd>
                  {formatMonth(
                    copyableSources.find((period) => period.id === sourcePeriodId)?.validMonth ??
                      '',
                  )}
                </dd>
              </>
            )}
            <dt>Sau khi tạo</dt>
            <dd>
              Bảng giá được tạo ở dạng <b>bản nháp</b>. Chưa có gì thay đổi với đơn hàng cho tới khi
              bạn bấm kích hoạt ở bước cuối.
            </dd>
          </dl>
          {purpose === 'test-only' && (
            <SettingsPanelState
              tone="warning"
              title="Đây là bảng giá chỉ để chạy thử"
              detail="Chỉ được 1–2 mặt hàng. Hệ thống vẫn báo là còn thiếu bảng giá chính thức cho tháng này, và cổng “đủ điều kiện chạy thật” vẫn đỏ."
            />
          )}
        </div>
      )}

      {error && <SettingsPanelState tone="error" title="Không tạo được bảng giá" detail={error} />}

      <div className="settings-wizard__actions">
        <button
          type="button"
          className="settings-button settings-button--quiet"
          disabled={pending}
          onClick={() => (step === 'purpose' ? onCancel() : goToStep(previousStep(step)))}
        >
          {step === 'purpose' ? 'Hủy' : 'Quay lại'}
        </button>
        {step === 'review' ? (
          <button
            type="button"
            className="settings-button settings-button--primary"
            data-price-primary="true"
            disabled={pending || !detailsComplete}
            onClick={submit}
          >
            {pending ? 'Đang tạo…' : 'Tạo bản nháp'}
          </button>
        ) : (
          <button
            type="button"
            className="settings-button settings-button--primary"
            data-price-primary="true"
            disabled={
              pending ||
              (step === 'purpose' && !selectedOption?.available) ||
              (step === 'details' && !detailsComplete)
            }
            onClick={() => goToStep(nextStep(step))}
          >
            Tiếp tục
          </button>
        )}
      </div>
    </section>
  );
}

function nextStep(step: Step): Step {
  return step === 'purpose' ? 'details' : 'review';
}

function previousStep(step: Step): Step {
  return step === 'review' ? 'details' : 'purpose';
}
