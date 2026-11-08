package nl.timvanbergen.jensrun

import android.annotation.SuppressLint
import android.content.ContentValues
import android.content.Intent
import android.os.Environment
import android.provider.MediaStore
import android.widget.Toast
import android.graphics.BitmapFactory
import android.graphics.Color
import android.graphics.RectF
import android.os.Build
import android.os.Bundle
import android.util.Base64
import android.webkit.JavascriptInterface
import androidx.core.content.FileProvider
import java.io.File
import android.view.ViewGroup
import android.view.WindowManager
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.annotation.RequiresApi
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import nl.timvanbergen.jensrun.glass.GlassMenu
import nl.timvanbergen.jensrun.glass.records.GlassMenuItemRecord
import org.json.JSONObject

/**
 * Jens Run als app: de game van jensrun.timvanbergen.nl schermvullend in een eigen venster.
 * De game zelf komt altijd vers van de website; de app werkt zichzelf bij via GitHub (Updater).
 */
class MainActivity : ComponentActivity() {

    private lateinit var web: WebView
    private var paused = false
    private var glassMenu: GlassMenu? = null
    private val askNotifications = registerForActivityResult(androidx.activity.result.contract.ActivityResultContracts.RequestPermission()) { }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        WindowCompat.setDecorFitsSystemWindows(window, false)
        window.decorView.setBackgroundColor(Color.BLACK)

        web = WebView(this)
        web.setBackgroundColor(Color.BLACK)
        setContentView(web)
        if (Build.VERSION.SDK_INT >= 33) glassMenu = GlassMenu(window.decorView as ViewGroup)
        hideBars()

