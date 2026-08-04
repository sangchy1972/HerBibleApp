# Sign-in email — branding + 7-language copy

## Read this first: the console will NOT take custom HTML

Firebase Console → Authentication → Templates lets you edit only:

| Field | Editable? |
| --- | --- |
| Sender name | ✅ |
| From (local part) | ✅ |
| Reply-to | ✅ |
| Subject | ✅ |
| **Message (body)** | ❌ **read-only — greyed out** |
| Action URL | ❌ (separate "Customize action URL" flow) |

The body is locked by design: this is a free relay Google owns, and an editable
body would make it a spam cannon. So the HTML further down is **not pasteable
into the console** — it only becomes usable on Path B below.

There are two routes, and they cost very different amounts.

### Path A — free, today, no code

Fixes the parts of the email a user actually sees in their inbox list (sender
name and subject line) plus deliverability. Does not change the body layout.
This is most of the perceived win for none of the cost. **Start here.**

### Path B — full branded HTML

Generate the sign-in link yourself with the Admin SDK
(`generateSignInWithEmailLink()`), then send it through your own email provider
with your own HTML. Full control over design, layout and language.

Cost of entry, stated plainly: it needs a backend. This app has none by design,
and the project is on the **Spark (free)** plan, so Cloud Functions alone means
moving to Blaze — plus an email provider (Resend / Postmark / SendGrid) and a
new deploy surface to own. Worth it if the sign-in email becomes a conversion
bottleneck; not worth it just to move a logo.

The templates at the bottom of this file are written for Path B.

## Path A — what to change in the console now

Both of these matter more than the HTML for staying out of spam.

**1. Fix the project's public-facing name.** The current mail says *"Sign in to
project-553397384848"* — a raw project number in the subject line is the single
loudest spam signal in the whole message, and it lands before the user opens
anything.

> Firebase Console → Authentication → Sign-in method → Google → **Public-facing
> name for project** → change `project-553397384848` to `Her Bible` → Save.

This is the `%APP_NAME%` used below, so it fixes the subject and the body at once.

**2. Point the sender at your own domain.** `noreply@herbible-d1cc7.firebaseapp.com`
has no reputation with Gmail and no SPF/DKIM of yours, which is why Gmail said
*"similar to messages identified as spam"*.

> Authentication → Templates → **Customize domain** → enter `everlandapps.com` →
> add the TXT/CNAME records it gives you at your DNS provider.

You already control this domain (it is on Vercel), so it is a two-record change.
Sender becomes `noreply@everlandapps.com`.

**3. Set the sender name.** It currently reads `noreply`, which is what the
inbox list shows next to the subject — the most-seen string in the whole email.

> Templates → ✏️ → **Sender name** → `Her Bible`

**4. Set the subject per language.** The Subject field IS editable, and it is
per-language (Template language selector at the bottom-left). Use these:

| Locale | Subject |
| --- | --- |
| `en` | `Sign in to Her Bible` |
| `zh-CN` | `登录 Her Bible` |
| `zh-TW` | `登入 Her Bible` |
| `es` | `Inicia sesión en Her Bible` |
| `pt-BR` | `Entre no Her Bible` |
| `de` | `Bei Her Bible anmelden` |
| `fr` | `Connexion à Her Bible` |

After step 1 you can write `%APP_NAME%` instead of the literal name and it
resolves to `Her Bible` everywhere.

Sender name + subject + a domain-signed sender is what turns *"noreply — Sign in
to project-553397384848"* into *"Her Bible — Sign in to Her Bible"*. That is the
line the user judges before opening anything.

**5. Add a DMARC record.** Steps 1-4 fix what the user SEES; this fixes what
Gmail's filter decides before she sees anything.

Since November 2025 Gmail and Yahoo reject non-compliant mail from bulk senders
outright rather than filing it as spam. Her Bible is nowhere near the 5,000/day
"bulk" threshold, so it is not *required* — but a domain with no DMARC record is
a domain with no stated policy, and low-volume senders are exactly the ones with
no reputation to fall back on. It is one DNS record.

