import android.content.pm.ApplicationInfo;
import android.text.Layout;
import android.text.Selection;
import android.text.Spannable;
import android.text.SpannableString;
import android.text.Spanned;
import android.text.style.ImageSpan;
import android.graphics.drawable.ColorDrawable;
import android.view.View;
import android.view.ViewGroup;
import android.widget.TextView;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.RuntimeEnvironment;
import org.robolectric.annotation.Config;
import org.robolectric.annotation.GraphicsMode;
import org.robolectric.annotation.ConscryptMode;
import static org.junit.Assert.*;

// Enriched owns its TextView and measures that same native buffer. It uses default
// per-paragraph alignment instead of React Native's separately measured Text.
@RunWith(RobolectricTestRunner.class)
@Config(sdk = 36, manifest = Config.NONE)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@ConscryptMode(ConscryptMode.Mode.OFF)
public class MarkdownParagraphAlignmentTest {
  private TextView view() {
    TextView v = new TextView(RuntimeEnvironment.getApplication());
    v.setLayoutParams(new ViewGroup.LayoutParams(-1, -2));
    v.setPadding(0,0,0,0); v.setIncludeFontPadding(false); v.setTextIsSelectable(true);
    v.setTextDirection(View.TEXT_DIRECTION_FIRST_STRONG_LTR);
    return v;
  }
  private void layout(TextView v, CharSequence text) {
    v.setText(text, TextView.BufferType.SPANNABLE);
    v.measure(View.MeasureSpec.makeMeasureSpec(600, View.MeasureSpec.EXACTLY), View.MeasureSpec.makeMeasureSpec(0, View.MeasureSpec.UNSPECIFIED));
    v.layout(0,0,600,v.getMeasuredHeight()); assertEquals(text.toString(),v.getText().toString());
  }
  private void paragraph(TextView v, int line, int direction) {
    Layout l=v.getLayout(); assertEquals(direction,l.getParagraphDirection(line));
    if(direction==Layout.DIR_RIGHT_TO_LEFT) assertEquals(l.getWidth(),l.getLineRight(line),1f);
    else assertEquals(0f,l.getLineLeft(line),1f);
  }
  @Test public void mixedParagraphsFollowTheirOwnFirstStrongCharacter() {
    TextView v=view(); layout(v,"Hello שלום\n123 (...) مرحبا API!\n123 (...) שלום API!\n123 (...)");
    paragraph(v,0,1);paragraph(v,1,-1);paragraph(v,2,-1);paragraph(v,3,1);
  }
  @Test public void nativeTextUpdatesKeepNaturalAlignment() {
    TextView v=view();layout(v,"English\nمرحبا");layout(v,"مرحبا\nEnglish");paragraph(v,0,-1);paragraph(v,1,1);
  }
  @Test public void nativeBidiMarksAndInlineAttachmentsChooseDirection() {
    for(String text:new String[]{"123 (...) مرحبا API!","123 (...) שלום API!","\u061c123","\u200f123","\uFFFC مرحبا"}) {
      TextView v=view();layout(v,text);paragraph(v,0,-1);
    }
    for(String text:new String[]{"123 (...)","١٢٣","\u200eمرحبا","English שלום שלום שלום","\uFFFC English"}) {
      TextView v=view();layout(v,text);paragraph(v,0,1);
    }
  }
  @Test public void alignmentPreservesInlineChipOffsetsAndCachedText() {
    TextView v=view();SpannableString original=new SpannableString("مرحبا \uFFFC\u00A0API!");
    ImageSpan icon=new ImageSpan(new ColorDrawable());original.setSpan(icon,6,7,Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
    layout(v,original);paragraph(v,0,-1);Spanned aligned=(Spanned)v.getText();
    assertEquals(6,aligned.getSpanStart(icon));assertEquals(7,aligned.getSpanEnd(icon));assertEquals("مرحبا \uFFFC\u00A0API!",original.toString());
  }
  @Test public void paragraphsUseNativeDirectionInRtlRoot() {
    TextView v=view();v.getContext().getApplicationInfo().flags|=ApplicationInfo.FLAG_SUPPORTS_RTL;v.setLayoutDirection(View.LAYOUT_DIRECTION_RTL);
    layout(v,"مرحبا\nHello\n123 (...)\n\uFFFC");paragraph(v,0,-1);paragraph(v,1,1);
    // Neutral paragraphs retain the personal LTR fallback in an RTL root.
    paragraph(v,2,1);paragraph(v,3,1);
  }
  @Test public void repeatedMeasurementKeepsSelectionAcrossOppositeDirections() {
    TextView v=view();layout(v,"مرحبا API!\nHello שלום");Spannable text=(Spannable)v.getText();Selection.setSelection(text,2,text.length()-2);
    v.requestLayout();v.measure(View.MeasureSpec.makeMeasureSpec(600,View.MeasureSpec.EXACTLY),View.MeasureSpec.makeMeasureSpec(0,View.MeasureSpec.UNSPECIFIED));
    assertEquals(2,Selection.getSelectionStart(v.getText()));assertEquals(text.length()-2,Selection.getSelectionEnd(v.getText()));
  }
  @Test public void tableCellsFollowTheirTextInEitherRoot() throws Exception {
    for(int root:new int[]{View.LAYOUT_DIRECTION_LTR,View.LAYOUT_DIRECTION_RTL}) {
      TextView v=view();
      v.getContext().getApplicationInfo().flags|=ApplicationInfo.FLAG_SUPPORTS_RTL;
      v.setLayoutDirection(root);
      String direction=System.getProperty("ahi.enriched.table.direction","TEXT_DIRECTION_FIRST_STRONG_LTR");
      v.setTextDirection(View.class.getField(direction).getInt(null));
      var controller=org.robolectric.Robolectric.buildActivity(android.app.Activity.class).setup();
      controller.get().setContentView(v);
      org.robolectric.Shadows.shadowOf(android.os.Looper.getMainLooper()).idle();
      v.measure(View.MeasureSpec.makeMeasureSpec(600,View.MeasureSpec.EXACTLY),View.MeasureSpec.makeMeasureSpec(0,View.MeasureSpec.UNSPECIFIED));
      var method=TextView.class.getDeclaredMethod("getTextDirectionHeuristic");method.setAccessible(true);
      var heuristic=(android.text.TextDirectionHeuristic)method.invoke(v);
      assertTrue(heuristic.isRtl("123 (...) שלום API!",0,"123 (...) שלום API!".length()));
      assertFalse(heuristic.isRtl("English שלום",0,"English שלום".length()));
      assertFalse(heuristic.isRtl("123 (...)",0,"123 (...)".length()));
      layout(v,"123 (...) שלום API!\nEnglish שלום\n123 (...)");
      paragraph(v,0,-1);paragraph(v,1,1);paragraph(v,2,1);
      controller.pause().stop().destroy();
      org.robolectric.Shadows.shadowOf(android.os.Looper.getMainLooper()).idle();
    }
  }

}