# CET Lens · 四六级智学

> 把四六级卷子拍进手机：英文变成可点词的电子稿，作文和翻译能直接批改。
> 免注册、无广告、断网也能用；AI 功能用自己的 Key，约一分钱一页。

一个离线优先的 Android 四六级精读与判分工具。单 APK，词库与 OCR 模型随包内置；识别与批改可选接自己的 DeepSeek API Key，费用直接记在自己账号，开发者不抽成。

当前版本 **1.2.0**（versionCode 4），Android 7.0（API 24）及以上。

## 作者与分工

| 角色 | 承担的工作 |
|---|---|
| **[yhr1144](https://github.com/yhr1144)** | 项目发起人。确定产品定位与目标用户，设计和拍板全部交互流程（扫描两档、批改四步闸门、收藏分类、范文入口），在真机上逐条验收，判断哪些功能该删、哪些该留 |
| **AI 编程助手**（DeepSeek Harness） | 按需求写实现：Android 壳与 WebView 前端、DeepSeek OCR 与批改接入、构建脚本、README 与发行说明，以及绝大部分 bug 的定位与修复 |
| **第三方组件** | 离线识别 Google ML Kit；词库 ECDICT（MIT）；例句 Tatoeba（CC BY 2.0 FR）；同义词 Princeton WordNet 3.0 |

产品的判断来自人，代码的实现来自 AI。所有决定权、测试与验收在项目发起人手里。

### 关于提交历史里的 `cet46`

早期提交的作者显示为 `cet46 <cet46@local>`。这是项目发起人本机的占位 git 身份，与 [yhr1144](https://github.com/yhr1144) 是**同一个人**，不是第二位贡献者。

改邮箱之前的历史提交不会关联到 GitHub 账号，因此不计入贡献图；`13d21d0` 之后的提交统一使用 `yhr1144 <yehr1144@outlook.com>`。

## 功能

**扫描精读**
- 相机 / 相册取图，裁剪后识别
- 两种识别：**离线 OCR**（ML Kit，本机、免费、1–2 秒）与 **云端 OCR**（DeepSeek OCR 接口，手写更准、按页计费）
- 结果页可点词查词、高亮密度可调、复制全文、收藏全文
- 多页扫描已移除；识别结果是只读的，不提供文本校对

**拍照判分**
- 勾叉核对：默认全对，点掉错的；支持「√/×」与「只标错」两种规则
- 客观题按 55 题折算（满分 497），显示客观题、主观题、总分三张卡
- 作文 / 翻译走 **AI 批改**：流程固定为「拍题目 → 识别题目 → 拍内容 → 识别内容 → 批改」，不可跳步、不可回头
- 批改由模型直接看两张图完成，一次返回：档位与理由、五项评分、扣分说明、主要问题、可升级表达（逐词 `原词 → 替换词`）、下一步
- 出分后可按题目生成**范文**（作文）或**参考译文**（翻译），可复制、可收藏

**词库与阅读**
- 20,499 核心词 + 768,610 条完整 ECDICT 词条，本机 SQLite 查询
- 释义、音标、词形、双语例句、同义替换、高级表达、相关词组
- 外刊精读 141 篇（CET-4 70 / CET-6 71），按主题分类，附原文链接
- 满分句式库：144 条句式 + 8 套模板；只读，可复制收藏（不支持插入作文）
- 语音朗读：系统 TTS 或在线发音，可切换

**收藏**
- 单词、词组、句子、句式、外刊、**范文**、**翻译**、批改建议、判分报告都可收藏
- 支持分类筛选、搜索、分页、背诵模式（遮住中文自测）

## AI 与费用

- 只接 DeepSeek。API Key 只存在本机，不上传，不走任何中间服务
- 识别走 `/v1/tools/ocr`（按页计费，约 ¥0.0016/页）
- 批改走 chat 接口，一次请求同时出转写与评分
- 失败或超时不计费；费用直接记在你自己账号下，开发者不收分成

参考用量（按官方价，¥7.1/$）：

| 强度 | 用量 | 月成本 |
|---|---|---|
| 轻度 | 每天扫 1 页、每周批改 1 次 | ≈ ¥0.08 |
| 中度 | 每天扫 3 页、每周批改 3 次 | ≈ ¥0.24 |
| 重度 | 每天扫 10 页、每天批改 1 次 | ≈ ¥0.72 |

不配 Key 时：离线 OCR、词库、外刊、句式库、勾叉算分全部可用，只是没有 AI 识别与批改。

## 构建

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File build.ps1
```

产物在 `dist/cet46-coach-1.2.0.apk`。

构建依赖（均已随仓库提供）：

- `vendor/aar/*.aar`、`vendor/jar/*.jar`：ML Kit 与 androidx 运行时
- `build-tools/`：aapt2、d8、zipalign、apksigner、adb
- `app/src/main/assets/dict.db`：词典数据

流程：`aapt2 compile/link` → `javac` → `d8` → `zipalign` → `apksigner`。签名用 `release.keystore`（别名 `cet46`），请自行保管。

## 目录

```
app/src/main/java/com/cet46/coach/   MainActivity、LocalServer、FullDict、CaptureProvider
app/src/main/java/com/cet46/mlkit/   MlKitBridge（离线 OCR）
app/src/main/assets/www/             前端：index.html + js/(app, ai, ocr, grader, dict, core) + styles.css
app/src/main/assets/www/data/        外刊、句式、词表等静态数据
scripts/                             构建辅助（aar_tools、md_to_docx）
HANDOFF.md                           开发交接：构建细节与踩坑记录
```

## 已知限制

- AI 批改不是官方阅卷，分数只作参考，不代表真实考试成绩
- 手写涂改由模型自行判断，可能残留划掉的词
- 云端识别与批改需要联网和有效 Key；Key 无效、欠费、并发满都会在页面上直接显示原因
- 无多页扫描、无文本校对入口、无数据导出

## 数据来源

- 词库 [ECDICT](https://github.com/skywind3000/ECDICT)（MIT）
- 例句 Tatoeba（CC BY 2.0 FR）
- 同义词 Princeton WordNet 3.0
- 离线识别 Google ML Kit

## 许可

本项目代码采用 [MIT 许可证](LICENSE)。

随附数据与第三方组件遵循各自许可：词库 ECDICT（MIT）、例句 Tatoeba（CC BY 2.0 FR）、同义词 Princeton WordNet 3.0、离线识别 Google ML Kit。
