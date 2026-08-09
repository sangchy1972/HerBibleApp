# 你要做的事 — v1.2.0 上线清单

写给你自己操作的。**顺序不能换**：内容资产必须先在线，包才有意义（`release-build-runbook.md` §2）。

代码这边全部完成：`npx tsc --noEmit` 退出 0，777 个测试全绿，`app.json` 已经是 `1.2.0`。

---

## A. 上传 33 幅拼图画作 ⬅️ 必做，现在线上是 404

不做的后果：所有拼图永远是灰底加锁头。不崩，但整个奖励系统看起来是坏的。

**本地目录**（Finder 里 <kbd>⇧⌘G</kbd> 粘贴）：

```
/Users/liwencao/Desktop/classical-bible-paintings/_upload-to-r2/v1/art/
```

里面是 `full/`（33 张，1200px）和 `thumb/`（33 张，420px）。

**上传**：

1. Cloudflare Dashboard → **R2** → bucket **`herbible-quiz`**
   （注意不是 `herbible-plans-7languages`，那个是计划封面）
2. 确认当前在 **bucket 根目录**（面包屑只有桶名，没有子目录）
3. 把 `_upload-to-r2/` 里的整个 **`v1` 文件夹**拖进去

这个目录结构本身就是按 R2 的 key 排好的，落地就是 `v1/art/full/017.jpg`，不用改名。

**验证**（一新一旧）：

```bash
curl -sI https://quiz.everlandapps.com/v1/art/full/017.jpg  | head -3
curl -sI https://quiz.everlandapps.com/v1/art/thumb/085.jpg | head -3
```

两条都要 `HTTP/2 200`。

> 全是**新 key**，边缘上没有旧对象 —— **不用清缓存**。跟 B 那件事不一样。

---

## B. 清题库的边缘缓存 —— 还差两个语言

**2026-08-09 实测**（web_fetch 逐个拉 `/v1/quiz-<lang>.json` 读头部）：

| 语言 | bankVersion | 题数 | |
| --- | --- | --- | --- |
| `en` | 3 | 650 | ✅ |
| `de` | 3 | 650 | ✅ |
| `pt` | 3 | 650 | ✅ |
| `zh-Hans` | 3 | 650 | ✅ |
| `fr` | 3 | 650 | ✅（今日早些时候测得） |
| **`es`** | **2** | **327** | ❌ 边缘仍是旧的 |
| **`zh-Hant`** | **2** | **327** | ❌ 边缘仍是旧的 |

七条里五条已经生效。**只剩这两条**：

```
https://quiz.everlandapps.com/v1/quiz-es.json
https://quiz.everlandapps.com/v1/quiz-zh-Hant.json
```

Cloudflare → `everlandapps.com` → **Caching** → **Configuration** → **Purge Cache**
→ **Custom Purge** → **URL** → 粘上面两条 → Purge。

等 30 秒后复验：

```bash
for L in es zh-Hant; do
  printf '%-9s ' "$L"
  curl -s "https://quiz.everlandapps.com/v1/quiz-$L.json" | head -c 60
  echo
done
```

两行都要出现 `"bankVersion":3` 和 `"count":650`。

> **为什么这两条不能拖**：如果线上包的 `QUIZ_BANK_VERSION` 已经是 3，
> `parseBankFile` 会拒绝边缘发来的 v2 文件并返回 null —— 西班牙语和繁体中文用户的
> 首页答题卡是**消失**的，不是显示旧题。没有报错，而且每次前台重试都命中同一份
> 缓存，不会自愈。

`/v1/manifest.json` 拉回来是空的，分不清是 404 还是没内容。App 不读它，可以不管。

---

## C. 出包 —— 两个平台一起

前提：A 和 B 都验证通过了。

```bash
cd ~/HerBibleApp
npm run build:all
```

`build:all` 同时出 Android 和 iOS。**不要只出一个平台** —— 每次发版两个商店一起走。

几件不用管的事：

- `eas-cli` 全局没装、也不是依赖。`npm run build:*` 里已经是 `npx --yes eas-cli@latest`，别自己敲 `eas build`。
- `versionCode` / `buildNumber` 是远程自增（`appVersionSource: "remote"`），**不要手改**。
- 只有 `app.json` 里的 `version` 是手写的，已经是 `1.2.0`。
- `play-service-account.json` 构建阶段用不到。

构建完 EAS 会给两个链接。

**提审**：

```bash
npm run submit:android   # 需要 play-service-account.json
npm run submit:ios
```

或者在 Play Console / App Store Connect 手动传 AAB / IPA —— 手动传不需要那个
service account 文件。

**上架文案**：`docs/release-notes-this-version.md`（7 语种，每条 ≤500 字符，Play
Console 用最下面那段带 `<lang>` 标签的粘贴版）。

