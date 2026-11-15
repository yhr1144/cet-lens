param(
    [string]$KsPass = $env:CET46_KS_PASS
)

if (-not $KsPass) { $KsPass = $env:CET46_KS_PASS }

$ErrorActionPreference = 'Stop'

$Base = Split-Path -Parent $MyInvocation.MyCommand.Path
$Root = $Base
$Jdk = Join-Path $Root 'build-tools\jdk-17.0.2'
$Sdk = Join-Path $Root 'build-tools\android-sdk'
$Bt = Join-Path $Sdk 'build-tools\35.0.0'
$Platform = Join-Path $Sdk 'platforms\android-35'
$App = Join-Path $Root 'app\src\main'
$Build = Join-Path $Root 'build'
$Dist = Join-Path $Root 'dist'
$AarDir = Join-Path $Root 'vendor\aar'
# Python 解释器：优先环境变量，其次 PATH 里的真 python（跳过 Windows 商店占位符）
$Py = $env:CET46_PYTHON
if (-not $Py -or -not (Test-Path $Py)) {
    $cand = Get-Command python -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($cand -and $cand.Source -notmatch 'WindowsApps') { $Py = $cand.Source }
}
if (-not $Py -or -not (Test-Path $Py)) {
    throw ' 找不到可用的 Python：请设置 $env:CET46_PYTHON = "python.exe 的完整路径"'
}

$VersionCode = 7
$VersionName = '1.2.3'

$env:JAVA_HOME = $Jdk
$env:PATH = (Join-Path $Jdk 'bin') + ';' + $env:PATH

foreach ($p in @($Jdk, $Sdk, $Bt, $Platform, $App)) {
    if (-not (Test-Path $p)) { throw "missing path: $p" }
}
New-Item -ItemType Directory -Force -Path $Build, $Dist | Out-Null
$BuildRes = Join-Path $Build 'res.zip'
$Gen = Join-Path $Build 'gen'
$Classes = Join-Path $Build 'classes'
$DexDir = Join-Path $Build 'dex'
$Unsigned = Join-Path $Build 'app-unsigned.apk'
$WithDex = Join-Path $Build 'app-with-dex.apk'
$Aligned = Join-Path $Build 'app-aligned.apk'
$Keystore = Join-Path $Root 'release.keystore'
$Final = Join-Path $Dist ("cet46-coach-{0}.apk" -f $VersionName)

Remove-Item -Recurse -Force $Gen, $Classes, $DexDir -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force -Path $Gen, $Classes, $DexDir | Out-Null

Write-Host '==> unpack AAR payloads'
$AarOut = Join-Path $Build 'aar'
Remove-Item -Recurse -Force $AarOut -ErrorAction SilentlyContinue
& $Py (Join-Path $Root 'scripts\aar_tools.py') payload $AarOut (Get-ChildItem $AarDir -Filter *.aar | ForEach-Object { $_.FullName })
if ($LASTEXITCODE -ne 0) { throw 'aar payload failed' }
$AarJars = @(Get-ChildItem (Join-Path $AarOut 'cp') -Filter *.jar | ForEach-Object { $_.FullName })
$AarJars += @(Get-ChildItem (Join-Path $Root 'vendor\jar') -Filter *.jar -ErrorAction SilentlyContinue | ForEach-Object { $_.FullName })

Write-Host '==> aapt2 compile resources'
& (Join-Path $Bt 'aapt2.exe') compile --dir (Join-Path $App 'res') -o $BuildRes
if ($LASTEXITCODE -ne 0) { throw 'aapt2 compile failed' }

$AarResZips = @()
$i = 0
foreach ($dir in @(Get-ChildItem (Join-Path $AarOut 'res') -Directory -ErrorAction SilentlyContinue)) {
    $i++
    $zip = Join-Path $Build ("aar-res-{0}.zip" -f $i)
    & (Join-Path $Bt 'aapt2.exe') compile --dir $dir.FullName -o $zip
    if ($LASTEXITCODE -ne 0) { throw "aapt2 compile failed: $($dir.Name)" }
    $AarResZips += $zip
}

Write-Host '==> aapt2 link'
$LinkArgs = @(
    'link', '-o', $Unsigned,
    '-I', (Join-Path $Platform 'android.jar'),
    '--manifest', (Join-Path $App 'AndroidManifest.xml'),
    '-R', $BuildRes,
    '-A', (Join-Path $App 'assets'),
    '--java', $Gen,
    '--auto-add-overlay',
    '--min-sdk-version', '24',
    '--target-sdk-version', '35',
    '--version-code', "$VersionCode",
    '--version-name', $VersionName
)
foreach ($zip in $AarResZips) { $LinkArgs += @('-R', $zip) }
& (Join-Path $Bt 'aapt2.exe') @LinkArgs
if ($LASTEXITCODE -ne 0) { throw 'aapt2 link failed' }

