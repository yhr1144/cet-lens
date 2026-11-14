package com.cet46.coach;

import android.app.Activity;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.ContentValues;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Matrix;
import android.media.ExifInterface;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.provider.MediaStore;
import android.speech.tts.TextToSpeech;
import android.util.Base64;
import android.util.Log;
import android.view.Window;
import android.webkit.ConsoleMessage;
import android.webkit.JavascriptInterface;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.Toast;
import com.cet46.mlkit.MlKitBridge;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.Locale;
import org.json.JSONObject;

/* JADX INFO: loaded from: classes.dex */
public class MainActivity extends Activity {
    private static final int REQ_CAMERA = 201;
    private static final int REQ_CAMERA_PERM = 100;
    private static final int REQ_FILE = 203;
    private static final int REQ_FILE_CAMERA = 204;
    private static final int REQ_GALLERY = 202;
    private static final String TAG = "CET46";
    private File cameraOutputFile;
    private Uri cameraOutputUri;
    private ValueCallback<Uri[]> filePathCallback;
    private Runnable pendingCameraAction;
    private LocalServer server;
    private TextToSpeech tts;
    private boolean ttsReady = false;
    private WebView webView;

    /* JADX INFO: renamed from: com.cet46.coach.MainActivity$2, reason: invalid class name */
    class AnonymousClass2 extends WebChromeClient {
        AnonymousClass2() {
        }

        /* JADX INFO: renamed from: lambda$onPermissionRequest$0$com-cet46-coach-MainActivity$2, reason: not valid java name */
        /* synthetic */ void m46lambda$onPermissionRequest$0$comcet46coachMainActivity$2(PermissionRequest permissionRequest) {
            boolean z = false;
            for (String str : permissionRequest.getResources()) {
                if ("android.webkit.resource.VIDEO_CAPTURE".equals(str)) {
                    z = true;
                }
            }
            if (z && MainActivity.this.checkSelfPermission("android.permission.CAMERA") == 0) {
                permissionRequest.grant(new String[]{"android.webkit.resource.VIDEO_CAPTURE"});
            } else {
                permissionRequest.deny();
            }
        }

        @Override // android.webkit.WebChromeClient
        public boolean onConsoleMessage(ConsoleMessage consoleMessage) {
            Log.d(MainActivity.TAG, consoleMessage.message() + " @" + consoleMessage.lineNumber());
            return true;
        }

        @Override // android.webkit.WebChromeClient
        public void onPermissionRequest(final PermissionRequest permissionRequest) {
            MainActivity.this.runOnUiThread(new Runnable() { // from class: com.cet46.coach.MainActivity$2$$ExternalSyntheticLambda0
                @Override // java.lang.Runnable
                public final void run() {
                    m46lambda$onPermissionRequest$0$comcet46coachMainActivity$2(permissionRequest);
                }
            });
        }

        @Override // android.webkit.WebChromeClient
        public boolean onShowFileChooser(WebView webView, ValueCallback<Uri[]> valueCallback, WebChromeClient.FileChooserParams fileChooserParams) {
            if (MainActivity.this.filePathCallback != null) {
                MainActivity.this.filePathCallback.onReceiveValue(null);
            }
            MainActivity.this.filePathCallback = valueCallback;
            if (fileChooserParams.isCaptureEnabled()) {
                MainActivity.this.launchCamera(204);
                return true;
            }
            Intent intent = new Intent("android.intent.action.OPEN_DOCUMENT");
            intent.addCategory("android.intent.category.OPENABLE");
            intent.setType("image/*");
            try {
                MainActivity.this.startActivityForResult(intent, 203);
                return true;
            } catch (Exception unused) {
                MainActivity.this.filePathCallback = null;
                return false;
            }
        }
    }

    public class Bridge {
        public Bridge() {
        }

        @JavascriptInterface
        public void captureImage() {
            MainActivity.this.runOnUiThread(new Runnable() { // from class: com.cet46.coach.MainActivity$Bridge$$ExternalSyntheticLambda1
                @Override // java.lang.Runnable
                public final void run() {
                    m47lambda$captureImage$0$comcet46coachMainActivity$Bridge();
                }
            });
        }

