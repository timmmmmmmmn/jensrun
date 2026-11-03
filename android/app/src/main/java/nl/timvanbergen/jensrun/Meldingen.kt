package nl.timvanbergen.jensrun

import android.app.AlarmManager
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.SystemClock
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

/**
 * Meldingen zonder Google-push: elk kwartier kijkt de app bij de server of er iets nieuws is
 * (record verbroken door een vriend, reactie op je profiel, iemand in je clan) en laat dat als
 * telefoonmelding zien.
 */
object Meldingen {
    private const val PREFS = "jensrun-meldingen"
    const val CHANNEL = "jensrun"

    fun setPlayer(context: Context, id: String) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString("player", id).apply()
        schedule(context)
    }

    fun schedule(context: Context) {
        val am = context.getSystemService(AlarmManager::class.java)
        val pi = PendingIntent.getBroadcast(context, 1, Intent(context, MeldingReceiver::class.java),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        am.setInexactRepeating(AlarmManager.ELAPSED_REALTIME, SystemClock.elapsedRealtime() + AlarmManager.INTERVAL_FIFTEEN_MINUTES,
            AlarmManager.INTERVAL_FIFTEEN_MINUTES, pi)
    }

    fun channel(context: Context) {
        val nm = context.getSystemService(NotificationManager::class.java)
        nm.createNotificationChannel(NotificationChannel(CHANNEL, "Jens Run", NotificationManager.IMPORTANCE_DEFAULT).apply {
            description = "Records van vrienden, reacties en je clan"
        })
    }

    /** Op een achtergronddraad: nieuwe meldingen ophalen en tonen. */
    fun check(context: Context) {
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val id = prefs.getString("player", null) ?: return
        val last = prefs.getLong("last", -1L)
        val conn = URL("https://jensrun.timvanbergen.nl/api/notifs?id=$id").openConnection() as HttpURLConnection
        try {
            conn.connectTimeout = 10_000; conn.readTimeout = 15_000
            if (conn.responseCode != 200) return
            val rows = JSONObject(conn.inputStream.bufferedReader().use { it.readText() }).optJSONArray("rows") ?: return
            var newest = last
            // de eerste keer alleen onthouden waar we zijn, niets tonen
            for (i in rows.length() - 1 downTo 0) {
                val n = rows.getJSONObject(i)
                val nid = n.getLong("id")
                if (nid > newest) newest = nid
                if (last >= 0 && nid > last && n.optInt("seen") == 0) show(context, nid.toInt(), n.getString("text"))
            }
            prefs.edit().putLong("last", newest).apply()
        } finally {
            conn.disconnect()
        }
    }

    private fun show(context: Context, id: Int, text: String) {
        channel(context)
        val open = PendingIntent.getActivity(context, 0, Intent(context, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        val n = Notification.Builder(context, CHANNEL)
            .setSmallIcon(R.drawable.ic_stat)
            .setContentTitle("Jens Run")
            .setContentText(text)
            .setStyle(Notification.BigTextStyle().bigText(text))
            .setContentIntent(open)
            .setAutoCancel(true)
            .build()
        try { context.getSystemService(NotificationManager::class.java).notify(id, n) } catch (_: SecurityException) { }
    }
}

class MeldingReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action == Intent.ACTION_BOOT_COMPLETED || intent.action == Intent.ACTION_MY_PACKAGE_REPLACED) {
            Meldingen.schedule(context); return
        }
        val done = goAsync()
        Thread {
            try { Meldingen.check(context) } catch (_: Exception) { } finally { done.finish() }
        }.start()
    }
}