At your DNS provider, on `everlandapps.com`:

| Type | Name | Value |
| --- | --- | --- |
| TXT | `_dmarc` | `v=DMARC1; p=none; rua=mailto:dmarc@everlandapps.com; fo=1` |

`p=none` means "monitor, do not reject" — it changes nothing about how your mail
is handled, it just tells receivers you exist and asks them to report. Read the
aggregate reports for a few weeks; once they show SPF and DKIM passing on
everything you actually send, tighten to `p=quarantine`. **Do not start at
`p=reject`** — a misaligned record on a domain you also send from by hand will
bin your own mail.

Step 2 (Customize domain) is what gives you SPF and DKIM. DMARC without those
two does nothing, so do them in that order.

### How to check it actually worked

Do not guess from one inbox. Send yourself a link, open the message in Gmail on
the web, ⋮ → **Show original**, and read the top three lines:

```
SPF:   PASS with domain everlandapps.com
DKIM:  PASS with domain everlandapps.com
DMARC: PASS
```

Three PASSes with **your** domain (not `firebaseapp.com`) is the whole test. If
DKIM says `firebaseapp.com` while SPF says `everlandapps.com`, step 2's DNS
records have not propagated yet — give it an hour.

Also worth doing once: send to a Gmail, an Outlook/Hotmail and a Yahoo address
and see where each lands. Gmail is the strictest of the three for a new sending
domain, so passing there usually means the others are fine.

### What will NOT help

- Rewording the email. Spam scoring on a one-link transactional mail is
  dominated by sender reputation, not wording.
- Asking users to mark it "not spam". It helps that one user's future mail and
  nobody else's.
- Sending more mail to "warm up". Warming matters at thousands per day; at this
  volume you are just sending unwanted mail.

Note: `setEmailLanguage()` in `services/firebaseAuth.ts` is what makes the
per-language subject actually get picked — Firebase auto-localises only its stock
templates, and the moment you edit one it is served verbatim unless the request
carries a language code.

## How localisation works here

Firebase auto-localises only its **stock** templates. A customised template is
sent exactly as written, so the app now sends a language code with the request
(`auth().languageCode`, wired in `services/firebaseAuth.ts` →
`setEmailLanguage`). Firebase then looks up the template stored for that locale.

In the console, the Templates page has a **language selector** — switch it, paste
the matching block, save, repeat. Locales the app sends:

| App language | Locale to select |
| --- | --- |
| English | `en` |
| 简体中文 | `zh-CN` |
| 繁體中文 | `zh-TW` |
| Español | `es` |
| Português | `pt-BR` |
| Deutsch | `de` |
| Français | `fr` |

Any locale you don't fill in falls back to `en`, so English is the one to do first.

## Notes on the markup

- Table layout + inline styles. Gmail strips `<style>` blocks and ignores flexbox;
  anything fancier degrades into unstyled text in exactly the client that matters.
- `%LINK%` is the button's href — Firebase substitutes the real one-time URL.
  Don't rename it and don't wrap it in tracking.
- The button is a padded table cell, not a styled `<a>` — Outlook drops padding
  on inline elements.
- No remote images. An image-heavy first email from an unknown sender is itself a
  spam signal, and Gmail blocks remote images by default anyway, so a logo would
  render as a broken box on the one impression that counts. The wordmark is text.
- Under 100 words in every language, per the brief.

---

## Path B templates — English `en`

**Subject:** `Sign in to %APP_NAME%`

