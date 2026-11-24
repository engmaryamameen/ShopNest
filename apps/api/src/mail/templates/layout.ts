export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]!);
}

type EmailLayout = {
  preview: string;
  title: string;
  content: string;
};

export function emailLayout({ preview, title, content }: EmailLayout): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@700&family=Lato:wght@400;700&display=swap');</style><title>${escapeHtml(title)}</title></head>
<body style="margin:0;padding:0;background:#f4f7fa;color:#182c3a;font-family:Lato,Arial,Helvetica,sans-serif;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(preview)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f7fa;"><tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #e2e8f0;border-radius:16px;">
<tr><td style="padding:32px 32px 0;"><img src="cid:shopnest-wordmark" width="132" alt="ShopNest" style="display:block;width:132px;max-width:100%;height:auto;border:0;color:#172f40;font-family:Arial,Helvetica,sans-serif;font-size:22px;font-weight:bold;"></td></tr>
<tr><td style="padding:24px 32px 32px;font-size:16px;line-height:1.6;color:#425466;">
<h1 style="margin:0 0 16px;font-family:'DM Sans',Arial,Helvetica,sans-serif;font-size:26px;line-height:1.25;font-weight:700;letter-spacing:-0.5px;color:#111111;">${escapeHtml(title)}</h1>${content}
</td></tr><tr><td style="padding:20px 32px;border-top:1px solid #e8edf2;font-size:12px;line-height:1.6;color:#667b8a;">This is an automated message from ShopNest.</td></tr>
</table></td></tr></table></body></html>`;
}

export function paragraph(text: string): string {
  return `<p style="margin:0 0 16px;">${escapeHtml(text)}</p>`;
}

export function actionButton(label: string, url: string): string {
  const safeUrl = escapeHtml(url);
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0;"><tr><td bgcolor="#0077b6" style="border-radius:10px;"><a href="${safeUrl}" style="display:inline-block;padding:13px 22px;color:#ffffff;text-decoration:none;font-weight:bold;font-size:15px;">${escapeHtml(label)}</a></td></tr></table><p style="margin:0 0 16px;font-size:13px;word-break:break-all;">If the button doesn't work, copy this link:<br><a href="${safeUrl}" style="color:#006a9b;">${safeUrl}</a></p>`;
}