        with(web.settings) {
            javaScriptEnabled = true
            domStorageEnabled = true
            mediaPlaybackRequiresUserGesture = false
            cacheMode = WebSettings.LOAD_DEFAULT
            userAgentString = "$userAgentString JensRunApp/${Updater.currentName(this@MainActivity)}"
        }
        web.webChromeClient = WebChromeClient()
        web.addJavascriptInterface(Bridge(), "JensRunNative")
        web.webViewClient = object : WebViewClient() {
            // De game zelf zit in de app (assets/www) en wordt onder het eigen webadres getoond,
            // zodat opgeslagen voortgang en links blijven werken. Alleen /api gaat naar de server.
            override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? {
                val url = request.url
                if (url.host != HOST || request.method != "GET") return null
                val path = url.path ?: "/"
                if (path.startsWith("/api/") || path.startsWith("/beheer") || path.startsWith("/.well-known")) return null
                return Bundel.serve(this@MainActivity, if (path == "/" || path.isEmpty()) "/index.html" else path, request.requestHeaders["Range"] ?: request.requestHeaders["range"])
            }

            // Links naar buiten de game (zoals GitHub) openen in de browser.
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                if (request.url.host == HOST) return false
                startActivity(Intent(Intent.ACTION_VIEW, request.url))
                return true
            }
        }

        // Terug-knop: tijdens het rennen pauzeren, in een submenu terug naar het menu, anders de app wegzetten.
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                web.evaluateJavascript("window.__jrBack ? window.__jrBack() : false") { handled ->
                    if (handled != "true") moveTaskToBack(true)
                }
            }
        })

        if (savedInstanceState != null) web.restoreState(savedInstanceState) else web.loadUrl(linkOf(intent) ?: "https://$HOST/?app=android")
        Updater.checkQuietly(this)
        Meldingen.channel(this)
        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS) != android.content.pm.PackageManager.PERMISSION_GRANTED) {
            askNotifications.launch(android.Manifest.permission.POST_NOTIFICATIONS)
        }
    }

    @RequiresApi(33)
    private fun showGlassMenu(menu: JSONObject) {
        val density = resources.displayMetrics.density
        val origin = IntArray(2).also { web.getLocationInWindow(it) }
        val left = origin[0] + menu.getDouble("x").toFloat() * density
        val top = origin[1] + menu.getDouble("y").toFloat() * density
        val from = RectF(left, top, left + menu.getDouble("w").toFloat() * density, top + menu.getDouble("h").toFloat() * density)
        val rows = menu.getJSONArray("items")
        val items = List(rows.length()) { i ->
            val row = rows.getJSONObject(i)
            val png = row.optString("png").takeIf { it.isNotEmpty() }?.let { Base64.decode(it, Base64.DEFAULT) }
            GlassMenuItemRecord(
                id = row.getString("id"),
                title = row.optString("title"),
                subtitle = row.optString("subtitle").ifEmpty { null },
                iconBitmap = png?.let { BitmapFactory.decodeByteArray(it, 0, it.size) },
                checked = if (row.has("checked")) row.optBoolean("checked") else null,
                disabled = row.optBoolean("disabled"),
                separator = row.optBoolean("separator"),
                heading = row.optBoolean("heading"),
            )
        }
        glassMenu?.show(from, items) { id ->
            web.evaluateJavascript("window.__jrGlassPick && __jrGlassPick(${JSONObject.quote(id)})", null)
        }
    }

    private fun hideBars() {
        WindowInsetsControllerCompat(window, window.decorView).apply {
            hide(WindowInsetsCompat.Type.systemBars())
            systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            window.attributes = window.attributes.apply {
                layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES
            }
        }
    }

    /** Een geopende link (bijv. een uitdaging) in de game laden. */
    private fun linkOf(intent: Intent?): String? {
        val uri = intent?.data ?: return null
        return if (uri.host == HOST && uri.scheme == "https") uri.toString() else null
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        linkOf(intent)?.let { web.loadUrl(it) }
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) hideBars()
    }

    override fun onResume() {
        super.onResume()
        paused = false
        web.onResume()
        web.resumeTimers()
        web.evaluateJavascript("window.__jrResume && window.__jrResume()", null)
        Updater.resume(this)
    }

    override fun onPause() {
        // App naar de achtergrond: game op pauze en al het geluid uit (muziek, effecten, filmpjes).
        // Pas als de pagina dat gedaan heeft, wordt hij bevroren.
        paused = true
        web.evaluateJavascript("window.__jrPause && window.__jrPause(); true") {
            if (paused) {
                web.onPause()
                web.pauseTimers()
            }
        }
        super.onPause()
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        web.saveState(outState)
    }

    override fun onDestroy() {
        web.destroy()
        super.onDestroy()
    }

    /** Vanuit de game: een opgenomen snap delen via het deelmenu van Android. */
    inner class Bridge {
        @JavascriptInterface
        fun setPlayer(id: String) {
            if (Regex("^[a-f0-9-]{36}$").matches(id)) Meldingen.setPlayer(this@MainActivity, id)
        }

        /** Filmpje rechtstreeks in Downloads zetten (Android 10+). Geeft false terug als dat niet kan. */
        @JavascriptInterface
        fun saveFile(base64: String, mime: String, name: String): Boolean {
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return false
            return try {
                val values = ContentValues().apply {
                    put(MediaStore.Downloads.DISPLAY_NAME, name.replace(Regex("[^a-zA-Z0-9._-]"), "_"))
                    put(MediaStore.Downloads.MIME_TYPE, mime)
                    put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS)
                }
                val uri = contentResolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values) ?: return false
                contentResolver.openOutputStream(uri)?.use { it.write(Base64.decode(base64, Base64.DEFAULT)) } ?: return false
                runOnUiThread { Toast.makeText(this@MainActivity, "Opgeslagen in Downloads", Toast.LENGTH_SHORT).show() }
                true
            } catch (e: Exception) {
                false
            }
        }

        /** Instellingen > Zoeken naar updates: altijd kijken en laten weten als alles al bijgewerkt is. */
        @JavascriptInterface
        fun checkUpdate() {
            runOnUiThread { Updater.check(this@MainActivity, manual = true) }
        }

        /** Het glazen menu; false op oudere toestellen, dan toont de pagina haar eigen versie. */
        @JavascriptInterface
        fun glassMenu(json: String): Boolean {
            if (Build.VERSION.SDK_INT < 33) return false
            val menu = JSONObject(json)
            runOnUiThread { showGlassMenu(menu) }
            return true
        }

        @JavascriptInterface
        fun version(): String = Updater.currentName(this@MainActivity)

        @JavascriptInterface
        fun shareFile(base64: String, mime: String, name: String) {
            val dir = File(cacheDir, "shared").apply { mkdirs() }
            val file = File(dir, name.replace(Regex("[^a-zA-Z0-9._-]"), "_"))
            file.writeBytes(Base64.decode(base64, Base64.DEFAULT))
            val uri = FileProvider.getUriForFile(this@MainActivity, "$packageName.files", file)
            val send = Intent(Intent.ACTION_SEND)
                .setType(mime)
                .putExtra(Intent.EXTRA_STREAM, uri)
                .putExtra(Intent.EXTRA_TEXT, "Snap uit Jens Run 👻 jensrun.timvanbergen.nl")
                .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            runOnUiThread { startActivity(Intent.createChooser(send, "Deel je snap")) }
        }
    }

    companion object {
        private const val HOST = "jensrun.timvanbergen.nl"
    }
}
