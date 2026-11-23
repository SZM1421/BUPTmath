/* 教材正文跳转配置：《工科数学分析基础》上册
 * ------------------------------------------------------------
 * 页码取自教材目录（物理第 17—19 页）；2.6.2 / 2.6.3 两行目录 OCR 破损，
 * 由正文标题定位（教材 P147 / P149）。
 * 本 PDF 前 22 页为封面、目录等，故：PDF 物理页 = 教材印刷页 + 22。
 * 已抽查印刷页 8 / 50 / 86 / 124 / 151，页眉数字与之一致。
 *
 * 教材 PDF 不在题库目录内，避免把 150 MB 文件复制进项目：
 *   · 双击 index.html（file://）→ 读题库目录上一级的原文件；
 *   · 通过 启动.bat / server.py（http://）→ 由 /textbook.pdf 路由提供。
 * 若教材文件被移动，只需改下面的 fileRel，或把 PDF 放到题库目录上一级。
 */
window.BOOK = {
  title: "《工科数学分析基础》上册",
  fileRel: "../工科数学分析基础 上册.pdf",
  httpPath: "/textbook.pdf",                                  /* 本地 启动.bat 用 */
  remotePath: "https://waline.sybuscloud.top/textbook.pdf",   /* 公网 GitHub Pages 用 */
  offset: 22,

  /* 知识点 id → 教材印刷页码 */
  pages: {
    "1.1.1": 8,  "1.1.2": 10, "1.1.3": 12, "1.1.4": 16,
    "1.1.5": 17, "1.1.6": 18, "1.1.7": 19,
    "1.2.1": 23, "1.2.2": 27, "1.2.3": 32,
    "1.3.1": 41, "1.3.2": 46, "1.3.3": 50, "1.3.4": 53,
    "1.4.1": 57, "1.4.2": 59, "1.4.3": 61, "1.4.4": 62,
    "1.5.1": 65, "1.5.2": 68, "1.5.3": 71, "1.5.4": 76,

    "2.1.1": 86,  "2.1.2": 91,  "2.1.3": 92,  "2.1.4": 93,
    "2.2.1": 98,  "2.2.2": 100, "2.2.3": 102, "2.2.4": 104,
    "2.2.5": 105, "2.2.6": 107, "2.2.7": 108, "2.2.8": 110,
    "2.3.1": 117, "2.3.2": 119, "2.3.3": 119, "2.3.4": 120,
    "2.4.1": 123, "2.4.2": 124, "2.4.3": 129,
    "2.5.1": 136, "2.5.2": 140, "2.5.3": 141,
    "2.6.1": 145, "2.6.2": 147, "2.6.3": 149, "2.6.4": 151
  }
};

/* 返回 {printed, physical}；无对应页码时返回 null */
window.bookPage = function (kpid) {
  var B = window.BOOK;
  var p = B && B.pages ? B.pages[kpid] : null;
  return (p == null) ? null : { printed: p, physical: p + B.offset };
};

/* 生成可直接打开的 PDF 定位链接（#page= 使用 PDF 物理页） */
window.bookHref = function (kpid) {
  var b = window.bookPage(kpid);
  if (!b) return "";
  var B = window.BOOK;
  var base;
  if (location.protocol === "file:") base = B.fileRel;
  else if (/\.github\.io$/.test(location.hostname) && B.remotePath) base = B.remotePath;
  else base = B.httpPath;
  return encodeURI(base) + "#page=" + b.physical;
};
