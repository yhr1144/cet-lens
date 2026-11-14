package com.cet46.coach;

import android.content.Context;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.util.Log;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;
import org.json.JSONArray;
import org.json.JSONObject;

/* JADX INFO: loaded from: classes.dex */
public final class FullDict {
    private static final String TAG = "CET46FullDict";
    private static int count;
    private static SQLiteDatabase db;
    private static boolean prepared;

    private FullDict() {
    }

    private static void addRows(Map<String, JSONObject> map, String str, String[] strArr) {
        try {
            Cursor cursorRawQuery = db.rawQuery(str, strArr);
            while (cursorRawQuery.moveToNext()) {
                try {
                    JSONObject jSONObjectRowJson = rowJson(cursorRawQuery);
                    String strOptString = jSONObjectRowJson.optString("key");
                    if (!strOptString.isEmpty() && !map.containsKey(strOptString)) {
                        map.put(strOptString, jSONObjectRowJson);
                        if (map.size() >= 60) {
                            break;
                        }
                    }
                } catch (Throwable th) {
                    if (cursorRawQuery != null) {
                        try {
                            cursorRawQuery.close();
                        } catch (Throwable th2) {
                            Throwable.class.getDeclaredMethod("addSuppressed", Throwable.class).invoke(th, th2);
                        }
                    }
                    throw th;
                }
            }
            if (cursorRawQuery != null) {
                cursorRawQuery.close();
            }
        } catch (Exception unused) {
        }
    }

    /* JADX WARN: Code duplicated, block: B:43:0x0076 A[EXC_TOP_SPLITTER, SYNTHETIC] */
    private static void copyAsset(Context context, String str, File file) throws Exception {
        File file2 = new File(file.getAbsolutePath() + ".tmp");
        InputStream inputStreamOpen = context.getAssets().open(str);
        try {
            FileOutputStream fileOutputStream = new FileOutputStream(file2);
            try {
                byte[] bArr = new byte[131072];
                int i;
                while ((i = inputStreamOpen.read(bArr)) > 0) {
                    fileOutputStream.write(bArr, 0, i);
                }
                fileOutputStream.getFD().sync();
                fileOutputStream.close();
                if (inputStreamOpen != null) {
                    inputStreamOpen.close();
                }
                if (file.exists() && !file.delete()) {
                    throw new Exception("cannot replace dict.db");
                }
                if (!file2.renameTo(file)) {
                    throw new Exception("cannot move dict.db");
                }
            } catch (Throwable th2) {
                try {
                    fileOutputStream.close();
                } catch (Throwable th3) {
                    Throwable.class.getDeclaredMethod("addSuppressed", Throwable.class).invoke(th2, th3);
                }
                throw th2;
            }
        } catch (Throwable th4) {
            if (inputStreamOpen != null) {
                inputStreamOpen.close();
            }
            throw th4;
        }
    }

    public static synchronized int count() {
        return count;
    }

    public static synchronized String lookup(String str) {
        if (db == null) {
            return "";
        }
        String strNormalize = normalize(str);
        if (strNormalize.isEmpty()) {
            return "";
        }
        String str2 = "head";
        Cursor cursorQueryExact = queryExact(strNormalize);
        if (cursorQueryExact == null || !cursorQueryExact.moveToFirst()) {
            if (cursorQueryExact != null) {
                cursorQueryExact.close();
            }
            String[] strArrStems = stems(strNormalize);
            int length = strArrStems.length;
            int i = 0;
            while (i < length) {
                cursorQueryExact = queryExact(strArrStems[i]);
                if (cursorQueryExact != null && cursorQueryExact.moveToFirst()) {
                    str2 = "stem";
                    break;
                }
                if (cursorQueryExact != null) {
                    cursorQueryExact.close();
                }
                i++;
                cursorQueryExact = null;
            }
        }
        if (cursorQueryExact == null) {
            return "";
        }
        try {
            try {
                JSONObject jSONObject = new JSONObject();
                jSONObject.put("head", cursorQueryExact.getString(cursorQueryExact.getColumnIndexOrThrow("key")));
                jSONObject.put("matchedBy", str2);
                jSONObject.put("entry", rowJson(cursorQueryExact));
                String string = jSONObject.toString();
                cursorQueryExact.close();
                return string;
            } catch (Exception unused) {
                cursorQueryExact.close();
                return "";
            }
        } catch (Throwable th) {
            cursorQueryExact.close();
            throw th;
        }
    }

