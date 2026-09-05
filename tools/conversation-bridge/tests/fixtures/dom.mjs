/**
 * CAY DOM GIA — nho, va co MIN.
 *
 * Bai kiem quan trong nhat cua nhiem vu nay khong phai "bo noi khung soan co chay khong", ma la
 * "no co BAO GIO cham vao mot cau tra loi khong". Mot bai kiem theo kieu doc ma nguon roi grep chu
 * `assistant` chi chung minh duoc rang chu do khong xuat hien — no khong chung minh duoc hanh vi.
 *
 * Nen cay o day co nhung nut DAT MIN: moi lan doc BAT KY thuoc tinh nao cua chung deu ghi lai vao
 * `touchedTraps` roi NEM. Bai kiem khang dinh `touchedTraps` rong. Neu mot ngay nao do ai do them
 * mot selector rong hon (`div`, `[data-message-author-role]`) hay mot buoc duyet cay, min no.
 *
 * Bo so khop selector o day co that (the, #id, .lop, [thuoc-tinh], hau due) va chay tren BIEU DIEN
 * NOI BO cua cay, khong qua lop boc — nen ban than viec so khop khong bao gio lam no min.
 *
 * KHONG dung jsdom: mot thu vien DOM day du se cung cap `textContent`, `innerHTML`, `children`...
 * tuc la chinh nhung duong ma ta dang muon chung minh la khong ton tai. Be mat hep o day LA bang
 * chung; mot be mat day du se lam bang chung do bien mat.
 */

/**
 * @typedef {object} NodeSpec
 * @property {string} tag
 * @property {Record<string, string>} [attrs]
 * @property {NodeSpec[]} [children]
 * @property {boolean} [contentEditable]
 * @property {string} [value]
 * @property {boolean} [disabled]
 * @property {boolean} [trap] Dat min: moi lan doc thuoc tinh deu bi ghi lai va nem.
 */

/** @param {NodeSpec} spec @param {any} parent */
function toInternal(spec, parent = null) {
  const node = {
    tag: String(spec.tag).toLowerCase(),
    attrs: { ...(spec.attrs ?? {}) },
    contentEditable: spec.contentEditable === true,
    value: spec.value,
    disabled: spec.disabled === true,
    trap: spec.trap === true,
    parent,
    children: /** @type {any[]} */ ([]),
    events: /** @type {string[]} */ ([]),
    clicked: 0,
    focused: 0,
  };
  node.children = (spec.children ?? []).map((child) => toInternal(child, node));
  return node;
}

const COMPOUND =
  /^([a-z0-9-]+)?((?:#[A-Za-z0-9_-]+|\.[A-Za-z0-9_-]+|\[[A-Za-z-]+(?:="[^"]*")?\])*)$/;
const QUALIFIER = /#([A-Za-z0-9_-]+)|\.([A-Za-z0-9_-]+)|\[([A-Za-z-]+)(?:="([^"]*)")?\]/g;

/** @param {string} compound */
function parseCompound(compound) {
  const match = COMPOUND.exec(compound);
  if (match === null) throw new Error(`Selector khong ho tro trong bo gia: ${compound}`);
  const tag = match[1] ?? null;
  /** @type {Array<(n: any) => boolean>} */
  const checks = [];
  for (const q of match[2].matchAll(QUALIFIER)) {
    if (q[1] !== undefined) checks.push((n) => n.attrs.id === q[1]);
    else if (q[2] !== undefined)
      checks.push((n) =>
        String(n.attrs.class ?? '')
          .split(/\s+/)
          .includes(q[2]),
      );
    else if (q[4] !== undefined) checks.push((n) => n.attrs[q[3]] === q[4]);
    else checks.push((n) => q[3] in n.attrs);
  }
  return { tag, checks };
}

/** @param {any} node @param {{ tag: string | null, checks: Array<(n: any) => boolean> }} compound */
const matches = (node, compound) =>
  (compound.tag === null || node.tag === compound.tag) && compound.checks.every((c) => c(node));

/** @param {any} node @param {ReturnType<typeof parseCompound>[]} ancestors */
function hasAncestorChain(node, ancestors) {
  let index = ancestors.length - 1;
  let cursor = node.parent;
  while (cursor !== null && index >= 0) {
    if (matches(cursor, ancestors[index])) index -= 1;
    cursor = cursor.parent;
  }
  return index < 0;
}

/** @param {any} root @param {string} selector */
function selectAll(root, selector) {
  const compounds = selector.trim().split(/\s+/).map(parseCompound);
  const target = compounds[compounds.length - 1];
  const ancestors = compounds.slice(0, -1);
  /** @type {any[]} */
  const found = [];
  const walk = (node) => {
    if (node !== root && matches(node, target) && hasAncestorChain(node, ancestors)) {
      found.push(node);
    }
    for (const child of node.children) walk(child);
  };
  walk(root);
  return found;
}

/**
 * @param {{ html: NodeSpec, href: string }} input
 */
export function buildDom({ html, href }) {
  const root = toInternal(html);
  /** @type {string[]} */
  const touchedTraps = [];
  /** @type {string[]} */
  const selectorsUsed = [];
  /** @type {any} */
  let execCommands = [];

  /** @param {any} node */
  const wrap = (node) => {
    if (node.trap) {
      return new Proxy(
        {},
        {
          get(_target, property) {
            touchedTraps.push(String(property));
            throw new Error(`Da cham vao mot nut cua khoi hoi thoai: ${String(property)}`);
          },
        },
      );
    }
    return {
      get isContentEditable() {
        return node.contentEditable;
      },
      get disabled() {
        return node.disabled;
      },
      get value() {
        return node.value;
      },
      set value(next) {
        node.value = next;
      },
      focus: () => {
        node.focused += 1;
      },
      click: () => {
        node.clicked += 1;
      },
      dispatchEvent: (event) => {
        node.events.push(String(event?.type ?? 'unknown'));
        return true;
      },
      closest: (selector) => {
        selectorsUsed.push(selector);
        const compound = parseCompound(selector);
        let cursor = node.parent;
        while (cursor !== null) {
          if (matches(cursor, compound)) return wrap(cursor);
          cursor = cursor.parent;
        }
        return null;
      },
      querySelectorAll: (selector) => {
        selectorsUsed.push(selector);
        return selectAll(node, selector).map(wrap);
      },
      internal: node,
    };
  };

  const document = {
    querySelectorAll: (selector) => {
      selectorsUsed.push(selector);
      return selectAll(root, selector).map(wrap);
    },
    execCommand: (command, _showUi, value) => {
      execCommands.push({ command, value });
      return true;
    },
  };
  return {
    document,
    location: { href },
    touchedTraps,
    selectorsUsed,
    execCommands: () => execCommands,
    find: (selector) => selectAll(root, selector).map((n) => n),
  };
}

/**
 * Chay mot ham trong ngu canh cua cay gia. Vá `globalThis` chu khong truyen `document` vao ham,
 * vi do dung la cach `chrome.scripting.executeScript` chay no trong trang that.
 * @template T
 * @param {ReturnType<typeof buildDom>} dom
 * @param {() => T} fn
 * @returns {T}
 */
export function withDom(dom, fn) {
  const g = /** @type {any} */ (globalThis);
  const before = { document: g.document, location: g.location, Event: g.Event };
  g.document = dom.document;
  g.location = dom.location;
  g.Event = class {
    constructor(type, init) {
      this.type = type;
      this.bubbles = init?.bubbles === true;
    }
  };
  try {
    return fn();
  } finally {
    g.document = before.document;
    g.location = before.location;
    g.Event = before.Event;
  }
}