Write-Host '==> merge AAR assets + native libs'
$WithLibs = Join-Path $Build 'app-with-libs.apk'
& $Py (Join-Path $Root 'scripts\aar_tools.py') merge $Unsigned $AarOut $WithLibs
if ($LASTEXITCODE -ne 0) { throw 'aar merge failed' }

Write-Host '==> javac'
$Sources = @(Get-ChildItem (Join-Path $App 'java') -Recurse -Filter *.java | ForEach-Object { $_.FullName })
$RSources = @(Get-ChildItem $Gen -Recurse -Filter *.java | ForEach-Object { $_.FullName })
$AllSources = $Sources + $RSources
$CpStr = (@((Join-Path $Platform 'android.jar')) + $AarJars) -join ';'
# javac 的提示写在 stderr，PowerShell 会把它当成错误。改用 Start-Process 接管，
# 只依据退出码判断成功与否，失败时把 stderr 打出来。
# javac 的提示写在 stderr，PowerShell 会当成错误；改用 Start-Process 只看退出码
$javacArgs = @(
    '-encoding', 'UTF-8',
    '-source', '8', '-target', '8',
    '-classpath', $CpStr,
    '-Xlint:-options',
    '-d', $Classes
) + $AllSources
$javacOut = Join-Path $Build 'javac.out'
$javacErr = Join-Path $Build 'javac.err'
$jp = Start-Process -FilePath (Join-Path $Jdk 'bin\javac.exe') -ArgumentList $javacArgs `
    -NoNewWindow -Wait -PassThru `
    -RedirectStandardOutput $javacOut -RedirectStandardError $javacErr
if ($jp.ExitCode -ne 0) {
    if (Test-Path $javacErr) { Get-Content $javacErr | Write-Host }
    if (Test-Path $javacOut) { Get-Content $javacOut | Write-Host }
    throw 'javac failed'
}

Write-Host '==> d8'
$ClassFiles = @(Get-ChildItem $Classes -Recurse -Filter *.class | ForEach-Object { $_.FullName })
$D8Jar = Join-Path $Bt 'lib\d8.jar'
& (Join-Path $Jdk 'bin\java.exe') -cp $D8Jar com.android.tools.r8.D8 `
    --release `
    --min-api 24 `
    --lib (Join-Path $Platform 'android.jar') `
    --output $DexDir `
    ($ClassFiles + $AarJars)
if ($LASTEXITCODE -ne 0) { throw 'd8 failed' }

Write-Host '==> add classes.dex'
& $Py (Join-Path $Root 'scripts\add_dex.py') $WithLibs (Join-Path $DexDir 'classes.dex') $WithDex
if ($LASTEXITCODE -ne 0) { throw 'add dex failed' }

Write-Host '==> zipalign'
& (Join-Path $Bt 'zipalign.exe') -f -p 4 $WithDex $Aligned
if ($LASTEXITCODE -ne 0) { throw 'zipalign failed' }

# 签名口令只从环境变量读，不写进仓库。
$KsPass = $env:CET46_KS_PASS
if ([string]::IsNullOrWhiteSpace($KsPass)) {
    throw '请先设置签名口令环境变量再构建：$env:CET46_KS_PASS = "你的口令"'
}

if (-not (Test-Path $Keystore)) {
    Write-Host '==> generate signing key'
    & (Join-Path $Jdk 'bin\keytool.exe') -genkeypair `
        -keystore $Keystore `
        -alias cet46 `
        -keyalg RSA `
        -keysize 2048 `
        -validity 10000 `
        -storepass $KsPass `
        -keypass $KsPass `
        -dname 'CN=CET46 Coach, OU=Study, O=CET46, L=Beijing, ST=Beijing, C=CN'
    if ($LASTEXITCODE -ne 0) { throw 'keytool failed' }
}

Write-Host '==> apksigner'
& (Join-Path $Bt 'apksigner.bat') sign `
    --ks $Keystore `
    --ks-key-alias cet46 `
    --ks-pass pass:$KsPass `
    --key-pass pass:$KsPass `
    --out $Final `
    $Aligned
if ($LASTEXITCODE -ne 0) { throw 'apksigner failed' }

Write-Host '==> verify'
& (Join-Path $Bt 'apksigner.bat') verify --verbose --print-certs $Final
if ($LASTEXITCODE -ne 0) { throw 'apksigner verify failed' }

& (Join-Path $Bt 'aapt2.exe') dump badging $Final | Select-Object -First 12
Write-Host ''
Write-Host "APK: $Final"
Write-Host ("Size: {0:N1} MB" -f ((Get-Item $Final).Length / 1MB))



