const QRCode = require('qrcode');

// Generate a QR code as a base64 data URL
const generateQR = async (data) => {
  try {
    const qrDataUrl = await QRCode.toDataURL(JSON.stringify(data), {
      width: 300,
      margin: 2,
      color: {
        dark: '#1e293b',
        light: '#ffffff'
      }
    });
    return qrDataUrl;
  } catch (error) {
    console.error('QR generation error:', error);
    return null;
  }
};

module.exports = { generateQR };
