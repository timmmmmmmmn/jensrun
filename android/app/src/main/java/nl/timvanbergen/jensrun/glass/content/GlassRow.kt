package nl.timvanbergen.jensrun.glass.content

import android.graphics.RectF
import nl.timvanbergen.jensrun.glass.records.GlassMenuItemRecord

internal class GlassRow(val item: GlassMenuItemRecord, val index: Int) {
  val rect = RectF()
  var title: CharSequence = ""
  var subtitle: CharSequence? = null
  val isSeparator get() = item.separator
  val isHeading get() = item.heading
  val selectable get() = !item.separator && !item.heading && !item.disabled
}
