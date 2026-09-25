/* eslint-disable @typescript-eslint/no-require-imports -- Expo nap config plugin bang require() (CommonJS), day la hop dong cua prebuild chu khong phai lua chon */
const { AndroidConfig, withAndroidManifest } = require('expo/config-plugins');

/**
 * DICH VU TIEN CANH BAM VI TRI — co trong ban dung KHI VA CHI KHI `APP_BACKGROUND_LOCATION=on`.
 *
 * `expo-location` khai san trong manifest THU VIEN cua no mot
 * `<service .services.LocationTaskService android:foregroundServiceType="location">`, bat ke ung
 * dung co bat bam vi tri nen hay khong. Manifest merger cua Gradle se gop no vao APK/AAB cuoi. Voi
 * Google Play (targetSdk >= 34), mot service kieu `location` trong ban tai len la thu keo theo
 * phan khai bao dich vu tien canh + video minh hoa (M-01, docs/kien-truc/transport-driver-app.md).
 *
 * Nen cong tac phai quyet dinh ca SERVICE chu khong chi quyen:
 *   on  -> khai TUONG MINH service trong manifest cua ung dung (de hop dong prebuild doc duoc, va
 *          de nguoi doc manifest thay no la mot lua chon co chu dich);
 *   off -> `tools:node="remove"`: merger GO service cua thu vien khoi ban cuoi. Ma JS da tra
 *          `NOT_IN_THIS_BUILD` truoc khi dong toi service (src/location/background-task.ts), nen
 *          go no khong lam vo luong nao.
 */

const SERVICE = 'expo.modules.location.services.LocationTaskService';

function upsertService(application, service) {
  const services = (application.service ?? []).filter(
    (entry) => entry.$['android:name'] !== SERVICE,
  );
  application.service = [...services, service];
}

const withRunTrackingService = (config, props = {}) => {
  const enabled = props.enabled === true;
  return withAndroidManifest(config, (manifestConfig) => {
    const manifest = AndroidConfig.Manifest.ensureToolsAvailable(manifestConfig.modResults);
    const application = AndroidConfig.Manifest.getMainApplicationOrThrow(manifest);
    upsertService(
      application,
      enabled
        ? {
            $: {
              'android:name': SERVICE,
              'android:exported': 'false',
              'android:foregroundServiceType': 'location',
            },
          }
        : { $: { 'android:name': SERVICE, 'tools:node': 'remove' } },
    );
    manifestConfig.modResults = manifest;
    return manifestConfig;
  });
};

module.exports = withRunTrackingService;
module.exports.SERVICE = SERVICE;