```html
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#FAF7F8;padding:32px 0;font-family:Helvetica,Arial,sans-serif;">
  <tr><td align="center">
    <table width="440" cellpadding="0" cellspacing="0" border="0" style="max-width:440px;background:#FFFFFF;border:1px solid #EFE6EA;border-radius:12px;padding:40px 32px;">
      <tr><td align="center" style="font-size:20px;font-weight:bold;color:#E63F69;letter-spacing:1px;padding-bottom:28px;">HER BIBLE</td></tr>
      <tr><td align="center" style="font-size:22px;color:#1E1B2E;padding-bottom:14px;">Confirm your sign-in</td></tr>
      <tr><td align="center" style="font-size:15px;line-height:22px;color:#6B6675;padding-bottom:28px;">Tap below to sign in to %APP_NAME% as %EMAIL%. The link works once and expires soon.</td></tr>
      <tr><td align="center" style="padding-bottom:28px;">
        <table cellpadding="0" cellspacing="0" border="0"><tr>
          <td align="center" bgcolor="#E63F69" style="border-radius:8px;">
            <a href="%LINK%" style="display:inline-block;padding:14px 36px;font-size:16px;color:#FFFFFF;text-decoration:none;">Confirm sign-in</a>
          </td>
        </tr></table>
      </td></tr>
      <tr><td align="center" style="font-size:13px;line-height:20px;color:#9A94A3;border-top:1px solid #F2EBEE;padding-top:20px;">Didn't request this? You can safely ignore this email.</td></tr>
    </table>
  </td></tr>
</table>
```

## 简体中文 — `zh-CN`

**Subject:** `登录 %APP_NAME%`

```html
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#FAF7F8;padding:32px 0;font-family:Helvetica,Arial,sans-serif;">
  <tr><td align="center">
    <table width="440" cellpadding="0" cellspacing="0" border="0" style="max-width:440px;background:#FFFFFF;border:1px solid #EFE6EA;border-radius:12px;padding:40px 32px;">
      <tr><td align="center" style="font-size:20px;font-weight:bold;color:#E63F69;letter-spacing:1px;padding-bottom:28px;">HER BIBLE</td></tr>
      <tr><td align="center" style="font-size:22px;color:#1E1B2E;padding-bottom:14px;">确认登录</td></tr>
      <tr><td align="center" style="font-size:15px;line-height:24px;color:#6B6675;padding-bottom:28px;">点击下方按钮，以 %EMAIL% 登录 %APP_NAME%。此链接仅可使用一次，且会很快失效。</td></tr>
      <tr><td align="center" style="padding-bottom:28px;">
        <table cellpadding="0" cellspacing="0" border="0"><tr>
          <td align="center" bgcolor="#E63F69" style="border-radius:8px;">
            <a href="%LINK%" style="display:inline-block;padding:14px 36px;font-size:16px;color:#FFFFFF;text-decoration:none;">确认登录</a>
          </td>
        </tr></table>
      </td></tr>
      <tr><td align="center" style="font-size:13px;line-height:20px;color:#9A94A3;border-top:1px solid #F2EBEE;padding-top:20px;">若非本人操作，忽略此邮件即可。</td></tr>
    </table>
  </td></tr>
</table>
```

## 繁體中文 — `zh-TW`

**Subject:** `登入 %APP_NAME%`

```html
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#FAF7F8;padding:32px 0;font-family:Helvetica,Arial,sans-serif;">
  <tr><td align="center">
    <table width="440" cellpadding="0" cellspacing="0" border="0" style="max-width:440px;background:#FFFFFF;border:1px solid #EFE6EA;border-radius:12px;padding:40px 32px;">
      <tr><td align="center" style="font-size:20px;font-weight:bold;color:#E63F69;letter-spacing:1px;padding-bottom:28px;">HER BIBLE</td></tr>
      <tr><td align="center" style="font-size:22px;color:#1E1B2E;padding-bottom:14px;">確認登入</td></tr>
      <tr><td align="center" style="font-size:15px;line-height:24px;color:#6B6675;padding-bottom:28px;">點擊下方按鈕，以 %EMAIL% 登入 %APP_NAME%。此連結僅可使用一次，且會很快失效。</td></tr>
      <tr><td align="center" style="padding-bottom:28px;">
        <table cellpadding="0" cellspacing="0" border="0"><tr>
          <td align="center" bgcolor="#E63F69" style="border-radius:8px;">
            <a href="%LINK%" style="display:inline-block;padding:14px 36px;font-size:16px;color:#FFFFFF;text-decoration:none;">確認登入</a>
          </td>
        </tr></table>
      </td></tr>
      <tr><td align="center" style="font-size:13px;line-height:20px;color:#9A94A3;border-top:1px solid #F2EBEE;padding-top:20px;">若非本人操作，忽略此郵件即可。</td></tr>
    </table>
  </td></tr>
</table>
```

