package com.cet46.mlkit;

import android.app.Activity;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import com.google.android.gms.tasks.Tasks;
import com.google.mlkit.vision.common.InputImage;
import com.google.mlkit.vision.text.Text;
import com.google.mlkit.vision.text.TextRecognition;
import com.google.mlkit.vision.text.TextRecognizer;
import com.google.mlkit.vision.text.latin.TextRecognizerOptions;
import org.json.JSONArray;
import org.json.JSONObject;
import java.util.concurrent.TimeUnit;

public class MlKitBridge {
    private final Activity activity;
    public MlKitBridge(Activity a) { this.activity = a; }

    @JavascriptInterface
    public String recognize(String dataUrl) {
        try {
            int p = dataUrl.indexOf(',');
            String b64 = p >= 0 ? dataUrl.substring(p + 1) : dataUrl;
            byte[] bytes = Base64.decode(b64, Base64.DEFAULT);
            Bitmap bmp = BitmapFactory.decodeByteArray(bytes, 0, bytes.length);
            if (bmp == null) return "{\"error\":\"decode failed\"}";
            TextRecognizer rec = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS);
            Text text = Tasks.await(rec.process(InputImage.fromBitmap(bmp, 0)), 30, TimeUnit.SECONDS);
            JSONArray lines = new JSONArray();
            StringBuilder all = new StringBuilder();
            for (Text.TextBlock block : text.getTextBlocks()) {
                for (Text.Line line : block.getLines()) {
                    lines.put(line.getText());
                    all.append(line.getText()).append('\n');
                }
            }
            JSONObject o = new JSONObject();
            o.put("text", all.toString().trim());
            o.put("lines", lines);
            return o.toString();
        } catch (Throwable e) {
            android.util.Log.e("CET46ML", "recognize failed", e);
            return "{\"error\":\"" + e.getClass().getSimpleName().replace("\"", "") + "\"}";
        }
    }
}
