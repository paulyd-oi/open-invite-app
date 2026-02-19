package com.vibecode.openinvite.x0qi5wk

import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Context
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.Promise

/**
 * WidgetBridgeModule — React Native → Android native bridge
 *
 * Exposes two methods to JS:
 *   setTodayWidgetPayload(jsonString) — writes to SharedPreferences
 *   reloadTodayWidget()              — triggers AppWidgetManager update
 *
 * Registered as "WidgetBridge" in NativeModules.
 */
class WidgetBridgeModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    companion object {
        private const val PREFS_NAME = "openinvite_widget_store"
        private const val PAYLOAD_KEY = "todayWidgetPayload_v1"
    }

    override fun getName(): String = "WidgetBridge"

    @ReactMethod
    fun setTodayWidgetPayload(jsonString: String, promise: Promise) {
        try {
            val prefs = reactApplicationContext.getSharedPreferences(
                PREFS_NAME, Context.MODE_PRIVATE
            )
            prefs.edit().putString(PAYLOAD_KEY, jsonString).apply()
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("ERR_PREFS", "Failed to write widget payload", e)
        }
    }

    @ReactMethod
    fun reloadTodayWidget(promise: Promise) {
        try {
            val context = reactApplicationContext
            val appWidgetManager = AppWidgetManager.getInstance(context)
            val widgetComponent = ComponentName(context, TodayWidgetProvider::class.java)
            val widgetIds = appWidgetManager.getAppWidgetIds(widgetComponent)

            if (widgetIds.isNotEmpty()) {
                val intent = android.content.Intent(context, TodayWidgetProvider::class.java).apply {
                    action = AppWidgetManager.ACTION_APPWIDGET_UPDATE
                    putExtra(AppWidgetManager.EXTRA_APPWIDGET_IDS, widgetIds)
                }
                context.sendBroadcast(intent)
            }
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("ERR_WIDGET", "Failed to reload widget", e)
        }
    }
}
