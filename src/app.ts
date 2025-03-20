import express from "express"
import mongoose from "mongoose"
import path from "path"
import { config } from "dotenv"
import { setupBot, loginToAvaility, startReferralMonitoring } from "./services/bot" // Import bot functions
import { sendEmail } from "./services/email"

// Load environment variables
config()

const app = express()
const PORT = process.env.PORT || 7008

// Middleware
app.use(express.json())
app.use(express.urlencoded({ extended: true }))
app.use(express.static(path.join(__dirname, "public")))

// Route to start the bot
app.post("/start-bot", async (req, res) => {
  try {
    console.log("🚀 Starting bot from interface...")
    await setupBot() // Initialize the bot
    const loginSuccess = await loginToAvaility() // Attempt to log in

    if (loginSuccess) {
      // Get current members from database for the startup notification
      const Referral = mongoose.model("Referral")
      const currentMembers = await Referral.find().sort({ createdAt: -1 }).limit(10)

      // Start the monitoring process
      startReferralMonitoring().catch((err) => {
        console.error("Error in monitoring process:", err)
      })

      // Prepare email content
      let emailContent =
        `The Availity monitoring bot has been started successfully at ${new Date().toLocaleString()}.\n\n` +
        `The bot will check for new referrals every 30 seconds and notify you of any changes.\n\n`

      // Add current members to the email if there are any
      if (currentMembers && currentMembers.length > 0) {
        emailContent += `Current Members in Database:\n\n`

        currentMembers.forEach((member, index) => {
          emailContent += `Member ${index + 1}:\n`
          emailContent += `Name: ${member.memberName}\n`
          emailContent += `ID: ${member.memberID}\n`

          if (member.serviceName) {
            emailContent += `Service: ${member.serviceName}\n`
          }

          if (member.status) {
            emailContent += `Status: ${member.status}\n`
          }

          if (member.county) {
            emailContent += `County: ${member.county}\n`
          }

          if (member.requestOn) {
            emailContent += `Request Date: ${member.requestOn}\n`
          }

          emailContent += `\n`
        })
      } else {
        emailContent += `No members currently in the database. You will be notified when new referrals are detected.\n\n`
      }

      emailContent += `This is an automated message from the monitoring system.`

      // Send startup notification with member information
      await sendEmail("Availity Monitoring Bot Started", emailContent)

      res.status(200).json({ message: "Bot started and logged in successfully!" })
    } else {
      res.status(500).json({ message: "Bot failed to log in." })
    }
  } catch (error) {
    console.error("❌ Error starting bot:", error)

    // Send error notification
    try {
      await sendEmail(
        "⚠️ Availity Monitoring Bot Failed to Start",
        `The Availity monitoring bot failed to start at ${new Date().toLocaleString()}.\n\n` +
          `Error: ${error}\n\n` +
          `Please check the logs and restart the application.\n\n` +
          `This is an automated message from the monitoring system.`,
      )
    } catch (emailError) {
      console.error("Failed to send error notification email:", emailError)
    }

    res.status(500).json({ message: "Failed to start bot.", error: (error as any).message })
  }
})

// Health check endpoint
app.get("/health", (req, res) => {
  res.status(200).json({ status: "ok", timestamp: new Date().toISOString() })
})

// Create a separate file to store the auto-start state
let autoStartInitiated = false

// Database connection
mongoose
  .connect(process.env.MONGODB_URI || "")
  .then(() => {
    console.log("Connected to MongoDB")

    // IMPORTANT: This is where the auto-start was happening
    // We're now explicitly checking and setting a flag to prevent it
    if (process.env.NODE_ENV === "development" || autoStartInitiated) {
      console.log("Server ready - waiting for manual bot start via UI")
    } else {
      // This code was likely being executed in production but not in development
      // Now we're explicitly preventing it from running more than once
      autoStartInitiated = true
      console.log("Server ready - waiting for manual bot start via UI")
    }
  })
  .catch((err) => {
    console.error("MongoDB connection error:", err)
  })

// Set up process error handlers to keep the app running
process.on("uncaughtException", async (error) => {
  console.error("Uncaught Exception:", error)

  try {
    // Send notification about the error
    await sendEmail(
      "⚠️ Availity Bot Encountered an Error",
      `The Availity monitoring bot encountered an uncaught exception at ${new Date().toLocaleString()}.\n\n` +
        `Error: ${error.message}\n\n` +
        `Stack: ${error.stack}\n\n` +
        `The application will attempt to continue running, but you may need to restart it if monitoring stops.\n\n` +
        `This is an automated message from the monitoring system.`,
    )
  } catch (emailError) {
    console.error("Failed to send error notification email:", emailError)
  }

  // Don't exit the process, try to keep running
})

process.on("unhandledRejection", async (reason, promise) => {
  console.error("Unhandled Promise Rejection:", reason)

  try {
    // Send notification about the rejection
    await sendEmail(
      "⚠️ Availity Bot Encountered a Promise Rejection",
      `The Availity monitoring bot encountered an unhandled promise rejection at ${new Date().toLocaleString()}.\n\n` +
        `Reason: ${reason}\n\n` +
        `The application will attempt to continue running, but you may need to restart it if monitoring stops.\n\n` +
        `This is an automated message from the monitoring system.`,
    )
  } catch (emailError) {
    console.error("Failed to send rejection notification email:", emailError)
  }

  // Don't exit the process, try to keep running
})

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`)
})

export default app

