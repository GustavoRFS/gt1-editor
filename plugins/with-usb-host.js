const { withAndroidManifest } = require('@expo/config-plugins');

module.exports = function withUsbHost(config) {
  return withAndroidManifest(config, (modConfig) => {
    const manifest = modConfig.modResults.manifest;
    const permissions = manifest['uses-permission'] ?? [];
    for (const permission of ['android.permission.CAMERA', 'android.permission.RECORD_AUDIO']) {
      if (!permissions.some((entry) => entry.$?.['android:name'] === permission)) permissions.push({ $: { 'android:name': permission } });
    }
    manifest['uses-permission'] = permissions;
    const application = manifest.application?.[0];
    if (application) application.$['android:usesCleartextTraffic'] = 'true';
    const features = manifest['uses-feature'] ?? [];
    const hasUsbHost = features.some((feature) => feature.$?.['android:name'] === 'android.hardware.usb.host');
    if (!hasUsbHost) {
      features.push({
        $: {
          'android:name': 'android.hardware.usb.host',
          'android:required': 'false',
        },
      });
    }
    manifest['uses-feature'] = features;
    return modConfig;
  });
};
