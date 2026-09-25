/* eslint-disable @typescript-eslint/no-require-imports -- Expo nap config plugin bang require() (CommonJS), day la hop dong cua prebuild chu khong phai lua chon */
const fs = require('node:fs');
const path = require('node:path');
const { AndroidConfig, withAndroidManifest, withDangerousMod } = require('expo/config-plugins');

/**
 * CONG HTTP TRAN CHI CHO BAN KIEM THU E2E — va chi toi may chu cua chinh may dung CI.
 *
 * Tren may ao Android, `10.0.2.2` la loopback cua may chu (runner GitHub), noi API kiem thu chay
 * bang HTTP tran. Ban phat hanh (targetSdk 36) cam HTTP tran theo mac dinh — dung — nen ban e2e
 * phai MO RIENG hai ten may: `10.0.2.2` va `localhost`. Khong mo `base-config`, khong mo mien nao
 * khac: neu ban nay lot ra ngoai, no van khong gui mat khau qua HTTP toi bat ky may chu that nao.
 *
 * Chi bat khi `APP_E2E_CLEARTEXT=on` luc prebuild. app.config.ts tu choi `on` voi bien the
 * `production`, va plugin kiem LAI dieu do — hai lop, vi day la thu duy nhat trong bo cau hinh ma
 * lot vao ban cua hang la mot lo hong chu khong phai mot loi hien thi.
 *
 * Phan JS di cung: `extra.allowInsecureLocal` (app.config.ts) cho `normalizeServerUrl` nhan
 * `http://10.0.2.2:3001`. Mot nua nay ma thieu nua kia thi ung dung hoac tu choi dia chi, hoac bi
 * he dieu hanh chan ket noi — ca hai deu ra dung mot man "khong ket noi duoc".
 */

const CONFIG_NAME = 'nexagent_e2e_network_security';
const HOSTS = ['10.0.2.2', 'localhost'];

function e2eCleartextRequested(env) {
  const raw = env.APP_E2E_CLEARTEXT ?? 'off';
  if (raw !== 'on' && raw !== 'off') {
    throw new Error(`[with-android-e2e-cleartext] APP_E2E_CLEARTEXT phai la on|off: ${raw}`);
  }
  if (raw === 'on' && env.APP_VARIANT === 'production') {
    throw new Error(
      '[with-android-e2e-cleartext] Tu choi: APP_E2E_CLEARTEXT=on voi APP_VARIANT=production.',
    );
  }
  return raw === 'on';
}

function networkSecurityXml() {
  const domains = HOSTS.map(
    (host) => `        <domain includeSubdomains="false">${host}</domain>`,
  ).join('\n');
  return `<?xml version="1.0" encoding="utf-8"?>
<!-- Sinh boi plugins/with-android-e2e-cleartext.js — CHI ban kiem thu e2e (APP_E2E_CLEARTEXT=on). -->
<network-security-config>
    <base-config cleartextTrafficPermitted="false" />
    <domain-config cleartextTrafficPermitted="true">
${domains}
    </domain-config>
</network-security-config>
`;
}

const withAndroidE2eCleartext = (config) => {
  if (!e2eCleartextRequested(process.env)) return config;

  const withFile = withDangerousMod(config, [
    'android',
    async (modConfig) => {
      const xmlDir = path.join(
        modConfig.modRequest.platformProjectRoot,
        'app',
        'src',
        'main',
        'res',
        'xml',
      );
      await fs.promises.mkdir(xmlDir, { recursive: true });
      await fs.promises.writeFile(path.join(xmlDir, `${CONFIG_NAME}.xml`), networkSecurityXml());
      return modConfig;
    },
  ]);

  return withAndroidManifest(withFile, (manifestConfig) => {
    const application = AndroidConfig.Manifest.getMainApplicationOrThrow(manifestConfig.modResults);
    application.$['android:networkSecurityConfig'] = `@xml/${CONFIG_NAME}`;
    return manifestConfig;
  });
};

module.exports = withAndroidE2eCleartext;
module.exports.e2eCleartextRequested = e2eCleartextRequested;
module.exports.HOSTS = HOSTS;