## Español — `es`

**Subject:** `Inicia sesión en %APP_NAME%`

```html
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#FAF7F8;padding:32px 0;font-family:Helvetica,Arial,sans-serif;">
  <tr><td align="center">
    <table width="440" cellpadding="0" cellspacing="0" border="0" style="max-width:440px;background:#FFFFFF;border:1px solid #EFE6EA;border-radius:12px;padding:40px 32px;">
      <tr><td align="center" style="font-size:20px;font-weight:bold;color:#E63F69;letter-spacing:1px;padding-bottom:28px;">HER BIBLE</td></tr>
      <tr><td align="center" style="font-size:22px;color:#1E1B2E;padding-bottom:14px;">Confirma tu acceso</td></tr>
      <tr><td align="center" style="font-size:15px;line-height:22px;color:#6B6675;padding-bottom:28px;">Toca abajo para entrar en %APP_NAME% como %EMAIL%. El enlace sirve una vez y caduca pronto.</td></tr>
      <tr><td align="center" style="padding-bottom:28px;">
        <table cellpadding="0" cellspacing="0" border="0"><tr>
          <td align="center" bgcolor="#E63F69" style="border-radius:8px;">
            <a href="%LINK%" style="display:inline-block;padding:14px 36px;font-size:16px;color:#FFFFFF;text-decoration:none;">Confirmar acceso</a>
          </td>
        </tr></table>
      </td></tr>
      <tr><td align="center" style="font-size:13px;line-height:20px;color:#9A94A3;border-top:1px solid #F2EBEE;padding-top:20px;">¿No lo pediste? Puedes ignorar este correo.</td></tr>
    </table>
  </td></tr>
</table>
```

## Português — `pt-BR`

**Subject:** `Entre no %APP_NAME%`

```html
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#FAF7F8;padding:32px 0;font-family:Helvetica,Arial,sans-serif;">
  <tr><td align="center">
    <table width="440" cellpadding="0" cellspacing="0" border="0" style="max-width:440px;background:#FFFFFF;border:1px solid #EFE6EA;border-radius:12px;padding:40px 32px;">
      <tr><td align="center" style="font-size:20px;font-weight:bold;color:#E63F69;letter-spacing:1px;padding-bottom:28px;">HER BIBLE</td></tr>
      <tr><td align="center" style="font-size:22px;color:#1E1B2E;padding-bottom:14px;">Confirme seu acesso</td></tr>
      <tr><td align="center" style="font-size:15px;line-height:22px;color:#6B6675;padding-bottom:28px;">Toque abaixo para entrar no %APP_NAME% como %EMAIL%. O link funciona uma vez e expira em breve.</td></tr>
      <tr><td align="center" style="padding-bottom:28px;">
        <table cellpadding="0" cellspacing="0" border="0"><tr>
          <td align="center" bgcolor="#E63F69" style="border-radius:8px;">
            <a href="%LINK%" style="display:inline-block;padding:14px 36px;font-size:16px;color:#FFFFFF;text-decoration:none;">Confirmar acesso</a>
          </td>
        </tr></table>
      </td></tr>
      <tr><td align="center" style="font-size:13px;line-height:20px;color:#9A94A3;border-top:1px solid #F2EBEE;padding-top:20px;">Não foi você? Pode ignorar este e-mail.</td></tr>
    </table>
  </td></tr>
</table>
```

