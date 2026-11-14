package com.cet46.coach;

import android.content.Context;
import android.content.res.AssetManager;
import android.util.Log;
import java.io.BufferedInputStream;
import java.io.BufferedOutputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.lang.reflect.InvocationTargetException;
import java.net.InetAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;

/* JADX INFO: loaded from: classes.dex */
public final class LocalServer {
    private static final String ROOT = "www/";
    private static final String TAG = "CET46Server";
    private final AssetManager assets;
    private final Context context;
    private final Map<String, String> mime;
    private int port = -1;
    private volatile boolean running;
    private ServerSocket server;
    private Thread thread;

    public LocalServer(Context context) {
        HashMap map = new HashMap();
        this.mime = map;
        Context applicationContext = context.getApplicationContext();
        this.context = applicationContext;
        this.assets = applicationContext.getAssets();
        map.put("html", "text/html; charset=utf-8");
        map.put("htm", "text/html; charset=utf-8");
        map.put("js", "text/javascript; charset=utf-8");
        map.put("mjs", "text/javascript; charset=utf-8");
        map.put("css", "text/css; charset=utf-8");
        map.put("json", "application/json; charset=utf-8");
        map.put("svg", "image/svg+xml");
        map.put("png", "image/png");
        map.put("jpg", "image/jpeg");
        map.put("jpeg", "image/jpeg");
        map.put("webp", "image/webp");
        map.put("ico", "image/x-icon");
        map.put("wasm", "application/wasm");
        map.put("gz", "application/gzip");
        map.put("data", "application/octet-stream");
        map.put("txt", "text/plain; charset=utf-8");
    }

    /* JADX INFO: Access modifiers changed from: private */
    /* JADX INFO: renamed from: handle, reason: merged with bridge method [inline-methods] */
    public void m38lambda$start$0$comcet46coachLocalServer(Socket socket) {
        String line;
        byte[] asset;
        try {
            try {
                socket.setSoTimeout(10000);
                BufferedInputStream bufferedInputStream = new BufferedInputStream(socket.getInputStream());
                String line2 = readLine(bufferedInputStream, 8192);
                if (line2 == null) {
                    if (socket != null) {
                        socket.close();
                        return;
                    }
                    return;
                }
                String[] strArrSplit = line2.split(" ");
                if (strArrSplit.length < 2) {
                    if (socket != null) {
                        socket.close();
                        return;
                    }
                    return;
                }
                String upperCase = strArrSplit[0].toUpperCase(Locale.US);
                String strSubstring = strArrSplit[1];
                do {
                    line = readLine(bufferedInputStream, 8192);
                    if (line == null) {
                        break;
                    }
                } while (!line.isEmpty());
                if (!"GET".equals(upperCase) && !"HEAD".equals(upperCase)) {
                    writeError(socket.getOutputStream(), 405, "Method Not Allowed", upperCase);
                    if (socket != null) {
                        socket.close();
                        return;
                    }
                    return;
                }
                int iIndexOf = strSubstring.indexOf(63);
                if (iIndexOf >= 0) {
                    strSubstring = strSubstring.substring(0, iIndexOf);
                }
                int iIndexOf2 = strSubstring.indexOf(35);
                if (iIndexOf2 >= 0) {
                    strSubstring = strSubstring.substring(0, iIndexOf2);
                }
                String strDecode = URLDecoder.decode(strSubstring, "UTF-8");
                if (strDecode.startsWith("/")) {
                    strDecode = strDecode.substring(1);
                }
                String str = "index.html";
                if (strDecode.isEmpty()) {
                    strDecode = "index.html";
                }
                if (strDecode.contains("..") || strDecode.startsWith("/") || strDecode.contains("\\")) {
                    writeError(socket.getOutputStream(), 403, "Forbidden", strDecode);
                    if (socket != null) {
                        socket.close();
                        return;
                    }
                    return;
                }
                try {
                    asset = readAsset(ROOT + strDecode);
                    str = strDecode;
                } catch (IOException unused) {
                    if (strDecode.contains(".")) {
                        writeError(socket.getOutputStream(), 404, "Not Found", strDecode);
                        if (socket != null) {
                            socket.close();
                            return;
                        }
                        return;
                    }
                    try {
                        asset = readAsset("www/index.html");
                    } catch (IOException unused2) {
                        writeError(socket.getOutputStream(), 404, "Not Found", strDecode);
                        if (socket != null) {
                            socket.close();
                            return;
                        }
                        return;
                    }
                }
                int iLastIndexOf = str.lastIndexOf(46);
                String orDefault = this.mime.getOrDefault(iLastIndexOf >= 0 ? str.substring(iLastIndexOf + 1).toLowerCase(Locale.US) : "", "application/octet-stream");
                BufferedOutputStream bufferedOutputStream = new BufferedOutputStream(socket.getOutputStream());
                bufferedOutputStream.write(("HTTP/1.1 200 OK\r\nContent-Type: " + orDefault + "\r\nContent-Length: " + asset.length + "\r\nCache-Control: no-cache\r\nAccess-Control-Allow-Origin: *\r\nConnection: close\r\n\r\n").getBytes(StandardCharsets.UTF_8));
                if (!"HEAD".equals(upperCase)) {
                    bufferedOutputStream.write(asset);
                }
                bufferedOutputStream.flush();
                if (socket != null) {
                    socket.close();
                    return;
                }
                return;
            } catch (Throwable th) {
                if (socket != null) {
                    try {
                        socket.close();
                    } catch (Throwable th2) {
                        Throwable.class.getDeclaredMethod("addSuppressed", Throwable.class).invoke(th, th2);
                    }
                }
                throw th;
            }
        } catch (Exception e) {
            Log.w(TAG, "request failed", e);
        }
    }