        @JavascriptInterface
        public void copyText(final String str) {
            if (str == null) {
                return;
            }
            MainActivity.this.runOnUiThread(new Runnable() { // from class: com.cet46.coach.MainActivity$Bridge$$ExternalSyntheticLambda2
                @Override // java.lang.Runnable
                public final void run() {
                    m48lambda$copyText$4$comcet46coachMainActivity$Bridge(str);
                }
            });
        }

        @JavascriptInterface
        public int fullCount() {
            return FullDict.count();
        }

        @JavascriptInterface
        public String fullLookup(String str) {
            return FullDict.lookup(str);
        }

        @JavascriptInterface
        public String fullSearch(String str, int i) {
            return FullDict.search(str, i);
        }

        @JavascriptInterface
        public String getInfo() {
            try {
                JSONObject jSONObject = new JSONObject();
                jSONObject.put("version", "1.0.0");
                jSONObject.put("platform", "android");
                jSONObject.put("sdk", Build.VERSION.SDK_INT);
                jSONObject.put("device", Build.MANUFACTURER + " " + Build.MODEL);
                return jSONObject.toString();
            } catch (Exception unused) {
                return "{}";
            }
        }

        @JavascriptInterface
        public void keepAwake(final boolean z) {
            MainActivity.this.runOnUiThread(new Runnable() { // from class: com.cet46.coach.MainActivity$Bridge$$ExternalSyntheticLambda6
                @Override // java.lang.Runnable
                public final void run() {
                    m49lambda$keepAwake$7$comcet46coachMainActivity$Bridge(z);
                }
            });
        }

        /* JADX INFO: renamed from: lambda$captureImage$0$com-cet46-coach-MainActivity$Bridge, reason: not valid java name */
        /* synthetic */ void m47lambda$captureImage$0$comcet46coachMainActivity$Bridge() {
            MainActivity.this.launchCamera(201);
        }

        /* JADX INFO: renamed from: lambda$copyText$4$com-cet46-coach-MainActivity$Bridge, reason: not valid java name */
        /* synthetic */ void m48lambda$copyText$4$comcet46coachMainActivity$Bridge(String str) {
            ClipboardManager clipboardManager = (ClipboardManager) MainActivity.this.getSystemService("clipboard");
            if (clipboardManager != null) {
                clipboardManager.setPrimaryClip(ClipData.newPlainText(MainActivity.TAG, str));
                toast("已复制");
            }
        }

        /* JADX INFO: renamed from: lambda$keepAwake$7$com-cet46-coach-MainActivity$Bridge, reason: not valid java name */
        /* synthetic */ void m49lambda$keepAwake$7$comcet46coachMainActivity$Bridge(boolean z) {
            if (z) {
                MainActivity.this.getWindow().addFlags(128);
            } else {
                MainActivity.this.getWindow().clearFlags(128);
            }
        }

        /* JADX INFO: renamed from: lambda$saveText$6$com-cet46-coach-MainActivity$Bridge, reason: not valid java name */
        /* synthetic */ void m50lambda$saveText$6$comcet46coachMainActivity$Bridge(String str, String str2) {
            try {
                if (Build.VERSION.SDK_INT < 29) {
                    File file = new File(MainActivity.this.getExternalFilesDir(null), "exports");
                    if (!file.exists()) {
                        file.mkdirs();
                    }
                    File file2 = new File(file, str);
                    FileOutputStream fileOutputStream = new FileOutputStream(file2);
                    try {
                        fileOutputStream.write(str2.getBytes("UTF-8"));
                        fileOutputStream.close();
                        toast("已保存到 " + file2.getAbsolutePath());
                        return;
                    } catch (Throwable th) {
                        try {
                            fileOutputStream.close();
                        } catch (Throwable th2) {
                            Throwable.class.getDeclaredMethod("addSuppressed", Throwable.class).invoke(th, th2);
                        }
                        throw th;
                    }
                }
                ContentValues contentValues = new ContentValues();
                contentValues.put("_display_name", str);
                contentValues.put("mime_type", "text/plain");
                contentValues.put("relative_path", Environment.DIRECTORY_DOWNLOADS + "/CET46");
                Uri uriInsert = MainActivity.this.getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, contentValues);
                if (uriInsert == null) {
                    throw new Exception("insert failed");
                }
                OutputStream outputStreamOpenOutputStream = MainActivity.this.getContentResolver().openOutputStream(uriInsert);
                try {
                    if (outputStreamOpenOutputStream == null) {
                        throw new Exception("open failed");
                    }
                    outputStreamOpenOutputStream.write(str2.getBytes("UTF-8"));
                    if (outputStreamOpenOutputStream != null) {
                        outputStreamOpenOutputStream.close();
                    }
                    toast("已保存到 Download/CET46/" + str);
                    return;
                } catch (Throwable th3) {
                    if (outputStreamOpenOutputStream != null) {
                        try {
                            outputStreamOpenOutputStream.close();
                        } catch (Throwable th4) {
                            Throwable.class.getDeclaredMethod("addSuppressed", Throwable.class).invoke(th3, th4);
                        }
                    }
                    throw th3;
                }
            } catch (Exception unused) {
                toast("保存失败，可改用分享");
            }
            toast("保存失败，可改用分享");
        }

