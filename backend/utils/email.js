const nodemailer = require('nodemailer');

// Create transporter - uses environment variables if set, otherwise logs to console
const createTransporter = () => {
  if (process.env.SMTP_HOST && process.env.SMTP_USER) {
    return nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT) || 587,
      secure: false,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  }
  return null;
};

const sendEmail = async ({ to, subject, html, attachments }) => {
  const transporter = createTransporter();

  if (!transporter) {
    console.log('=== EMAIL (no SMTP configured, logging to console) ===');
    console.log(`To: ${to}`);
    console.log(`Subject: ${subject}`);
    console.log(`Body: ${html}`);
    console.log('=== END EMAIL ===');
    return { success: true, info: 'Logged to console (no SMTP configured)' };
  }

  try {
    const info = await transporter.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to,
      subject,
      html,
      attachments: attachments || [],
    });
    return { success: true, info };
  } catch (error) {
    console.error('Email send error:', error);
    return { success: false, error };
  }
};

// Send ticket email to participant (QR as inline CID attachment)
const sendTicketEmail = async (participant, event, ticketId, qrCode) => {
  // Build attachments array for inline QR image
  const attachments = [];
  let qrImgTag = '';
  if (qrCode && qrCode.startsWith('data:image/')) {
    // Extract base64 content from data URL
    const base64Data = qrCode.split(',')[1];
    attachments.push({
      filename: 'qrcode.png',
      content: base64Data,
      encoding: 'base64',
      cid: 'qrcode@felicity',
    });
    qrImgTag = '<div style="text-align: center;"><img src="cid:qrcode@felicity" alt="QR Code" style="width: 200px;"/></div>';
  }

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #6366f1;">🎉 Registration Confirmed - ${event.name}</h2>
      <p>Hi ${participant.firstName},</p>
      <p>You have been successfully registered for <strong>${event.name}</strong>.</p>
      <div style="background: #f8fafc; padding: 20px; border-radius: 8px; margin: 20px 0;">
        <p><strong>Ticket ID:</strong> ${ticketId}</p>
        <p><strong>Event:</strong> ${event.name}</p>
        <p><strong>Type:</strong> ${event.type}</p>
        <p><strong>Date:</strong> ${event.startDate ? new Date(event.startDate).toLocaleDateString() : 'TBA'}</p>
      </div>
      ${qrImgTag}
      <p style="color: #64748b; font-size: 12px;">This is an automated email from the Felicity Event Management System.</p>
    </div>
  `;

  return sendEmail({
    to: participant.email,
    subject: `Ticket Confirmation - ${event.name}`,
    html,
    attachments,
  });
};

// Send merchandise confirmation email (QR as inline CID attachment)
const sendMerchandiseEmail = async (participant, event, ticketId, items, totalAmount, qrCode) => {
  const itemsList = items.map(i => `<li>${i.name} (${i.size || ''} ${i.color || ''}) x${i.quantity} - ₹${i.price * i.quantity}</li>`).join('');

  // Build attachments array for inline QR image
  const attachments = [];
  let qrImgTag = '';
  if (qrCode && qrCode.startsWith('data:image/')) {
    const base64Data = qrCode.split(',')[1];
    attachments.push({
      filename: 'qrcode.png',
      content: base64Data,
      encoding: 'base64',
      cid: 'qrcode@felicity',
    });
    qrImgTag = '<div style="text-align: center;"><img src="cid:qrcode@felicity" alt="QR Code" style="width: 200px;"/></div>';
  }

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #6366f1;">🛍️ Purchase Confirmed - ${event.name}</h2>
      <p>Hi ${participant.firstName},</p>
      <p>Your merchandise purchase has been approved!</p>
      <div style="background: #f8fafc; padding: 20px; border-radius: 8px; margin: 20px 0;">
        <p><strong>Ticket ID:</strong> ${ticketId}</p>
        <p><strong>Items:</strong></p>
        <ul>${itemsList}</ul>
        <p><strong>Total:</strong> ₹${totalAmount}</p>
      </div>
      ${qrImgTag}
      <p style="color: #64748b; font-size: 12px;">This is an automated email from the Felicity Event Management System.</p>
    </div>
  `;

  return sendEmail({
    to: participant.email,
    subject: `Purchase Confirmation - ${event.name}`,
    html,
    attachments,
  });
};

module.exports = { sendEmail, sendTicketEmail, sendMerchandiseEmail };
