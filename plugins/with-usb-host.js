const { withAndroidManifest } = require('@expo/config-plugins');

module.exports = function withUsbHost(config) {
  return withAndroidManifest(config, (modConfig) => {
    const manifest = modConfig.modResults.manifest;
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