    private static String normalize(String str) {
        return str == null ? "" : str.replace('\u2019', '\'').replace('\u2018', '\'').trim().toLowerCase(Locale.US).replaceAll("\\s+", " ").replaceAll("^[^a-z]+", "").replaceAll("[^a-z'. -]+$", "").replaceAll("[.'-]+$", "").trim();
    }

    public static synchronized void prepare(Context context) {
        if (prepared) {
            return;
        }
        prepared = true;
        try {
            File filesDir = context.getFilesDir();
            File file = new File(filesDir, "dict.db");
            File file2 = new File(filesDir, "dict.version");
            String strTrim = readAssetText(context, "dict.version").trim();
            String strTrim2 = file2.exists() ? readText(file2).trim() : "";
            if (!file.exists() || !strTrim.equals(strTrim2)) {
                copyAsset(context, "dict.db", file);
                writeText(file2, strTrim);
            }
            SQLiteDatabase sQLiteDatabaseOpenDatabase = SQLiteDatabase.openDatabase(file.getAbsolutePath(), null, 1);
            db = sQLiteDatabaseOpenDatabase;
            Cursor cursorRawQuery = sQLiteDatabaseOpenDatabase.rawQuery("SELECT count(*) FROM words", null);
            if (cursorRawQuery.moveToFirst()) {
                count = cursorRawQuery.getInt(0);
            }
            cursorRawQuery.close();
            Log.i(TAG, "full dictionary ready: " + count);
        } catch (Throwable th) {
            Log.e(TAG, "full dictionary unavailable", th);
            count = 0;
            db = null;
        }
    }

    private static Cursor queryExact(String str) {
        try {
            return db.rawQuery("SELECT * FROM words WHERE key=? LIMIT 1", new String[]{str});
        } catch (Exception unused) {
            return null;
        }
    }

    private static String readAssetText(Context context, String str) {
        try {
            InputStream inputStreamOpen = context.getAssets().open(str);
            try {
                byte[] bArr = new byte[256];
                int i = inputStreamOpen.read(bArr);
                String str2 = i <= 0 ? "" : new String(bArr, 0, i, StandardCharsets.UTF_8);
                if (inputStreamOpen != null) {
                    inputStreamOpen.close();
                }
                return str2;
            } catch (Throwable th) {
                if (inputStreamOpen != null) {
                    try {
                        inputStreamOpen.close();
                    } catch (Throwable th2) {
                        Throwable.class.getDeclaredMethod("addSuppressed", Throwable.class).invoke(th, th2);
                    }
                }
                throw th;
            }
        } catch (Exception unused) {
            return "";
        }
    }

    private static String readText(File file) {
        try {
            FileInputStream fileInputStream = new FileInputStream(file);
            try {
                byte[] bArr = new byte[(int) Math.min(256L, file.length())];
                int i = fileInputStream.read(bArr);
                String str = i <= 0 ? "" : new String(bArr, 0, i, StandardCharsets.UTF_8);
                fileInputStream.close();
                return str;
            } catch (Throwable th) {
                try {
                    fileInputStream.close();
                } catch (Throwable th2) {
                    Throwable.class.getDeclaredMethod("addSuppressed", Throwable.class).invoke(th, th2);
                }
                throw th;
            }
        } catch (Exception unused) {
            return "";
        }
    }

    private static JSONObject rowJson(Cursor cursor) throws Exception {
        JSONObject jSONObject = new JSONObject();
        String string = cursor.getString(cursor.getColumnIndexOrThrow("key"));
        jSONObject.put("key", string);
        jSONObject.put("word", string);
        jSONObject.put("p", cursor.getString(cursor.getColumnIndexOrThrow("phonetic")));
        jSONObject.put("tr", cursor.getString(cursor.getColumnIndexOrThrow("translation")));
        jSONObject.put("de", cursor.getString(cursor.getColumnIndexOrThrow("definition")));
        jSONObject.put("t", cursor.getString(cursor.getColumnIndexOrThrow("tag")));
        jSONObject.put("l", cursor.getInt(cursor.getColumnIndexOrThrow("level")));
        jSONObject.put("f", cursor.getInt(cursor.getColumnIndexOrThrow("frq")));
        jSONObject.put("b", cursor.getInt(cursor.getColumnIndexOrThrow("bnc")));
        jSONObject.put("c", cursor.getInt(cursor.getColumnIndexOrThrow("collins")));
        jSONObject.put("o", cursor.getInt(cursor.getColumnIndexOrThrow("oxford")));
        jSONObject.put("fm", cursor.getString(cursor.getColumnIndexOrThrow("exchange")));
        jSONObject.put("y", cursor.getString(cursor.getColumnIndexOrThrow("syn")));
        return jSONObject;
    }

