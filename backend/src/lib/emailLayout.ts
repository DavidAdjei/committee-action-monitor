/**
 * Shared HTML shell + UMB signature for all CAM outbound mail.
 * Table-based layout for Outlook / Graph sendMail compatibility.
 */

export function escapeHtml(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Gold accent matching UMB signature */
const GOLD = "#d4a017";
const INK = "#111111";
const MUTED = "#555555";
const BRAND = "#5b21b6";

/**
 * UMB-style signature block (logo + Cyber & Information Security / CAM).
 */
export function emailSignatureHtml(): string {
  return `
<table role="presentation" width="620" cellpadding="0" cellspacing="0" border="0" style="width:620px;max-width:100%;margin-top:28px;font-family:Arial,sans-serif;border-top:1px solid #e5e7eb;padding-top:8px;">
  <tr>
    <td valign="top" width="200" style="padding-right:20px;padding-top:16px;">
      <img src="https://res.cloudinary.com/dmzhaulbn/image/upload/v1779779716/umb-signature_evfsfi.png" width="160" alt="UMB Logo" style="display:block;border:0;max-width:160px;height:auto;" />
    </td>
    <td width="2" bgcolor="${GOLD}" style="width:2px;background-color:${GOLD};">&nbsp;</td>
    <td valign="top" style="padding-left:20px;padding-top:16px;font-size:13px;line-height:20px;color:${MUTED};">
      <div style="font-size:20px;font-weight:bold;color:${GOLD};">Committee Action Monitor</div>
      <div style="font-size:14px;font-weight:bold;color:${INK};margin-top:4px;margin-bottom:10px;">Cyber &amp; Information Security</div>
      <div><strong>T:</strong> +233 302 666 331-6 Ext: 1750</div>
      <div><strong>M:</strong> +233 594 332 407</div>
      <div style="margin-top:8px;font-weight:bold;color:${INK};">Toll-Free Lines</div>
      <div>MTN, Vodafone &amp; AirtelTigo: 0800-100880</div>
      <div>Other Lines +233 302 633 988</div>
      <div style="margin-top:8px;">
        <strong>W:</strong>
        <a href="https://www.myumbbank.com" style="color:#6a1b9a;text-decoration:none;">www.myumbbank.com</a>
      </div>
      <div style="margin-top:10px;color:#666666;">Universal Merchant Bank Limited</div>
      <div style="color:#666666;">SSNIT Emporium, Airport City, Liberation Road</div>
      <div style="color:#666666;">P.O. Box GP 401 | Accra-Ghana</div>
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:12px;">
        <tr>
          <td style="padding-right:6px;">
            <a href="https://www.facebook.com/myumbbank"><img src="https://cdn-icons-png.flaticon.com/32/733/733547.png" width="20" height="20" alt="Facebook" style="display:block;border:0;" /></a>
          </td>
          <td style="padding-right:6px;">
            <a href="https://www.linkedin.com/company/umb-bank-ghana-limited"><img src="https://cdn-icons-png.flaticon.com/32/3536/3536505.png" width="20" height="20" alt="LinkedIn" style="display:block;border:0;" /></a>
          </td>
          <td style="padding-right:6px;">
            <a href="https://twitter.com/myumbbank"><img src="https://cdn-icons-png.flaticon.com/32/733/733579.png" width="20" height="20" alt="Twitter" style="display:block;border:0;" /></a>
          </td>
          <td style="padding-right:6px;">
            <a href="https://www.instagram.com/myumbbank"><img src="https://cdn-icons-png.flaticon.com/32/2111/2111463.png" width="20" height="20" alt="Instagram" style="display:block;border:0;" /></a>
          </td>
          <td style="padding-right:8px;">
            <a href="https://www.youtube.com/@myumbbank"><img src="https://cdn-icons-png.flaticon.com/32/1384/1384060.png" width="20" height="20" alt="YouTube" style="display:block;border:0;" /></a>
          </td>
          <td style="font-size:13px;color:#444444;padding-left:2px;">@myumbbank</td>
        </tr>
      </table>
    </td>
  </tr>
</table>`.trim();
}

export function emailSignatureText(): string {
  return [
    "",
    "—",
    "Committee Action Monitor | Cyber & Information Security",
    "Universal Merchant Bank Limited",
    "T: +233 302 666 331-6 Ext: 1750 | M: +233 594 332 407",
    "www.myumbbank.com | @myumbbank",
    "This is an automated message. Please do not reply to this email.",
  ].join("\n");
}

/**
 * Full CAM email document: header band + white card body + signature.
 * `bodyHtml` should be inner content only (no outer html/body tags).
 */
export function wrapCamEmail(params: {
  /** Optional preheader / eyebrow above the title */
  eyebrow?: string;
  title: string;
  bodyHtml: string;
  /** Primary CTA button */
  cta?: { label: string; url: string };
}): string {
  const eyebrow = params.eyebrow
    ? `<div style="font-size:11px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:#a78bfa;margin-bottom:6px;">${escapeHtml(params.eyebrow)}</div>`
    : "";
  const cta = params.cta
    ? `<p style="margin:24px 0 8px;">
        <a href="${escapeHtml(params.cta.url)}" style="display:inline-block;background:${BRAND};color:#ffffff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;">${escapeHtml(params.cta.label)}</a>
      </p>`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(params.title)}</title>
</head>
<body style="margin:0;padding:0;background-color:#f1f5f9;font-family:Segoe UI,Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f1f5f9;padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="620" cellpadding="0" cellspacing="0" border="0" style="width:620px;max-width:100%;background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(15,23,42,0.08);">
          <tr>
            <td style="background:linear-gradient(135deg,#5b21b6 0%,#4c1d95 55%,#1e1b4b 100%);padding:22px 28px;">
              <div style="font-size:12px;font-weight:600;color:#e9d5ff;letter-spacing:0.04em;">UNIVERSAL MERCHANT BANK</div>
              <div style="font-size:20px;font-weight:700;color:#ffffff;margin-top:4px;">Committee Action Monitor</div>
            </td>
          </tr>
          <tr>
            <td style="height:4px;background-color:${GOLD};font-size:0;line-height:0;">&nbsp;</td>
          </tr>
          <tr>
            <td style="padding:28px 28px 8px 28px;color:#0f172a;font-size:15px;line-height:1.55;">
              ${eyebrow}
              <h1 style="margin:0 0 16px 0;font-size:18px;font-weight:700;color:#0f172a;line-height:1.3;">${escapeHtml(params.title)}</h1>
              ${params.bodyHtml}
              ${cta}
            </td>
          </tr>
          <tr>
            <td style="padding:8px 28px 28px 28px;">
              ${emailSignatureHtml()}
              <p style="margin:16px 0 0 0;font-size:11px;color:#94a3b8;line-height:1.4;">
                This message was sent automatically by Committee Action Monitor. Please do not reply to this email.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`.trim();
}

/** Detail rows as a clean definition table */
export function emailDetailTable(rows: { label: string; value: string }[]): string {
  const trs = rows
    .filter((r) => r.value)
    .map(
      (r) => `
    <tr>
      <td style="padding:8px 12px 8px 0;color:#64748b;font-size:13px;vertical-align:top;white-space:nowrap;">${escapeHtml(r.label)}</td>
      <td style="padding:8px 0;color:#0f172a;font-size:13px;font-weight:600;">${r.value}</td>
    </tr>`,
    )
    .join("");
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;margin:12px 0;border-collapse:collapse;">${trs}</table>`;
}
