package nl.timvanbergen.jensrun.glass

import android.content.res.Resources
import android.graphics.Canvas
import android.graphics.RectF
import android.graphics.RenderNode
import android.os.Build
import android.view.ViewGroup
import androidx.annotation.RequiresApi
import nl.timvanbergen.jensrun.glass.motion.GlassJelly
import nl.timvanbergen.jensrun.glass.overlay.GlassMenuOverlay
import nl.timvanbergen.jensrun.glass.records.GlassMenuConfigRecord
import nl.timvanbergen.jensrun.glass.records.GlassMenuItemRecord
import nl.timvanbergen.jensrun.glass.records.GlassTriggerConfigRecord
import nl.timvanbergen.jensrun.glass.render.GlassRenderer
import nl.timvanbergen.jensrun.glass.render.GlassSurfaceState
import kotlin.math.min

/** Het glazen menu: groeit uit een plek op het scherm en vervormt met je vinger mee. */
@RequiresApi(Build.VERSION_CODES.TIRAMISU)
class GlassMenu(root: ViewGroup, density: Float = root.resources.displayMetrics.density) {
  private val anchor = GlassMenuAnchor(root.resources)
  private val overlay = GlassMenuOverlay(root.context, root, density).also { it.anchor = anchor }

  init {
    root.addView(overlay, ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
  }

  /** [from] is de plek in vensterpixels. */
  fun show(from: RectF, items: List<GlassMenuItemRecord>, keys: Boolean = false, onClosed: () -> Unit = {}, onSelect: (String) -> Unit) {
    // Op de tv moet zichtbaar zijn welke regel aanstaat, ook op afstand.
    anchor.config = GlassMenuConfigRecord(highlightOpacity = if (keys) 2.6f else 1f)
    anchor.placement.set(from)
    anchor.items = items
    anchor.dark = true
    anchor.onSelect = onSelect
    anchor.onClosed = onClosed
    overlay.open(anchor)
    if (keys) overlay.focusFirstRow()
  }

  fun dismiss() = overlay.requestClose()

  /** Andere rijen terwijl het menu open staat. */
  fun refresh(items: List<GlassMenuItemRecord>) {
    anchor.items = items
    overlay.refreshItems()
  }
}

/** Een stuk glas of de plek waar een menu vandaan komt. De knop zelf kan in de pagina staan. */
@RequiresApi(Build.VERSION_CODES.TIRAMISU)
internal class GlassMenuAnchor(resources: Resources) {
  private val density = resources.displayMetrics.density
  private var glassRenderer: GlassRenderer? = null
  private var contentNode: RenderNode? = null

  val placement = RectF()
  val surfaceState = GlassSurfaceState()
  var items: List<GlassMenuItemRecord> = emptyList()
  var dark = false
  var onSelect: (String) -> Unit = {}
  var onClosed: () -> Unit = {}
  var glass = false
  var cornerRadius: Float? = null
  var opacity = 1f
  var content: ((Canvas) -> Unit)? = null

  val followsPress = false
  val menuWidth: Float? = null
  val alignment = "auto"
  var config = GlassMenuConfigRecord()
  var triggerConfig = GlassTriggerConfigRecord()
  val jelly = GlassJelly()
  val width get() = placement.width().toInt()
  val height get() = placement.height().toInt()

  fun isDark() = dark

  fun notifySelect(item: GlassMenuItemRecord, index: Int) = onSelect(item.id)

  fun cornerRadiusPx(bounds: RectF): Float {
    val capsule = min(bounds.width(), bounds.height()) / 2f
    return min(cornerRadius?.times(density) ?: capsule, capsule)
  }

  fun applyLight(state: GlassSurfaceState, origin: RectF, opacity: Float) {
    val glow = jelly.glowValue * opacity * triggerConfig.shine
    state.pressX = origin.left + jelly.lightPositionX
    state.pressY = origin.top + jelly.lightPositionY
    state.pressRadius = LightRadius * density
    state.poolGain = LightPool * glow
    state.pressLift = LightLift * glow
    state.rimLift = LightRimLift * glow
  }

  fun recordContent(): RenderNode {
    val node = contentNode ?: RenderNode("GlassMenu.trigger").also { contentNode = it }
    node.setPosition(0, 0, width, height)
    node.setPivotX(0f)
    node.setPivotY(0f)
    node.setScaleX(1f)
    node.setScaleY(1f)
    node.setTranslationX(0f)
    node.setTranslationY(0f)
    node.setRenderEffect(null)
    val recording = node.beginRecording(width, height)
    content?.invoke(recording)
    node.endRecording()
    return node
  }

  fun renderer(pixelDensity: Float): GlassRenderer =
    glassRenderer ?: GlassRenderer(pixelDensity, pixelDensity * FieldStep).also { glassRenderer = it }

  private companion object {
    const val FieldStep = 4f
    const val LightRadius = 38f
    const val LightLift = .055f
    const val LightPool = .07f
    const val LightRimLift = .3f
  }
}
