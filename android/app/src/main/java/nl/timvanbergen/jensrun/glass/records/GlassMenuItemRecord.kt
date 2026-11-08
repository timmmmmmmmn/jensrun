package nl.timvanbergen.jensrun.glass.records

import android.graphics.Bitmap
import android.graphics.Path

class GlassMenuItemRecord(
  val id: String = "",
  val title: String = "",
  val subtitle: String? = null,
  val icon: String? = null,
  val iconPath: String? = null,
  val iconShape: Path? = null,
  val iconBitmap: Bitmap? = null,
  val checked: Boolean? = null,
  val destructive: Boolean = false,
  val disabled: Boolean = false,
  val keepOpen: Boolean = false,
  val separator: Boolean = false,
  val heading: Boolean = false,
  val color: Int? = null,
)
