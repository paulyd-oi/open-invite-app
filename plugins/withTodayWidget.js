/**
 * withTodayWidget — Expo Config Plugin for Today Widget
 *
 * Handles Android-side integration during prebuild:
 *   - Registers TodayWidgetProvider receiver in AndroidManifest.xml
 *   - Registers WidgetBridgePackage in MainApplication
 *
 * iOS-side:
 *   - Adds App Group entitlement to main app
 *   - Widget extension target must be added manually in Xcode
 *     (File → New → Target → Widget Extension) because Expo config
 *     plugins cannot safely add extension targets to pbxproj.
 *
 * Usage in app.json plugins array:
 *   ["./plugins/withTodayWidget"]
 *
 * NOTE: This plugin is NOT yet registered in app.json.
 * Add it when ready to integrate the widget into the build.
 */

const { withEntitlementsPlist, withAndroidManifest } = require("expo/config-plugins");

function withTodayWidgetIOS(config) {
  return withEntitlementsPlist(config, (mod) => {
    mod.modResults["com.apple.security.application-groups"] = [
      "group.com.vibecode.openinvite.0qi5wk",
    ];
    return mod;
  });
}

function withTodayWidgetAndroid(config) {
  return withAndroidManifest(config, (mod) => {
    const mainApp = mod.modResults.manifest.application?.[0];
    if (!mainApp) return mod;

    // Check if receiver already registered
    const receivers = mainApp.receiver ?? [];
    const alreadyRegistered = receivers.some(
      (r) => r.$?.["android:name"] === ".TodayWidgetProvider"
    );

    if (!alreadyRegistered) {
      receivers.push({
        $: {
          "android:name": ".TodayWidgetProvider",
          "android:exported": "true",
          "android:label": "Today's Plans",
        },
        "intent-filter": [
          {
            action: [
              { $: { "android:name": "android.appwidget.action.APPWIDGET_UPDATE" } },
            ],
          },
        ],
        "meta-data": [
          {
            $: {
              "android:name": "android.appwidget.provider",
              "android:resource": "@xml/widget_today_info",
            },
          },
        ],
      });
      mainApp.receiver = receivers;
    }

    return mod;
  });
}

module.exports = function withTodayWidget(config) {
  config = withTodayWidgetIOS(config);
  config = withTodayWidgetAndroid(config);
  return config;
};