        /* JADX INFO: renamed from: lambda$shareText$5$com-cet46-coach-MainActivity$Bridge, reason: not valid java name */
        /* synthetic */ void m51lambda$shareText$5$comcet46coachMainActivity$Bridge(String str) {
            Intent intent = new Intent("android.intent.action.SEND");
            intent.setType("text/plain");
            intent.putExtra("android.intent.extra.TEXT", str);
            MainActivity.this.startActivity(Intent.createChooser(intent, "分享"));
        }

        /* JADX INFO: renamed from: lambda$speak$2$com-cet46-coach-MainActivity$Bridge, reason: not valid java name */
        /* synthetic */ void m52lambda$speak$2$comcet46coachMainActivity$Bridge(float f, String str) {
            if (MainActivity.this.tts == null || !MainActivity.this.ttsReady) {
                toast("语音引擎尚未就绪");
            } else {
                MainActivity.this.tts.setSpeechRate(f);
                MainActivity.this.tts.speak(str, 0, null, "cet46");
            }
        }

        /* JADX INFO: renamed from: lambda$stopSpeak$3$com-cet46-coach-MainActivity$Bridge, reason: not valid java name */
        /* synthetic */ void m53lambda$stopSpeak$3$comcet46coachMainActivity$Bridge() {
            if (MainActivity.this.tts != null) {
                MainActivity.this.tts.stop();
            }
        }

        @JavascriptInterface
        public void pickImage() {
            final MainActivity mainActivity = MainActivity.this;
            mainActivity.runOnUiThread(new Runnable() { // from class: com.cet46.coach.MainActivity$Bridge$$ExternalSyntheticLambda3
                @Override // java.lang.Runnable
                public final void run() {
                    mainActivity.launchGallery();
                }
            });
        }

        @JavascriptInterface
        public void saveText(String str, String str2) {
            final String body = str2 == null ? "" : str2;
            final String name = (str == null || str.trim().isEmpty()) ? "CET46_export.txt" : str.trim();
            MainActivity.this.runOnUiThread(() -> m50lambda$saveText$6$comcet46coachMainActivity$Bridge(name, body));
        }

        @JavascriptInterface
        public void shareText(final String str) {
            if (str == null) {
                return;
            }
            MainActivity.this.runOnUiThread(new Runnable() { // from class: com.cet46.coach.MainActivity$Bridge$$ExternalSyntheticLambda0
                @Override // java.lang.Runnable
                public final void run() {
                    m51lambda$shareText$5$comcet46coachMainActivity$Bridge(str);
                }
            });
        }

        @JavascriptInterface
        public void speak(String str, float f) {
            if (str == null) {
                return;
            }
            String trimmed = str.trim();
            if (trimmed.length() > 4000) {
                trimmed = trimmed.substring(0, 4000);
            }
            final String body = trimmed;
            final float fMax = Math.max(0.5f, Math.min(1.5f, f));
            MainActivity.this.runOnUiThread(() -> m52lambda$speak$2$comcet46coachMainActivity$Bridge(fMax, body));
        }

        @JavascriptInterface
        public void stopSpeak() {
            MainActivity.this.runOnUiThread(new Runnable() { // from class: com.cet46.coach.MainActivity$Bridge$$ExternalSyntheticLambda4
                @Override // java.lang.Runnable
                public final void run() {
                    m53lambda$stopSpeak$3$comcet46coachMainActivity$Bridge();
                }
            });
        }

