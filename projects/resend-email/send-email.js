import { Resend } from 'resend';
import 'dotenv/config';

const resend = new Resend(process.env.RESEND_API_KEY);

async function sendUpgradeEmail() {
  const { data, error } = await resend.emails.send({
    from: 'Pulseflow <hello@pulseflow.co>',
    to: ['olicrypt@gmail.com'],
    subject: 'Automate Your PulseChain Strategy',
    headers: {
      'List-Unsubscribe': '<https://pulseflow.co/unsubscribe>',
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    },
    html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Pulseflow</title>
</head>
<body style="margin:0;padding:0;font-family:DM Sans,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;line-height:1.6;color:#1e293b;">
  <span style="display:none;color:transparent;font-size:0;line-height:0;max-height:0;overflow:hidden;">Automate your PulseChain strategy with DCA, portfolio rebalancing, and more — no coding required.</span>
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:transparent;">
    <tr>
      <td align="center" style="padding:40px 20px;">
        <table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;">
          <tr>
            <td align="center" style="padding-bottom:32px;">
              <img src="https://pdf6oe852d.ufs.sh/f/6QWljTiolAt8i7l9ILuUYSrl6j3AM05FvyebNKthDZEwHGi2" alt="Pulseflow" width="100" style="display:block;border:0;">
            </td>
          </tr>
          <tr>
            <td style="background-color:transparent;padding:40px;border-radius:12px;">
              <h1 style="font-size:24px;font-weight:600;color:#1e293b;margin:0 0 16px 0;">Automate Your PulseChain Strategy</h1>
              <p style="margin:0 0 16px 0;color:#475569;text-align:left;">You created a Pulseflow account but haven't unlocked the full power of automated trading yet. Here's what you're missing:</p>
              
              <ul style="margin:24px 0;padding:0;list-style:none;">
                <li style="margin:12px 0;padding-left:20px;position:relative;color:#334155;text-align:left;">
                  <strong style="color:#1e293b;">Automated Dollar Cost Averaging</strong> — Set it and forget it. Buy your favorite tokens on a schedule without manual trades.
                </li>
                <li style="margin:12px 0;padding-left:20px;position:relative;color:#334155;text-align:left;">
                  <strong style="color:#1e293b;">Portfolio Rebalancing</strong> — Swap, adjust, and rebalance multiple positions in a single flow.
                </li>
                <li style="margin:12px 0;padding-left:20px;position:relative;color:#334155;text-align:left;">
                  <strong style="color:#1e293b;">Liquidity Management</strong> — Add or remove liquidity automatically based on your conditions.
                </li>
                <li style="margin:12px 0;padding-left:20px;position:relative;color:#334155;text-align:left;">
                  <strong style="color:#1e293b;">Price-Triggered Actions</strong> — Buy the dip, take profits, or stop losses without watching the charts.
                </li>
              </ul>
              
              <p style="margin:0 0 16px 0;color:#475569;text-align:left;">No coding required. Connect your wallet, build your flow, and let Pulseflow handle the rest.</p>
              
              <div style="background-color:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:20px;margin:24px 0;text-align:center;">
                <div style="font-size:20px;font-weight:700;color:#16a34a;letter-spacing:2px;">CNY20</div>
                <div style="font-size:13px;color:#166534;margin-top:8px;">Use this code for 20% off Pro and Ultra plans</div>
              </div>
              
              <table cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="border-radius:8px;background-color:#1e293b;">
                    <a href="https://pulseflow.co/plans" style="display:inline-block;padding:14px 32px;color:#ffffff;text-decoration:none;font-weight:600;font-size:16px;">View Plans</a>
                  </td>
                </tr>
              </table>
              
              <hr style="border:none;border-top:1px solid #e2e8f0;margin:32px 0;">
              
              <p style="margin:0;font-size:14px;color:#64748b;">Questions? Just reply to this email — I'm happy to help.</p>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding-top:24px;color:#94a3b8;font-size:13px;">
              <p style="margin:0 0 8px 0;">Pulseflow — No-Code Automation for PulseChain</p>
              <a href="https://pulseflow.co/unsubscribe" style="color:#1e293b;text-decoration:none;">Unsubscribe</a>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `,
  });

  if (error) {
    console.error('Error:', error);
    return;
  }

  console.log('Email sent:', data);
}

// Run
sendUpgradeEmail();
