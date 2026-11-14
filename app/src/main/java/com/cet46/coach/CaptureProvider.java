package com.cet46.coach;

import android.content.ContentProvider;
import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import android.webkit.MimeTypeMap;
import java.io.File;
import java.io.FileNotFoundException;

/* JADX INFO: loaded from: classes.dex */
public class CaptureProvider extends ContentProvider {
    private static final String DIR = "capture";

    private Context appContext() {
        Context context = getContext();
        if (context != null) {
            return context;
        }
        throw new IllegalStateException("no context");
    }

    private File fileFor(Uri uri) throws FileNotFoundException {
        String lastPathSegment = uri.getLastPathSegment();
        if (lastPathSegment == null || lastPathSegment.contains("/") || lastPathSegment.contains("..")) {
            throw new FileNotFoundException("bad name");
        }
        File file = new File(appContext().getCacheDir(), DIR);
        if (file.exists() || file.mkdirs()) {
            return new File(file, lastPathSegment);
        }
        throw new FileNotFoundException("no cache dir");
    }

    public static Uri uriFor(Context context, File file) {
        return new Uri.Builder().scheme("content").authority(context.getPackageName() + ".capture").appendPath(file.getName()).build();
    }

    @Override // android.content.ContentProvider
    public int delete(Uri uri, String str, String[] strArr) {
        return 0;
    }

    @Override // android.content.ContentProvider
    public String getType(Uri uri) {
        String lastPathSegment = uri.getLastPathSegment();
        if (lastPathSegment == null) {
            return "image/jpeg";
        }
        String mimeTypeFromExtension = MimeTypeMap.getSingleton().getMimeTypeFromExtension(MimeTypeMap.getFileExtensionFromUrl(lastPathSegment));
        return mimeTypeFromExtension != null ? mimeTypeFromExtension : "image/jpeg";
    }

    @Override // android.content.ContentProvider
    public Uri insert(Uri uri, ContentValues contentValues) {
        return null;
    }

    @Override // android.content.ContentProvider
    public boolean onCreate() {
        return true;
    }

    @Override // android.content.ContentProvider
    public ParcelFileDescriptor openFile(Uri uri, String str) throws FileNotFoundException {
        return ParcelFileDescriptor.open(fileFor(uri), ParcelFileDescriptor.parseMode(str));
    }

    @Override // android.content.ContentProvider
    public Cursor query(Uri uri, String[] strArr, String str, String[] strArr2, String str2) {
        return null;
    }

    @Override // android.content.ContentProvider
    public int update(Uri uri, ContentValues contentValues, String str, String[] strArr) {
        return 0;
    }
}