    /* JADX WARN: Code duplicated, block: B:32:0x0034 A[EXC_TOP_SPLITTER, SYNTHETIC] */
    private byte[] readAsset(String str) throws IllegalAccessException, IOException, InvocationTargetException, NoSuchMethodException {
        InputStream inputStreamOpen = this.assets.open(str);
        try {
            ByteArrayOutputStream byteArrayOutputStream = new ByteArrayOutputStream();
            try {
                byte[] bArr = new byte[8192];
                while (true) {
                    int i = inputStreamOpen.read(bArr);
                    if (i <= 0) {
                        break;
                    }
                    byteArrayOutputStream.write(bArr, 0, i);                }
                byte[] byteArray = byteArrayOutputStream.toByteArray();
                byteArrayOutputStream.close();
                if (inputStreamOpen != null) {
                    inputStreamOpen.close();
                }
                return byteArray;
            } catch (Throwable th2) {
                try {
                    byteArrayOutputStream.close();
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

    private static String readLine(InputStream inputStream, int i) throws IOException {
        int i2;
        ByteArrayOutputStream byteArrayOutputStream = new ByteArrayOutputStream();
        do {
            i2 = inputStream.read();
            if (i2 == -1 || i2 == 10) {
                break;
            }
            if (i2 != 13) {
                byteArrayOutputStream.write(i2);
            }
        } while (byteArrayOutputStream.size() <= i);
        if (i2 == -1 && byteArrayOutputStream.size() == 0) {
            return null;
        }
        return byteArrayOutputStream.toString("UTF-8");
    }

    private static void writeError(OutputStream outputStream, int i, String str, String str2) throws IOException {
        byte[] bytes = ("<h1>" + i + " " + str + "</h1><p>" + str2 + "</p>").getBytes(StandardCharsets.UTF_8);
        outputStream.write(("HTTP/1.1 " + i + " " + str + "\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: " + bytes.length + "\r\nConnection: close\r\n\r\n").getBytes(StandardCharsets.UTF_8));
        outputStream.write(bytes);
        outputStream.flush();
    }

    public int getPort() {
        return this.port;
    }

    /* JADX INFO: renamed from: lambda$start$1$com-cet46-coach-LocalServer, reason: not valid java name */
    /* synthetic */ void m39lambda$start$1$comcet46coachLocalServer() {
        while (this.running) {
            try {
                final Socket socketAccept = this.server.accept();
                Thread thread = new Thread(new Runnable() { // from class: com.cet46.coach.LocalServer$$ExternalSyntheticLambda1
                    @Override // java.lang.Runnable
                    public final void run() {
                        m38lambda$start$0$comcet46coachLocalServer(socketAccept);
                    }
                });
                thread.setDaemon(true);
                thread.start();
            } catch (IOException e) {
                if (this.running) {
                    Log.w(TAG, "accept failed", e);
                }
            }
        }
    }

    public synchronized void start() throws IOException {
        if (this.running) {
            return;
        }
        try {
            ServerSocket serverSocket = new ServerSocket(19003, 50, InetAddress.getByName("127.0.0.1"));
            this.server = serverSocket;
            serverSocket.setReuseAddress(true);
            this.port = this.server.getLocalPort();
            this.running = true;
            Thread thread = new Thread(new Runnable() { // from class: com.cet46.coach.LocalServer$$ExternalSyntheticLambda0
                @Override // java.lang.Runnable
                public final void run() {
                    m39lambda$start$1$comcet46coachLocalServer();
                }
            }, "cet46-http");
            this.thread = thread;
            thread.setDaemon(true);
            this.thread.start();
            Log.i(TAG, "serving on http://127.0.0.1:" + this.port);
        } catch (IOException unused) {
            this.port = 19003;
        }
    }

    public synchronized void stop() {
        this.running = false;
        try {
            ServerSocket serverSocket = this.server;
            if (serverSocket != null) {
                serverSocket.close();
            }
        } catch (IOException unused) {
        }
        this.server = null;
    }
}
