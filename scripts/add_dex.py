# Add classes.dex to an APK produced by aapt2 link, preserving zip structure.
import sys, zipfile, shutil, os
apk_in, dex, apk_out = sys.argv[1], sys.argv[2], sys.argv[3]
tmp = apk_out + ".tmp"
with zipfile.ZipFile(apk_in, "r") as zin, zipfile.ZipFile(tmp, "w", zipfile.ZIP_DEFLATED) as zout:
    for item in zin.infolist():
        data = zin.read(item.filename)
        zout.writestr(item, data)
    zout.write(dex, "classes.dex")
os.replace(tmp, apk_out)
print("wrote", apk_out, os.path.getsize(apk_out))
