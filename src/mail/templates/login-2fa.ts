/**
 * Template HTML do e-mail de código 2FA para login.
 */
export function login2faTemplate(name: string, code: string): string {
  return `<!doctype html>
<html lang="pt-BR">
  <body style="margin:0;padding:0;background:#0b1220;font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#e2e8f0;">
    <table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 0;">
      <tr><td align="center">
        <table width="480" cellpadding="0" cellspacing="0" style="background:#111827;border:1px solid #1f2937;border-radius:12px;overflow:hidden;">
          <tr><td style="padding:24px 32px;border-bottom:1px solid #1f2937;">
            <p style="margin:0;font-size:18px;font-weight:600;letter-spacing:-0.01em;color:#f8fafc;">InvestWealth</p>
            <p style="margin:4px 0 0;font-size:11px;text-transform:uppercase;letter-spacing:0.18em;color:#64748b;">Autenticação em Dois Fatores</p>
          </td></tr>
          <tr><td style="padding:32px;">
            <h1 style="margin:0 0 12px;font-size:22px;color:#f8fafc;">Código de Acesso</h1>
            <p style="margin:0 0 20px;font-size:14px;line-height:1.6;color:#cbd5e1;">
              Olá, <strong style="color:#f8fafc;">${escapeHtml(name)}</strong>. Use o código abaixo para concluir o login
              na sua sessão segura.
            </p>
            <div style="text-align:center;padding:24px;background:#0b1220;border:1px solid #1f2937;border-radius:8px;">
              <p style="margin:0 0 8px;font-size:11px;text-transform:uppercase;letter-spacing:0.18em;color:#64748b;">Código 2FA</p>
              <p style="margin:0;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:34px;font-weight:700;letter-spacing:0.32em;color:#22d3ee;">${code}</p>
            </div>
            <p style="margin:20px 0 0;font-size:12px;color:#64748b;">O código expira em 15 minutos. Se você não está tentando entrar, ignore este e-mail e considere trocar sua senha.</p>
          </td></tr>
          <tr><td style="padding:16px 32px;border-top:1px solid #1f2937;">
            <p style="margin:0;font-size:11px;text-transform:uppercase;letter-spacing:0.18em;color:#475569;">Sessão Criptografada AES-256</p>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
}

export function login2faSubject(): string {
  return 'InvestWealth — Código de Login 2FA';
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
