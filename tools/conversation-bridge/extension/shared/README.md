# `extension/shared/` — ma chay o CA HAI phia

Cac tep trong thu muc nay chay **khong doi mot ky tu** o hai runtime khac nhau:

- trong **service worker cua tien ich Chrome** (ESM, khong co `node:` builtin, khong co `node_modules`);
- trong **native host Node** va trong bo kiem — qua duong dan tuong doi `../extension/shared/*.js`.

Vi the chung nam **trong goc cua tien ich**, va phia Node import **vao** day — chu khong nguoc lai.
Huong import trong nhu nguoc, nen day la ly do:

Goc cua tien ich Chrome la thu muc chua `manifest.json`. Mot tep nam ngoai goc do thi service
worker **khong nap duoc**. Neu de ban goc o `protocol/` roi chep mot ban vao `extension/`, ta co
hai ban cua cung mot ban mau tin nhan — va chung se troi khoi nhau, im lang, dung kieu ma khong
cong nao bat duoc. Mot ban duy nhat, dat o cho rang buoc hon, la danh doi dung.

**Rang buoc cua thu muc nay** (co bai kiem hop dong khoa lai):

- khong `import` bat ky `node:` builtin nao;
- khong `import` bat ky package nao trong `node_modules` (ke ca `@netviet/autopilot-protocol` —
  no keo `ajv`, va tien ich khong duoc mang mot bo kiem JSON Schema vao trinh duyet);
- khong `require`, khong duong dan tuyet doi.

Phan phu thuoc vao Giao thuc V0 nam o `protocol/*.mjs` — **chi phia Node**.
