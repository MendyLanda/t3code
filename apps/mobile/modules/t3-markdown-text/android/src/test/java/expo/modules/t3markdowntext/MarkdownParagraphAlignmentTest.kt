package expo.modules.t3markdowntext

import android.text.Layout
import android.content.pm.ApplicationInfo
import android.text.Spanned
import android.text.SpannableString
import android.text.style.AlignmentSpan
import android.text.style.ImageSpan
import android.graphics.drawable.ColorDrawable
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.TextView
import org.junit.Assert.assertEquals
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [36], manifest = Config.NONE)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class MarkdownParagraphAlignmentTest {
  @Test
  fun measurementUsesTheFirstStrongCharacterIncludingNativeBidiMarks() {
    for (text in listOf("123 (...) مرحبا API!", "123 (...) שלום API!", "\u061c123", "\u200f123", "\uFFFC مرحبا")) {
      assertEquals(text, "rtl", naturalTextDirection(text))
    }
    for (text in listOf("", "123 (...)", "١٢٣", "\u200eمرحبا", "English שלום שלום שלום", "\uFFFC English")) {
      assertEquals(text, "ltr", naturalTextDirection(text))
    }
  }

  private val textView = TextView(RuntimeEnvironment.getApplication()).apply {
    layoutParams = ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT)
    setPadding(0, 0, 0, 0)
    setTextIsSelectable(true)
    gravity = Gravity.TOP or Gravity.LEFT
  }

  private fun layoutText(value: String, naturalAlignment: Boolean = true) {
    textView.text = value
    if (naturalAlignment) applyNaturalTextAlignment(textView)
    textView.measure(
      View.MeasureSpec.makeMeasureSpec(600, View.MeasureSpec.EXACTLY),
      View.MeasureSpec.makeMeasureSpec(0, View.MeasureSpec.UNSPECIFIED),
    )
    textView.layout(0, 0, 600, textView.measuredHeight)
    assertEquals(value, textView.text.toString())
  }

  private fun assertParagraph(line: Int, direction: Int) {
    val layout = textView.layout
    assertEquals(direction, layout.getParagraphDirection(line))
    if (direction == Layout.DIR_RIGHT_TO_LEFT) {
      assertEquals(layout.width.toFloat(), layout.getLineRight(line), 1f)
    } else {
      assertEquals(0f, layout.getLineLeft(line), 1f)
    }
  }

  @Test
  fun mixedParagraphsFollowTheirOwnFirstStrongCharacter() {
    layoutText("Hello שלום\n123 (...) مرحبا API!\n123 (...) שלום API!\n123 (...)")
    assertParagraph(0, Layout.DIR_LEFT_TO_RIGHT)
    assertParagraph(1, Layout.DIR_RIGHT_TO_LEFT)
    assertParagraph(2, Layout.DIR_RIGHT_TO_LEFT)
    assertParagraph(3, Layout.DIR_LEFT_TO_RIGHT)
  }

  @Test
  fun nativeTextUpdatesKeepNaturalAlignmentEvenWhenRnResetsGravity() {
    layoutText("English\nمرحبا")
    textView.gravity = Gravity.TOP or Gravity.LEFT
    layoutText("مرحبا\nEnglish")
    assertParagraph(0, Layout.DIR_RIGHT_TO_LEFT)
    assertParagraph(1, Layout.DIR_LEFT_TO_RIGHT)
  }

  @Test
  fun alignmentKeepsChipCopyOffsetsWithoutMutatingCachedTextOrRecycledViews() {
    val cachedText = SpannableString("مرحبا \uFFFC\u00A0API!")
    val icon = ImageSpan(ColorDrawable())
    cachedText.setSpan(icon, 6, 7, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
    textView.setText(cachedText, TextView.BufferType.SPANNABLE)
    applyNaturalTextAlignment(textView)
    val alignedText = textView.text as Spanned
    assertEquals(0, cachedText.getSpans(0, cachedText.length, AlignmentSpan::class.java).size)
    assertEquals(6, alignedText.getSpanStart(icon))
    assertEquals(7, alignedText.getSpanEnd(icon))
    assertEquals("مرحبا API!", copyTextWithoutInlineImages(alignedText, 0, alignedText.length))

    layoutText("שלום", naturalAlignment = false)
    assertEquals(0f, textView.layout.getLineLeft(0), 1f)
  }

  @Test
  fun neutralParagraphInRtlRootMatchesRnsLtrMeasurementFallback() {
    textView.context.applicationInfo.flags = textView.context.applicationInfo.flags or ApplicationInfo.FLAG_SUPPORTS_RTL
    textView.layoutDirection = View.LAYOUT_DIRECTION_RTL
    layoutText("مرحبا\nHello\n123 (...)\n\uFFFC")
    assertEquals(View.LAYOUT_DIRECTION_RTL, textView.layoutDirection)
    assertParagraph(0, Layout.DIR_RIGHT_TO_LEFT)
    assertParagraph(1, Layout.DIR_LEFT_TO_RIGHT)
    assertEquals(0f, textView.layout.getLineLeft(2), 1f)
    assertEquals(0f, textView.layout.getLineLeft(3), 1f)
  }

  @Test
  fun repeatedAlignmentKeepsSelectionAcrossOppositeDirectionParagraphs() {
    layoutText("مرحبا API!\nHello שלום")
    val text = textView.text as android.text.Spannable
    android.text.Selection.setSelection(text, 2, text.length - 2)
    applyNaturalTextAlignment(textView)
    assertEquals(2, android.text.Selection.getSelectionStart(textView.text))
    assertEquals(text.length - 2, android.text.Selection.getSelectionEnd(textView.text))
    assertEquals("مرحبا API!\nHello שלום", textView.text.toString())
  }
}
