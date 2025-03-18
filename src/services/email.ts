import nodemailer from "nodemailer"
import { config } from "dotenv"

config()

// Create reusable transporter
const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST || "smtp.sendgrid.net",
  port: Number.parseInt(process.env.EMAIL_PORT || "587", 10),
  secure: process.env.EMAIL_SECURE === "true",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
  tls: {
    rejectUnauthorized: false, // Remove in production for stricter security
  },
})

// Verify transporter with retry
async function verifyTransporter(attempts = 3, delayMs = 5000) {
  for (let i = 0; i < attempts; i++) {
    try {
      await transporter.verify()
      console.log("Email transporter verified successfully")
      return
    } catch (error) {
      console.error(`Email transporter verification attempt ${i + 1} failed:`, error)
      if (i < attempts - 1) await new Promise((resolve) => setTimeout(resolve, delayMs))
    }
  }
}

// Initialize verification
verifyTransporter()

/**
 * Send an email notification
 * @param subject - Email subject
 * @param text - Email body text
 */
export async function sendEmail(subject: string, text: string): Promise<void> {
  try {
    const recipients = process.env.EMAIL_RECIPIENTS?.split(",").map((r) => r.trim()) || []

    if (recipients.length === 0) {
      console.log("No email recipients configured, skipping email")
      return
    }

    console.log(`Sending email "${subject}" to ${recipients.length} recipients`)

    // Convert plain text to HTML by replacing newlines with <br> tags
    const html = text.replace(/\n/g, "<br>")

    await transporter.sendMail({
      from: process.env.EMAIL_FROM || "adeoyeoluwaferanmi@gmail.com",
      to: recipients.join(","),
      subject,
      text, // Keep the plain text version
      html, // Add HTML version
    })

    console.log("Email sent successfully")
  } catch (error) {
    console.error("Error sending email:", error)
    // Email errors shouldn't stop the application
  }
}