## Deutsch — `de`

**Subject:** `Bei %APP_NAME% anmelden`

```html
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#FAF7F8;padding:32px 0;font-family:Helvetica,Arial,sans-serif;">
  <tr><td align="center">
    <table width="440" cellpadding="0" cellspacing="0" border="0" style="max-width:440px;background:#FFFFFF;border:1px solid #EFE6EA;border-radius:12px;padding:40px 32px;">
      <tr><td align="center" style="font-size:20px;font-weight:bold;color:#E63F69;letter-spacing:1px;padding-bottom:28px;">HER BIBLE</td></tr>
      <tr><td align="center" style="font-size:22px;color:#1E1B2E;padding-bottom:14px;">Anmeldung bestätigen</td></tr>
      <tr><td align="center" style="font-size:15px;line-height:22px;color:#6B6675;padding-bottom:28px;">Tippe unten, um dich als %EMAIL% bei %APP_NAME% anzumelden. Der Link gilt einmal und läuft bald ab.</td></tr>
      <tr><td align="center" style="padding-bottom:28px;">
        <table cellpadding="0" cellspacing="0" border="0"><tr>
          <td align="center" bgcolor="#E63F69" style="border-radius:8px;">
            <a href="%LINK%" style="display:inline-block;padding:14px 36px;font-size:16px;color:#FFFFFF;text-decoration:none;">Anmeldung bestätigen</a>
          </td>
        </tr></table>
      </td></tr>
      <tr><td align="center" style="font-size:13px;line-height:20px;color:#9A94A3;border-top:1px solid #F2EBEE;padding-top:20px;">Nicht angefordert? Ignoriere diese E-Mail einfach.</td></tr>
    </table>
  </td></tr>
</table>
```

## Français — `fr`

**Subject:** `Connexion à %APP_NAME%`

```html
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#FAF7F8;padding:32px 0;font-family:Helvetica,Arial,sans-serif;">
  <tr><td align="center">
    <table width="440" cellpadding="0" cellspacing="0" border="0" style="max-width:440px;background:#FFFFFF;border:1px solid #EFE6EA;border-radius:12px;padding:40px 32px;">
      <tr><td align="center" style="font-size:20px;font-weight:bold;color:#E63F69;letter-spacing:1px;padding-bottom:28px;">HER BIBLE</td></tr>
      <tr><td align="center" style="font-size:22px;color:#1E1B2E;padding-bottom:14px;">Confirme ta connexion</td></tr>
      <tr><td align="center" style="font-size:15px;line-height:22px;color:#6B6675;padding-bottom:28px;">Touche ci-dessous pour te connecter à %APP_NAME% en tant que %EMAIL%. Le lien sert une fois et expire bientôt.</td></tr>
      <tr><td align="center" style="padding-bottom:28px;">
        <table cellpadding="0" cellspacing="0" border="0"><tr>
          <td align="center" bgcolor="#E63F69" style="border-radius:8px;">
            <a href="%LINK%" style="display:inline-block;padding:14px 36px;font-size:16px;color:#FFFFFF;text-decoration:none;">Confirmer la connexion</a>
          </td>
        </tr></table>
      </td></tr>
      <tr><td align="center" style="font-size:13px;line-height:20px;color:#9A94A3;border-top:1px solid #F2EBEE;padding-top:20px;">Ce n'était pas toi ? Ignore simplement cet e-mail.</td></tr>
    </table>
  </td></tr>
</table>
```

---

## What the button does

`%LINK%` already lands where you want — nothing to change:

```
email button → everlandapps.com/finishSignIn.html → herbible://finishSignIn?…
             → DeepLinkHandler → completeEmailSignIn() → signed in
```

The redirect page is what avoids Firebase Dynamic Links (deprecated) and Android
App Links entirely. Keep `everlandapps.com` in **Authentication → Settings →
Authorized domains** or the send call starts failing with
`auth/unauthorized-continue-uri`.
