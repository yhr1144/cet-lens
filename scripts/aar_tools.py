"""Unpack AAR payloads for the plain javac/aapt2/d8 build.

  payload  <outdir> <aar> [<aar> ...]   -> outdir/cp/*.jar, outdir/res/<aar>/, outdir/assets/, outdir/jni/
  merge    <apk_in> <outdir> <apk_out>  -> injects outdir/assets/* and outdir/jni/* into the APK
"""
import os
import sys
import zipfile

RES_PREFIX = "res/"
ASSETS_PREFIX = "assets/"
JNI_PREFIX = "jni/"


def payload(outdir, aars):
    cp = os.path.join(outdir, "cp")
    res = os.path.join(outdir, "res")
    assets = os.path.join(outdir, "assets")
    jni = os.path.join(outdir, "jni")
    for d in (cp, res, assets, jni):
        os.makedirs(d, exist_ok=True)
    for aar in aars:
        name = os.path.splitext(os.path.basename(aar))[0]
        with zipfile.ZipFile(aar) as z:
            names = z.namelist()
            if "classes.jar" in names:
                with open(os.path.join(cp, name + ".jar"), "wb") as f:
                    f.write(z.read("classes.jar"))
            for entry in names:
                rel = None
                if entry.startswith(RES_PREFIX) and not entry.endswith("/"):
                    rel = os.path.join(res, name, entry[len(RES_PREFIX):])
                elif entry.startswith(ASSETS_PREFIX) and not entry.endswith("/"):
                    rel = os.path.join(assets, entry[len(ASSETS_PREFIX):])
                elif entry.startswith(JNI_PREFIX) and not entry.endswith("/"):
                    rel = os.path.join(jni, entry[len(JNI_PREFIX):])
                if not rel:
                    continue
                os.makedirs(os.path.dirname(rel), exist_ok=True)
                with open(rel, "wb") as f:
                    f.write(z.read(entry))
        print("payload", name)


def merge(apk_in, outdir, apk_out):
    assets = os.path.join(outdir, "assets")
    jni = os.path.join(outdir, "jni")
    extra = []
    for root, _dirs, files in os.walk(assets):
        for fn in files:
            src = os.path.join(root, fn)
            arc = "assets/" + os.path.relpath(src, assets).replace(os.sep, "/")
            extra.append((src, arc))
    for root, _dirs, files in os.walk(jni):
        for fn in files:
            src = os.path.join(root, fn)
            arc = "lib/" + os.path.relpath(src, jni).replace(os.sep, "/")
            extra.append((src, arc))
    existing = set()
    with zipfile.ZipFile(apk_in) as zin:
        existing = set(zin.namelist())
    tmp = apk_out + ".tmp"
    with zipfile.ZipFile(apk_in) as zin, zipfile.ZipFile(tmp, "w", zipfile.ZIP_DEFLATED) as zout:
        for item in zin.infolist():
            zout.writestr(item, zin.read(item.filename))
        added = 0
        for src, arc in extra:
            if arc in existing:
                continue
            info = zipfile.ZipInfo(arc)
            info.compress_type = zipfile.ZIP_STORED if arc.endswith(".so") else zipfile.ZIP_DEFLATED
            info.external_attr = 0o644 << 16
            with open(src, "rb") as f:
                zout.writestr(info, f.read())
            added += 1
    os.replace(tmp, apk_out)
    print("merged", added, "entries ->", apk_out, os.path.getsize(apk_out))


if __name__ == "__main__":
    if len(sys.argv) < 4:
        print(__doc__)
        sys.exit(2)
    cmd = sys.argv[1]
    if cmd == "payload":
        payload(sys.argv[2], sys.argv[3:])
    elif cmd == "merge":
        merge(sys.argv[2], sys.argv[3], sys.argv[4])
    else:
        print(__doc__)
        sys.exit(2)
