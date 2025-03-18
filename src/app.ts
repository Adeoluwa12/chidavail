import express from "express"
import mongoose from "mongoose"
import path from "path"
import { config } from "dotenv"
import { setupBot, loginToAvaility, startReferralMonitoring } from "./services/bot" // Import bot functions
import { sendEmail } from "./services/email"

// Load environment variables
config()

const app = express()
const PORT = process.env.PORT || 7009

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
      res.status(200).json({ message: "Bot started and logged in successfully!" })
    } else {
      res.status(500).json({ message: "Bot failed to log in." })
    }
  } catch (error) {
    console.error("❌ Error starting bot:", error)
    res.status(500).json({ message: "Failed to start bot.", error: (error as any).message })
  }
})

// Health check endpoint
app.get("/health", (req, res) => {
  res.status(200).json({ status: "ok", timestamp: new Date().toISOString() })
})

// Database connection
mongoose
  .connect(process.env.MONGODB_URI || "mongodb://localhost:27017/availity-automation")
  .then(async () => {
    console.log("Connected to MongoDB")

    // Initialize the bot and start monitoring
    console.log("Initializing bot and starting monitoring...")
    try {
      await startReferralMonitoring()

      // Send startup notification
      await sendEmail(
        "Availity Monitoring Bot Started",
        `The Availity monitoring bot has been started successfully at ${new Date().toLocaleString()}.\n\n` +
          `The bot will check for new referrals every 30 seconds and notify you of any changes.\n\n` +
          `This is an automated message from the monitoring system.`,
      )
    } catch (err) {
      console.error("Failed to start monitoring:", err)

      // Send error notification
      await sendEmail(
        "⚠️ Availity Monitoring Bot Failed to Start",
        `The Availity monitoring bot failed to start at ${new Date().toLocaleString()}.\n\n` +
          `Error: ${err}\n\n` +
          `Please check the logs and restart the application.\n\n` +
          `This is an automated message from the monitoring system.`,
      )
    }

    console.log("Application initialization completed successfully")
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

