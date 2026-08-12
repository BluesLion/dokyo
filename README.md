# 讀誦對照

純靜態網頁，沒有建置流程，也沒有相依套件——把整個資料夾丟到任何靜態主機，
或直接用瀏覽器開啟 `index.html` 即可。

---

## 檔案結構

```
├── index.html          目次
├── css/base.css        全站共用：色票、版心、目次元件、RWD／列印
├── css/sutra.css       讀誦頁專用：題簽、控制列、ruby 咒句、三層字塊
├── js/sutra.js         朗讀、語音檢測、控制列
└── *.html              各經文頁（檔名為經題的日文音）
```

---

## 視覺

沿用經本的材質語言。色票定義在 `css/base.css` 的 `:root`：

| | |
|---|---|
| 紙 `--paper` | `#FBFAF7` |
| 墨 `--sumi` | `#1C1A17` |
| 次要 `--sumi-2` | `#6B655C` |
| 界線 `--rule` | `#DCD7CC` |
| 朱 `--shu` | `#C8322B` |

朱色取自日本佛典標訓點用的朱墨，用在拼音、段落編號、句義側線。
字型走 Google Fonts：假名與經名 Noto Serif JP、中文 Noto Serif TC、
拼音等小字 Zen Kaku Gothic New。