> ⚠️ 这份文案是在这一批 quiz 改动**之前**写的，只提了首页答题卡和结算页改版，
> 没提 33 幅画作 / 43 张卡 / Explore 搜索。**要不要我按现在的实际内容重写一版，你说一声。**

---

## D. Firebase 登录邮件 —— 只有一件事，不是七件

**我写错了，这是同一个错误第二次。** `docs/email-signin-templates.md` 里早就写着
「语言选择器很可能是全局的，不是分语种的」，我写这份清单时没回去看，又把
「切七次语言分别保存」写了一遍。你在控制台里看到的才是对的：**换语言就是换全部，
没有分语种保存这回事。**

原因：Firebase 只对**自带模板**做本地化。模板一旦被你改过，就按写死的内容原样发给
所有人，客户端送的语言码不再起作用。`setEmailLanguage()` 留着没坏处（它还管
reCAPTCHA 和 OAuth 弹窗的语言），但它选不了邮件模板。

### 所以你要做的就一步

1. Firebase Console → **Authentication** → **Templates** → **电子邮件地址登录**
2. 语言选 **English**
3. **Subject** 填：

```
Sign in to Her Bible
```

4. Save。**结束。**

正文是只读的，改不了；主题是唯一能改的一行；而 "Her Bible" 在七种语言里都是英文。
七种主题要真做，得走 Path B（自建后端发信），为一行字不值得。

文档里那七条翻译主题**不是任务**，只是万一以后做 Path B 时的素材。

---

## E. Cloudflare DMARC 记录 —— 分两步，顺序不能反

作用：告诉 Gmail 这个域名有发信策略。没有 DMARC 记录的域名 = 没有表态的域名，
而新域名恰恰是最没有信誉可依靠的。一条 DNS 记录的事。

> 前提：`docs/email-signin-templates.md` 的第 2 步（Customize domain）给你的是
> SPF 和 DKIM。**DMARC 没有那两个是不起作用的**，所以先确认那一步做完了。

### E1. 先建收报告的邮箱地址

**为什么要先做这个**：`rua=mailto:sangchy1972@gmail.com` **不管用**。DMARC 要求
接收方域名先发布一条授权记录（`everlandapps.com._report._dmarc.gmail.com`），
而 gmail.com 的 DNS 不是你的。Google 自己的报告器会强制检查这一条，所以报告永远
不会寄到，而那条记录看起来完全正常。

必须用 `everlandapps.com` 下的地址，再转发到你的 Gmail。Email Routing 这个域名
已经开着了（SPF 里那条 `_spf.mx.cloudflare.net` 就是它）：

1. Cloudflare → 选 **`everlandapps.com`** → 左侧 **Email** → **Email Routing**
2. **Routing rules** 标签 → **Create address**
3. Custom address 填 **`dmarc`**（前面那一截，@ 后面自动是 everlandapps.com）
4. Action 选 **Send to an email** → 填 `sangchy1972@gmail.com`
5. Save
6. **去 Gmail 收一封验证邮件并点确认** —— 不点这一步，转发不生效

### E2. 再加 DNS 记录

Cloudflare → `everlandapps.com` → **DNS** → **Records** → **Add record**

| 字段 | 填什么 |
| --- | --- |
| Type | `TXT` |
| Name | `_dmarc` |
| Content | `v=DMARC1; p=none; rua=mailto:dmarc@everlandapps.com; fo=1` |
| TTL | Auto |

⚠️ Name 就填 **`_dmarc`**，**不要**写成 `_dmarc.everlandapps.com`。Cloudflare 用
相对名，写全了会变成 `_dmarc.everlandapps.com.everlandapps.com`。DKIM 那几条
CNAME 也是同一个坑。

⚠️ **不要**把 Firebase 给的那行 SPF 当成新记录加进去 —— 一个域名只能有一条 SPF，
要合并进现有那条。详见 `email-signin-templates.md` 第 119 行。

`p=none` 是「只监控，不拒收」，不改变任何一封邮件的实际投递，只是让接收方知道你
存在并给你发报告。**不要一上来就 `p=reject`** —— 记录没对齐的话，你自己手发的邮件
都会被扔掉。跑几周，等报告显示 SPF 和 DKIM 全过了，再收紧到 `p=quarantine`。

### E3. 验证

不要凭一个收件箱猜。给自己发一封登录邮件，在**网页版 Gmail** 打开，
⋮ → **显示原始邮件**，看最上面三行：

```
SPF:   PASS with domain everlandapps.com
DKIM:  PASS with domain everlandapps.com
DMARC: PASS
```

三个 PASS，而且域名都是**你的**（不是 `firebaseapp.com`）才算过。如果 DKIM 显示
`firebaseapp.com` 而 SPF 显示 `everlandapps.com`，是第 2 步的 DNS 还没生效，等一小时。

---

## 做完之后

CDN 那两件（A、B）做完就告诉我，我把 `docs/release-build-runbook.md` 的验证清单
勾掉，需要的话顺手重写发版文案。
