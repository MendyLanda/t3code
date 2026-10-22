package expo.modules.t3nativecontrols

import android.text.Layout
import android.text.SpannableString
import android.text.Spanned
import android.text.TextDirectionHeuristics
import android.text.TextUtils
import android.text.style.AlignmentSpan
import android.view.View
import android.widget.TextView

private class NaturalAlignmentSpan(alignment: Layout.Alignment) : AlignmentSpan.Standard(alignment)

internal fun naturalTextDirection(text: String): String =
  if (TextDirectionHeuristics.FIRSTSTRONG_LTR.isRtl(text, 0, text.length)) "rtl" else "ltr"

internal fun applyNaturalTextAlignment(textView: TextView) {
  val text = textView.text
  if (text.isEmpty()) return
  val paragraphs = mutableListOf<Triple<Int, Int, Layout.Alignment>>()
  var start = 0
  while (start < text.length) {
    val newline = TextUtils.indexOf(text, '\n', start)
    val end = if (newline < 0) text.length else newline + 1
    val hasStrongDirection =
      TextDirectionHeuristics.FIRSTSTRONG_LTR.isRtl(text, start, end - start) ==
        TextDirectionHeuristics.FIRSTSTRONG_RTL.isRtl(text, start, end - start)
    // RN measures neutral paragraphs with LTR fallback; TextView inherits its root direction.
    val alignment = if (textView.layoutDirection == View.LAYOUT_DIRECTION_RTL &&
      !hasStrongDirection
    ) {
      Layout.Alignment.ALIGN_OPPOSITE
    } else {
      Layout.Alignment.ALIGN_NORMAL
    }
    paragraphs.add(Triple(start, end, alignment))
    start = end
  }
  val existing = (text as? Spanned)?.getSpans(0, text.length, NaturalAlignmentSpan::class.java)
    ?: emptyArray()
  if (text is Spanned && existing.size == paragraphs.size) {
    val matches = paragraphs.withIndex().all { (index, paragraph) ->
      val (first, last, alignment) = paragraph
      text.getSpanStart(existing[index]) == first && text.getSpanEnd(existing[index]) == last &&
        existing[index].alignment == alignment
    }
    if (matches) return
  }
  // Keep RN's cached buffer untouched. Paragraph spans follow the text and cannot leak into
  // recycled UI/code views, unlike changing TextView's alignment or direction properties.
  val aligned = SpannableString(text)
  existing.forEach(aligned::removeSpan)
  paragraphs.forEach { (first, last, alignment) ->
    aligned.setSpan(NaturalAlignmentSpan(alignment), first, last, Spanned.SPAN_PARAGRAPH)
  }
  textView.setText(aligned, TextView.BufferType.SPANNABLE)
}
