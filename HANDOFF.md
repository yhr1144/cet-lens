# CET Lens 交接说明

> 给新会话看的。读这一份 + `README.md` 就能接上，不用翻旧对话。

## 项目是什么

四六级精读 / 判分 Android App，中文名「四六级智学」，英文名 CET Lens。单 APK、离线优先、无需账号。功能全貌见 `README.md`。

## 目录

| 路径 | 内容 |
| --- | --- |
| `app/src/main/assets/www/` | 前端主体（HTML / JS / CSS），大部分改动在这里 |
| `app/src/main/` | Android 壳、manifest、资源 |
| `build.ps1` | 一键构建：aapt2 → dex → 对齐 → 签名，产物写 `dist/四六级智学-v1.1.0.apk` |
| `dist/` | 已发布 APK（v1.1.0，30MB 与 53MB 两份）+ 界面截图 |
| `promo/` | 宣传片：`cet-lens-promo*.mp4` 三个版本、`make_promo_wide2.py` 等生成脚本、音轨、海报 |
| `release.keystore` | 发布签名 |
| `README.md` | 功能、安装、评分口径、数据许可 |

## 当前状态

- v1.1.0 已构建并签名，dist 里有成品 APK。
- 产品决策：
  - **只保留 DeepSeek**，不再给用户选其他 AI。
  - 扫描页、批改页**不显示 DeepSeek 品牌**，也**不放「清除 key」**。
  - 普通模式 = ML Kit 离线识别，免费、不联网；只有「AI 精准扫描」「AI 批改」走 DeepSeek。
- 成本口径：中度使用约 1–2 元/月，充 6 元能用 4–5 个月（高峰价估算，误差 ±50%）。
- **2026-11-12 已落地** P0-1/2/3/5/6 与 P1-7/8/9(三档)/10/11，明细见 `OPTIMIZE-mobile-2026-11-12.md` 的「已落地」一节。

## 只改网页层时怎么出包（壳源码缺失期间）

`app/src/main/java/**/*.java` 目前是 0 字节，`build.ps1` 重建会得到没有 `MainActivity` 的 dex（装上一启动就崩）。只改 `assets/www` 时走这条路：

```powershell
python tmp\repack_web.py          # 用现有 APK 换 www，产出 tmp\repack-unsigned.apk
# zipalign -f -p 4 → apksigner sign（签名文件与口令请另行保管，不进仓库）
adb install -r tmp\repack-signed.apk
```

要改壳（状态栏 Insets、WebView 设置、新增 JS 桥）就必须先把 Java 源码补回仓库。

## 壳的唯一来源：`vendor/shell-v1.1.0.apk`

仓库里曾经没有可编译的壳代码，那 8.9 MB 的 dex 只存在于这份已签名 APK 里（SHA256 见 `vendor/SHA256.txt`，**不要删、不要覆盖**）。现已用 jadx 反编译回 `app/src/main/java/com/cet46/coach/*.java`，`build.ps1` 可从源码出包，这份 APK 退为基线/对照。

- 仓库外还有一份备份：`<离线备份位置>`（哈希一致）。
- 远端：主仓库在内网/私有托管，地址与凭据另行保管。

## 构建依赖：`vendor/aar` + `vendor/jar`

`build.ps1` 会自动解包 `vendor/aar/*.aar`（ML Kit 全家 + exifinterface + odml + firebase）与 `vendor/jar/*.jar`。**缺 `firebase-components` 会在启动时崩**：`NoClassDefFoundError: com.google.firebase.components.ComponentDiscovery`（`MlKitInitProvider.onCreate` 触发）。改依赖时先看 `build/` 里解包结果，再装一次真机确认能进首页。

## AI 参数（2026-11-13 定）

- 模型固定 `deepseek-flash`；请求带 `reasoning_effort: low`（接口不认则自动去掉重发）。默认思考档 16.6s → low 档 9.3s，`minimal` 更快但会漏行，已弃用。
- `max_tokens: 4096`（2560 只快 1 秒，却容易把长页截断）。
- 手写扫描：不跑本地 ScanPlugin 去笔迹/纠偏，原图缩到 1500px/q0.78 后切 **3 段并行**请求，接缝处丢弃被切断的首行。整页 20s+ → **8.0s**（2 段时 14.9s）。
- 扫描结果**不提供文本校对**：风险提示只提示重拍，`openEditScan` 与 `edit-scan` 已删除。

## 注意：说明文字用 `.callout`

`styles.css` 末尾有一段"精简说明"的全局规则：`.pill-note { display: none !important; }`。需要用户读到的说明（规则解释、识别警告）请用 `.callout` / `.callout.warn`，否则写了也不显示。

## 待办

- **宣传片**：`promo/` 里已有三版（`cet-lens-promo.mp4`、`-wide`、`-wide-fancy`，最后一版 12.7MB）。上次停在「再做一版要多久、多长合适」，还没定方案。

## 重要：别在新会话里堆图片

旧会话（「延续四六级对话」）里累积了 **91 张图 / 约 62MB**，每次请求都要重发，直接把请求撑爆（`TRANSPORT` 失败，重试 5 次全挂）。所以：

- 需要看图就一次发一两张，别攒；
- 素材放目录里用路径引用（`promo/`、`dist/`），不要反复贴截图；
- 一个会话干一件事，长期任务及时收尾换新会话。

## 新会话开场白（直接复制）

> 继续做 cet46-coach 这个 Android 项目。先读 `cet46-coach/HANDOFF.md` 和 `cet46-coach/README.md`，然后帮我：<这里写这次要做的事>。
> 不要贴大量截图；需要素材就用 `promo/`、`dist/` 里的文件路径。