        @JavascriptInterface
        public void toast(String str) {
            MainActivity mainActivity = MainActivity.this;
            if (str == null) {
                str = "";
            }
            mainActivity.toast(str);
        }

        @JavascriptInterface
        public void vibrate(int i) {
            try {
                Vibrator vibrator = (Vibrator) MainActivity.this.getSystemService("vibrator");
                if (vibrator == null) {
                    return;
                }
                int iMax = Math.max(10, Math.min(80, i));
                if (Build.VERSION.SDK_INT >= 26) {
                    vibrator.vibrate(VibrationEffect.createOneShot(iMax, -1));
                } else {
                    vibrator.vibrate(iMax);
                }
            } catch (Exception unused) {
            }
        }
    }

    /* JADX WARN: Code duplicated, block: B:41:0x006e A[EXC_TOP_SPLITTER, SYNTHETIC] */
    private File copyToCache(Uri uri) {
        try {
            File file = new File(getCacheDir(), "capture");
            if (!file.exists()) {
                file.mkdirs();
            }
            File file2 = new File(file, "pick_" + System.currentTimeMillis() + ".jpg");
            InputStream inputStreamOpenInputStream = getContentResolver().openInputStream(uri);
            try {
                FileOutputStream fileOutputStream = new FileOutputStream(file2);
                if (inputStreamOpenInputStream == null) {
                    fileOutputStream.close();
                    if (inputStreamOpenInputStream != null) {
                        inputStreamOpenInputStream.close();
                    }
                    return null;
                }
                try {
                    byte[] bArr = new byte[8192];
                    while (true) {
                        int i = inputStreamOpenInputStream.read(bArr);
                        if (i <= 0) {
                            break;
                        }
                        fileOutputStream.write(bArr, 0, i);                    }
                    fileOutputStream.close();
                    if (inputStreamOpenInputStream != null) {
                        inputStreamOpenInputStream.close();
                    }
                    return file2;
                } catch (Throwable th2) {
                    try {
                        fileOutputStream.close();
                    } catch (Throwable th3) {
                        Throwable.class.getDeclaredMethod("addSuppressed", Throwable.class).invoke(th2, th3);
                    }
                    throw th2;
                }
            } catch (Throwable th4) {
                if (inputStreamOpenInputStream != null) {
                    inputStreamOpenInputStream.close();
                }
                throw th4;
            }
        } catch (Exception e) {
            Log.w(TAG, "copy failed", e);
            return null;
        }
    }

    private Bitmap decodeForOcr(File file) {
        int i;
        BitmapFactory.Options options = new BitmapFactory.Options();
        options.inJustDecodeBounds = true;
        BitmapFactory.decodeFile(file.getAbsolutePath(), options);
        if (options.outWidth <= 0 || options.outHeight <= 0) {
            return null;
        }
        int i2 = 1;
        while (true) {
            if (options.outWidth / i2 <= 2200 && options.outHeight / i2 <= 2200) {
                break;
            }
            i2 *= 2;
        }
        BitmapFactory.Options options2 = new BitmapFactory.Options();
        options2.inSampleSize = i2;
        options2.inPreferredConfig = Bitmap.Config.ARGB_8888;
        Bitmap bitmapDecodeFile = BitmapFactory.decodeFile(file.getAbsolutePath(), options2);
        if (bitmapDecodeFile == null) {
            return null;
        }
        try {
            int attributeInt = new ExifInterface(file.getAbsolutePath()).getAttributeInt(androidx.exifinterface.media.ExifInterface.TAG_ORIENTATION, 1);
            if (attributeInt == 6) {
                i = 90;
            } else if (attributeInt == 3) {
                i = 180;
            } else {
                i = attributeInt == 8 ? 270 : 0;
            }
            if (i == 0) {
                return bitmapDecodeFile;
            }
            Matrix matrix = new Matrix();
            matrix.postRotate(i);
            Bitmap bitmapCreateBitmap = Bitmap.createBitmap(bitmapDecodeFile, 0, 0, bitmapDecodeFile.getWidth(), bitmapDecodeFile.getHeight(), matrix, true);
            if (bitmapCreateBitmap != bitmapDecodeFile) {
                bitmapDecodeFile.recycle();
            }
            return bitmapCreateBitmap;
        } catch (Exception unused) {
            return bitmapDecodeFile;
        }
    }

    private void ensureCamera(Runnable runnable) {
        if (hasCameraPermission()) {
            runnable.run();
        } else {
            this.pendingCameraAction = runnable;
            requestPermissions(new String[]{"android.permission.CAMERA"}, 100);
        }
    }

    private boolean hasCameraPermission() {
        return checkSelfPermission("android.permission.CAMERA") == 0;
    }

    private void initTts() {
        this.tts = new TextToSpeech(this, new TextToSpeech.OnInitListener() { // from class: com.cet46.coach.MainActivity$$ExternalSyntheticLambda1
            @Override // android.speech.tts.TextToSpeech.OnInitListener
            public final void onInit(int i) {
                m40lambda$initTts$0$comcet46coachMainActivity(i);
            }
        });
    }

    /* JADX INFO: Access modifiers changed from: private */
    public void launchCamera(final int i) {
        ensureCamera(new Runnable() { // from class: com.cet46.coach.MainActivity$$ExternalSyntheticLambda2
            @Override // java.lang.Runnable
            public final void run() {
                m41lambda$launchCamera$1$comcet46coachMainActivity(i);
            }
        });
    }

    /* JADX INFO: Access modifiers changed from: private */
    public void launchGallery() {
        Intent intent = new Intent("android.intent.action.OPEN_DOCUMENT");
        intent.addCategory("android.intent.category.OPENABLE");
        intent.setType("image/*");
        try {
            startActivityForResult(intent, 202);
        } catch (Exception unused) {
            toast("无法打开相册");
        }
    }

    private File newCaptureFile() {
        File file = new File(getCacheDir(), "capture");
        if (!file.exists()) {
            file.mkdirs();
        }
        return new File(file, "scan_" + System.currentTimeMillis() + ".jpg");
    }

    private void notifyNativeCancel() {
        if (this.webView == null) {
            return;
        }
        runOnUiThread(new Runnable() { // from class: com.cet46.coach.MainActivity$$ExternalSyntheticLambda4
            @Override // java.lang.Runnable
            public final void run() {
                m42lambda$notifyNativeCancel$4$comcet46coachMainActivity();
            }
        });
    }

    /* JADX INFO: Access modifiers changed from: private */
    public boolean routeUrl(String str) {
        if (str == null || str.startsWith("http://127.0.0.1:") || str.startsWith("file:///android_asset/")) {
            return false;
        }
        if (!str.startsWith("http://") && !str.startsWith("https://")) {
            return false;
        }
        try {
            startActivity(new Intent("android.intent.action.VIEW", Uri.parse(str)));
            return true;
        } catch (Exception unused) {
            return true;
        }
    }

    private void sendImage(File file) {
        try {
            Bitmap bitmapDecodeForOcr = decodeForOcr(file);
            if (bitmapDecodeForOcr == null) {
                toast("图片解析失败");
                return;
            }
            ByteArrayOutputStream byteArrayOutputStream = new ByteArrayOutputStream();
            bitmapDecodeForOcr.compress(Bitmap.CompressFormat.JPEG, 88, byteArrayOutputStream);
            bitmapDecodeForOcr.recycle();
            String strEncodeToString = Base64.encodeToString(byteArrayOutputStream.toByteArray(), 2);
            StringBuilder sb = new StringBuilder("window.onNativeImage && window.onNativeImage(");
            sb.append(JSONObject.quote("data:image/jpeg;base64," + strEncodeToString));
            sb.append(");");
            final String string = sb.toString();
            runOnUiThread(new Runnable() { // from class: com.cet46.coach.MainActivity$$ExternalSyntheticLambda0
                @Override // java.lang.Runnable
                public final void run() {
                    m44lambda$sendImage$2$comcet46coachMainActivity(string);
                }
            });
        } catch (Throwable th) {
            Log.e(TAG, "sendImage failed", th);
            toast("图片处理失败，请重试");
        }
    }

    private void startServerAndLoad() {
        try {
            LocalServer localServer = new LocalServer(this);
            this.server = localServer;
            localServer.start();
            this.webView.loadUrl("http://127.0.0.1:" + this.server.getPort() + "/index.html");
        } catch (Exception e) {
            Log.e(TAG, "local server failed, falling back to file://", e);
            this.webView.getSettings().setAllowFileAccess(true);
            this.webView.loadUrl("file:///android_asset/www/index.html");
        }
    }

    /* JADX INFO: Access modifiers changed from: private */
    public void toast(final String str) {
        runOnUiThread(new Runnable() { // from class: com.cet46.coach.MainActivity$$ExternalSyntheticLambda3
            @Override // java.lang.Runnable
            public final void run() {
                m45lambda$toast$3$comcet46coachMainActivity(str);
            }
        });
    }

    /* JADX INFO: renamed from: lambda$initTts$0$com-cet46-coach-MainActivity, reason: not valid java name */
    /* synthetic */ void m40lambda$initTts$0$comcet46coachMainActivity(int i) {
        if (i == 0) {
            int language = this.tts.setLanguage(Locale.US);
            this.ttsReady = (language == -1 || language == -2) ? false : true;
        }
    }

    /* JADX INFO: renamed from: lambda$launchCamera$1$com-cet46-coach-MainActivity, reason: not valid java name */
    /* synthetic */ void m41lambda$launchCamera$1$comcet46coachMainActivity(int i) {
        try {
            File fileNewCaptureFile = newCaptureFile();
            this.cameraOutputFile = fileNewCaptureFile;
            this.cameraOutputUri = CaptureProvider.uriFor(this, fileNewCaptureFile);
            Intent intent = new Intent("android.media.action.IMAGE_CAPTURE");
            intent.putExtra("output", this.cameraOutputUri);
            intent.addFlags(3);
            intent.setClipData(ClipData.newRawUri("cet46-photo", this.cameraOutputUri));
            startActivityForResult(intent, i);
        } catch (Exception unused) {
            toast("无法启动相机，请改用相册");
        }
    }

    /* JADX INFO: renamed from: lambda$notifyNativeCancel$4$com-cet46-coach-MainActivity, reason: not valid java name */
    /* synthetic */ void m42lambda$notifyNativeCancel$4$comcet46coachMainActivity() {
        this.webView.evaluateJavascript("window.onNativeCancel && window.onNativeCancel();", null);
    }

    /* JADX INFO: renamed from: lambda$onBackPressed$5$com-cet46-coach-MainActivity, reason: not valid java name */
    /* synthetic */ void m43lambda$onBackPressed$5$comcet46coachMainActivity(String str) {
        if ("\"1\"".equals(str) || "1".equals(str)) {
            return;
        }
        super.onBackPressed();
    }

    /* JADX INFO: renamed from: lambda$sendImage$2$com-cet46-coach-MainActivity, reason: not valid java name */
    /* synthetic */ void m44lambda$sendImage$2$comcet46coachMainActivity(String str) {
        this.webView.evaluateJavascript(str, null);
    }

    /* JADX INFO: renamed from: lambda$toast$3$com-cet46-coach-MainActivity, reason: not valid java name */
    /* synthetic */ void m45lambda$toast$3$comcet46coachMainActivity(String str) {
        Toast.makeText(this, str, 0).show();
    }

    @Override // android.app.Activity
    protected void onActivityResult(int i, int i2, Intent intent) {
        Uri uri;
        super.onActivityResult(i, i2, intent);
        if (i == 203) {
            if (this.filePathCallback != null) {
                this.filePathCallback.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(i2, intent));
                this.filePathCallback = null;
                return;
            }
            return;
        }
        if (i == 204) {
            ValueCallback<Uri[]> valueCallback = this.filePathCallback;
            if (valueCallback != null) {
                valueCallback.onReceiveValue((i2 != -1 || (uri = this.cameraOutputUri) == null) ? null : new Uri[]{uri});
                this.filePathCallback = null;
                return;
            }
            return;
        }
        if (i2 != -1) {
            if (i == 201 || i == 202) {
                notifyNativeCancel();
                return;
            }
            return;
        }
        if (i == 201) {
            File file = this.cameraOutputFile;
            if (file == null || !file.exists()) {
                toast("没有拍到照片");
                return;
            } else {
                sendImage(this.cameraOutputFile);
                return;
            }
        }
        if (i != 202 || intent == null || intent.getData() == null) {
            return;
        }
        try {
            File fileCopyToCache = copyToCache(intent.getData());
            if (fileCopyToCache != null) {
                sendImage(fileCopyToCache);
            }
        } catch (Exception unused) {
            toast("读取图片失败");
        }
    }

    @Override // android.app.Activity
    public void onBackPressed() {
        WebView webView = this.webView;
        if (webView == null) {
            super.onBackPressed();
        } else {
            webView.evaluateJavascript("(window.handleBack && window.handleBack()) ? '1' : '0'", new ValueCallback() { // from class: com.cet46.coach.MainActivity$$ExternalSyntheticLambda5
                @Override // android.webkit.ValueCallback
                public final void onReceiveValue(Object obj) {
                    m43lambda$onBackPressed$5$comcet46coachMainActivity((String) obj);
                }
            });
        }
    }

    @Override // android.app.Activity
    protected void onCreate(Bundle bundle) {
        super.onCreate(bundle);
        Window window = getWindow();
        window.setStatusBarColor(-16033840);
        if (Build.VERSION.SDK_INT >= 26) {
            window.setNavigationBarColor(-1);
            window.getDecorView().setSystemUiVisibility(16);
        } else {
            window.setNavigationBarColor(-16033840);
        }
        FrameLayout frameLayout = new FrameLayout(this);
        frameLayout.setBackgroundColor(-1);
        WebView webView = new WebView(this);
        this.webView = webView;
        frameLayout.addView(webView, new FrameLayout.LayoutParams(-1, -1));
        setContentView(frameLayout);
        WebSettings settings = this.webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(true);
        settings.setLoadsImagesAutomatically(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setSupportZoom(false);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        settings.setSupportMultipleWindows(false);
        settings.setTextZoom(100);
        settings.setMixedContentMode(1);
        settings.setUserAgentString(settings.getUserAgentString() + " CET46Coach/1.0");
        if (Build.VERSION.SDK_INT >= 26) {
            settings.setSafeBrowsingEnabled(false);
        }
        WebView webView2 = this.webView;
        webView2.addJavascriptInterface(new Bridge(), TAG);
        webView2.addJavascriptInterface(new MlKitBridge(this), "CET46ML");
        this.webView.setWebViewClient(new WebViewClient() { // from class: com.cet46.coach.MainActivity.1
            @Override // android.webkit.WebViewClient
            public boolean shouldOverrideUrlLoading(WebView webView3, WebResourceRequest webResourceRequest) {
                return MainActivity.this.routeUrl(webResourceRequest.getUrl().toString());
            }

            @Override // android.webkit.WebViewClient
            public boolean shouldOverrideUrlLoading(WebView webView3, String str) {
                return MainActivity.this.routeUrl(str);
            }
        });
        this.webView.setWebChromeClient(new AnonymousClass2());
        FullDict.prepare(this);
        initTts();
        startServerAndLoad();
    }

    @Override // android.app.Activity
    protected void onDestroy() {
        LocalServer localServer = this.server;
        if (localServer != null) {
            localServer.stop();
        }
        TextToSpeech textToSpeech = this.tts;
        if (textToSpeech != null) {
            textToSpeech.stop();
            this.tts.shutdown();
            this.tts = null;
        }
        WebView webView = this.webView;
        if (webView != null) {
            webView.removeJavascriptInterface(TAG);
            this.webView.loadUrl("about:blank");
            this.webView.destroy();
            this.webView = null;
        }
        super.onDestroy();
    }

    @Override // android.app.Activity
    protected void onPause() {
        WebView webView = this.webView;
        if (webView != null) {
            webView.onPause();
        }
        TextToSpeech textToSpeech = this.tts;
        if (textToSpeech != null) {
            textToSpeech.stop();
        }
        super.onPause();
    }

    @Override // android.app.Activity
    public void onRequestPermissionsResult(int i, String[] strArr, int[] iArr) {
        super.onRequestPermissionsResult(i, strArr, iArr);
        if (i == 100) {
            if (iArr.length <= 0 || iArr[0] != 0) {
                toast("需要相机权限才能拍照，也可以从相册选择");
                notifyNativeCancel();
                return;
            }
            Runnable runnable = this.pendingCameraAction;
            if (runnable != null) {
                this.pendingCameraAction = null;
                runnable.run();
            }
        }
    }

    @Override // android.app.Activity
    protected void onResume() {
        super.onResume();
        WebView webView = this.webView;
        if (webView != null) {
            webView.onResume();
        }
    }
}
