package com.vibecode.openinvite.x0qi5wk

import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.app.PendingIntent
import android.net.Uri
import android.widget.RemoteViews
import org.json.JSONObject
import org.json.JSONArray

/**
 * TodayWidgetProvider — Android AppWidget for Today's events.
 *
 * Reads TodayWidgetPayloadV1 from SharedPreferences and renders
 * a RemoteViews-based widget with event rows.
 *
 * Prefs file: openinvite_widget_store
 * Key: todayWidgetPayload_v1
 */
class TodayWidgetProvider : AppWidgetProvider() {

    companion object {
        private const val PREFS_NAME = "openinvite_widget_store"
        private const val PAYLOAD_KEY = "todayWidgetPayload_v1"
        private const val SCHEME = "open-invite"
    }

    override fun onUpdate(
        context: Context,
        appWidgetManager: AppWidgetManager,
        appWidgetIds: IntArray
    ) {
        for (appWidgetId in appWidgetIds) {
            updateWidget(context, appWidgetManager, appWidgetId)
        }
    }

    private fun updateWidget(
        context: Context,
        appWidgetManager: AppWidgetManager,
        appWidgetId: Int
    ) {
        val payload = loadPayload(context)
        val views = buildViews(context, payload)
        appWidgetManager.updateAppWidget(appWidgetId, views)
    }

    private fun loadPayload(context: Context): JSONObject? {
        return try {
            val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            val json = prefs.getString(PAYLOAD_KEY, null) ?: return null
            JSONObject(json)
        } catch (e: Exception) {
            null
        }
    }

    private fun buildViews(context: Context, payload: JSONObject?): RemoteViews {
        val views = RemoteViews(context.packageName, R.layout.widget_today_medium)

        // Background tap → open app calendar
        val calendarIntent = Intent(Intent.ACTION_VIEW, Uri.parse("$SCHEME://calendar"))
        calendarIntent.flags = Intent.FLAG_ACTIVITY_NEW_TASK
        val calendarPending = PendingIntent.getActivity(
            context, 0, calendarIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        views.setOnClickPendingIntent(R.id.widget_root, calendarPending)

        if (payload == null || payload.optString("emptyState") == "no_events_today") {
            // Empty state
            views.setTextViewText(R.id.widget_title, "Today")
            views.setTextViewText(R.id.widget_row1_time, "")
            views.setTextViewText(R.id.widget_row1_title, "No plans today ☀️")
            views.setInt(R.id.widget_row2_container, "setVisibility", android.view.View.GONE)
            views.setInt(R.id.widget_row3_container, "setVisibility", android.view.View.GONE)
            views.setInt(R.id.widget_more, "setVisibility", android.view.View.GONE)
            return views
        }

        val items = payload.optJSONArray("items") ?: JSONArray()
        val moreCount = payload.optInt("moreCount", 0)

        views.setTextViewText(R.id.widget_title, "Today")

        // Row 1
        if (items.length() > 0) {
            val item = items.getJSONObject(0)
            views.setTextViewText(R.id.widget_row1_time, item.optString("timeLabel", ""))
            views.setTextViewText(R.id.widget_row1_title, item.optString("title", ""))
            setRowClickIntent(context, views, R.id.widget_row1_container, item, 1)
            views.setInt(R.id.widget_row1_container, "setVisibility", android.view.View.VISIBLE)
        } else {
            views.setInt(R.id.widget_row1_container, "setVisibility", android.view.View.GONE)
        }

        // Row 2
        if (items.length() > 1) {
            val item = items.getJSONObject(1)
            views.setTextViewText(R.id.widget_row2_time, item.optString("timeLabel", ""))
            views.setTextViewText(R.id.widget_row2_title, item.optString("title", ""))
            setRowClickIntent(context, views, R.id.widget_row2_container, item, 2)
            views.setInt(R.id.widget_row2_container, "setVisibility", android.view.View.VISIBLE)
        } else {
            views.setInt(R.id.widget_row2_container, "setVisibility", android.view.View.GONE)
        }

        // Row 3
        if (items.length() > 2) {
            val item = items.getJSONObject(2)
            views.setTextViewText(R.id.widget_row3_time, item.optString("timeLabel", ""))
            views.setTextViewText(R.id.widget_row3_title, item.optString("title", ""))
            setRowClickIntent(context, views, R.id.widget_row3_container, item, 3)
            views.setInt(R.id.widget_row3_container, "setVisibility", android.view.View.VISIBLE)
        } else {
            views.setInt(R.id.widget_row3_container, "setVisibility", android.view.View.GONE)
        }

        // "+N more" label
        val hiddenCount = maxOf(0, items.length() - 3) + moreCount
        if (hiddenCount > 0) {
            views.setTextViewText(R.id.widget_more, "+$hiddenCount more")
            views.setInt(R.id.widget_more, "setVisibility", android.view.View.VISIBLE)
        } else {
            views.setInt(R.id.widget_more, "setVisibility", android.view.View.GONE)
        }

        return views
    }

    private fun setRowClickIntent(
        context: Context,
        views: RemoteViews,
        viewId: Int,
        item: JSONObject,
        requestCode: Int
    ) {
        val deepLink = item.optString("deepLink", "$SCHEME://")
        val intent = Intent(Intent.ACTION_VIEW, Uri.parse(deepLink))
        intent.flags = Intent.FLAG_ACTIVITY_NEW_TASK
        val pending = PendingIntent.getActivity(
            context, requestCode, intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        views.setOnClickPendingIntent(viewId, pending)
    }
}
