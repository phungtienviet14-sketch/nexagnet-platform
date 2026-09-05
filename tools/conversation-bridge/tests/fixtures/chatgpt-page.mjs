/**
 * Mot trang GIONG ChatGPT, du de bo noi khung soan hong theo dung kieu no se hong ngoai doi.
 *
 * Khoi hoi thoai luon co MIN — ca luot cua nguoi lan luot tra loi. §1.1 cam "quet DOM hoi thoai
 * de lay noi dung", khong chi cam doc phan tra loi, nen ca hai deu la vung cam.
 */
import { buildDom } from './dom.mjs';

/** Mot luot hoi thoai — dat min: cham vao la bai kiem do. */
const turn = (role) => ({
  tag: 'article',
  attrs: { 'data-message-author-role': role, class: 'text-token-text-primary' },
  trap: true,
});

/**
 * @param {{
 *   href?: string,
 *   composer?: 'contenteditable' | 'textarea' | 'none' | 'ambiguous',
 *   submit?: 'testid' | 'submitType' | 'none' | 'ambiguous' | 'disabled',
 *   composerInsideForm?: boolean,
 * }} [options]
 */
export function chatgptPage({
  href = 'https://chatgpt.com/c/6a1f0c9e-2b7d-4f11-9a30-5c8e2d1b4a77',
  composer = 'contenteditable',
  submit = 'testid',
  composerInsideForm = true,
} = {}) {
  const contentEditableComposer = {
    tag: 'div',
    attrs: { id: 'prompt-textarea', contenteditable: 'true', role: 'textbox' },
    contentEditable: true,
  };
  const textareaComposer = {
    tag: 'textarea',
    attrs: { id: 'prompt-textarea', 'data-testid': 'prompt-textarea' },
    value: '',
  };
  const composerNodes =
    composer === 'none'
      ? []
      : composer === 'textarea'
        ? [textareaComposer]
        : composer === 'ambiguous'
          ? [contentEditableComposer, { ...contentEditableComposer }]
          : [contentEditableComposer];

  const sendByTestId = { tag: 'button', attrs: { 'data-testid': 'send-button' } };
  const sendBySubmit = { tag: 'button', attrs: { type: 'submit' } };
  const submitNodes =
    submit === 'none'
      ? []
      : submit === 'submitType'
        ? [sendBySubmit]
        : submit === 'ambiguous'
          ? [sendByTestId, { ...sendByTestId }]
          : submit === 'disabled'
            ? [{ ...sendByTestId, disabled: true }]
            : [sendByTestId];

  const formChildren = composerInsideForm ? [...composerNodes, ...submitNodes] : [...submitNodes];
  const strayComposer = composerInsideForm ? [] : composerNodes;

  return buildDom({
    href,
    html: {
      tag: 'body',
      children: [
        {
          tag: 'main',
          children: [
            {
              tag: 'div',
              attrs: { class: 'conversation' },
              children: [turn('user'), turn('assistant'), turn('user'), turn('assistant')],
            },
            ...strayComposer,
            { tag: 'form', attrs: { class: 'composer-form' }, children: formChildren },
          ],
        },
      ],
    },
  });
}