    public static synchronized String search(String str, int i) {
        if (db == null) {
            return "[]";
        }
        if (str == null) {
            str = "";
        }
        String lowerCase = String.valueOf(str).trim().toLowerCase(Locale.US);
        if (lowerCase.isEmpty()) {
            return "[]";
        }
        boolean zMatches = lowerCase.matches(".*[\\u4e00-\\u9fff].*");
        int iMax = Math.max(1, Math.min(60, i));
        LinkedHashMap linkedHashMap = new LinkedHashMap();
        try {
            if (zMatches) {
                addRows(linkedHashMap, "SELECT * FROM words WHERE translation LIKE ? LIMIT ?", new String[]{"%" + lowerCase + "%", String.valueOf(iMax)});
            } else {
                addRows(linkedHashMap, "SELECT * FROM words WHERE key = ? LIMIT 1", new String[]{lowerCase});
                addRows(linkedHashMap, "SELECT * FROM words WHERE key LIKE ? LIMIT ?", new String[]{lowerCase + "%", String.valueOf(iMax)});
                if (linkedHashMap.size() < iMax) {
                    addRows(linkedHashMap, "SELECT * FROM words WHERE key LIKE ? LIMIT ?", new String[]{"%" + lowerCase + "%", String.valueOf(iMax)});
                }
            }
            JSONArray jSONArray = new JSONArray();
            Iterator it = linkedHashMap.values().iterator();
            while (it.hasNext()) {
                jSONArray.put((JSONObject) it.next());
                if (jSONArray.length() >= iMax) {
                    break;
                }
            }
            return jSONArray.toString();
        } catch (Exception e) {
            Log.w(TAG, "search failed", e);
            return "[]";
        }
    }

    private static String[] stems(String str) {
        ArrayList arrayList = new ArrayList();
        if (str.endsWith("ies") && str.length() > 4) {
            arrayList.add(str.substring(0, str.length() - 3) + "y");
        }
        if (str.endsWith("ves") && str.length() > 4) {
            arrayList.add(str.substring(0, str.length() - 3) + "f");
            arrayList.add(str.substring(0, str.length() - 3) + "fe");
        }
        if (str.endsWith("es") && str.length() > 3) {
            arrayList.add(str.substring(0, str.length() - 2));
            arrayList.add(str.substring(0, str.length() - 1));
        }
        if (str.endsWith("s") && str.length() > 3) {
            arrayList.add(str.substring(0, str.length() - 1));
        }
        if (str.endsWith("ied") && str.length() > 4) {
            arrayList.add(str.substring(0, str.length() - 3) + "y");
        }
        if (str.endsWith("ed") && str.length() > 4) {
            arrayList.add(str.substring(0, str.length() - 2));
            arrayList.add(str.substring(0, str.length() - 1));
            if (str.matches(".*([b-df-hj-np-tv-z])\\1ed")) {
                arrayList.add(str.substring(0, str.length() - 3));
            }
        }
        if (str.endsWith("ing") && str.length() > 5) {
            arrayList.add(str.substring(0, str.length() - 3));
            arrayList.add(str.substring(0, str.length() - 3) + "e");
            if (str.matches(".*([b-df-hj-np-tv-z])\\1ing")) {
                arrayList.add(str.substring(0, str.length() - 4));
            }
        }
        if (str.endsWith("ly") && str.length() > 4) {
            arrayList.add(str.substring(0, str.length() - 2));
        }
        return (String[]) arrayList.toArray(new String[0]);
    }

    private static void writeText(File file, String str) {
        try {
            FileOutputStream fileOutputStream = new FileOutputStream(file);
            try {
                fileOutputStream.write(str.getBytes(StandardCharsets.UTF_8));
                fileOutputStream.close();
            } catch (Throwable th) {
                try {
                    fileOutputStream.close();
                } catch (Throwable th2) {
                    Throwable.class.getDeclaredMethod("addSuppressed", Throwable.class).invoke(th, th2);
                }
                throw th;
            }
        } catch (Exception unused) {
        }
    }
}
