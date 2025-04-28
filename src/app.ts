import express from "express"
import path from "path"
import { config } from "dotenv"
import { setupBot, loginToAvaility, startReferralMonitoring, sendStillAliveNotification } from "./services/bot"
import { scheduleStatusEmails } from "./scheduled-status"
import { connectToDatabase, isDatabaseConnected } from "./services/database"
import { StatusLog } from "./models/status-log"
import { Referral } from "./models/referrals"
import fs from "fs"
import os from "os"

// Load environment variables
config()

const app = express()
const PORT = process.env.PORT || 7008
const LOG_FILE = path.join(__dirname, "../logs/bot.log")

// Ensure logs directory exists
if (!fs.existsSync(path.join(__dirname, "../logs"))) {
  fs.mkdirSync(path.join(__dirname, "../logs"), { recursive: true })
}

// Middleware
app.use(express.json())
app.use(express.urlencoded({ extended: true }))
app.use(express.static(path.join(__dirname, "public")))

// Track if the bot is running
let isBotRunning = false
let statusNotificationInterval: NodeJS.Timeout[] | null = null
let botStartTime: Date | null = null

// Simple in-memory log storage (last 100 logs)
const memoryLogs: Array<{ timestamp: Date; message: string }> = []

// Function to add a log entry
function addLog(message: string): void {
  const logEntry = {
    timestamp: new Date(),
    message,
  }

  // Add to memory logs (keep only last 100)
  memoryLogs.unshift(logEntry)
  if (memoryLogs.length > 100) {
    memoryLogs.pop()
  }

  // Write to log file
  const logLine = `[${logEntry.timestamp.toISOString()}] ${message}\n`
  fs.appendFile(LOG_FILE, logLine, (err) => {
    if (err) console.error("Error writing to log file:", err)
  })

  // Also log to console
  console.log(message)
}

// Function to start the bot
async function startBot(): Promise<void> {
  if (isBotRunning) {
    addLog("Bot is already running, skipping startup")
    return
  }

  try {
    addLog("🚀 Starting bot automatically...")
    await connectToDatabase()
    await setupBot() // Initialize the bot
    const loginSuccess = await loginToAvaility() // Attempt to log in

    if (loginSuccess) {
      isBotRunning = true
      botStartTime = new Date()

      // Get current members from database for the startup notification
      const currentMembers = await Referral.find().sort({ createdAt: -1 }).limit(10)
      addLog(`Found ${currentMembers.length} members in database`)

      // Start the monitoring process
      startReferralMonitoring().catch((err: Error) => {
        addLog(`Error in monitoring process: ${err.message}`)
        isBotRunning = false

        // Don't send notification for "Request is already handled" errors
        if (err.message && err.message.includes("Request is already handled")) {
          addLog("Ignoring 'Request is already handled' error")
          return // Just ignore these errors
        }
      })

      // Set up scheduled status notifications (morning, afternoon, evening, midnight)
      if (statusNotificationInterval) {
        // Clear any existing timeouts
        if (Array.isArray(statusNotificationInterval)) {
          statusNotificationInterval.forEach((timeout) => clearTimeout(timeout))
        }
      }

      // Schedule status emails at fixed times
      statusNotificationInterval = scheduleStatusEmails(sendStillAliveNotification)
      addLog("Set up status notifications for morning, afternoon, evening, and midnight with restart recovery")

      addLog("Bot started and logged in successfully!")
      return
    } else {
      addLog("Bot failed to log in during startup")
      throw new Error("Login failed")
    }
  } catch (error) {
    addLog(`❌ Error starting bot: ${error instanceof Error ? error.message : String(error)}`)
    isBotRunning = false
    throw error
  }
}

// Route to manually start the bot
app.post("/start-bot", async (req, res): Promise<any> => {
  try {
    if (isBotRunning) {
      return res.status(200).json({ message: "Bot is already running!" })
    }

    addLog("🚀 Starting bot from web interface...")
    await startBot()
    res.status(200).json({ message: "Bot started and logged in successfully!" })
  } catch (error) {
    addLog(`❌ Error starting bot from web interface: ${error instanceof Error ? error.message : String(error)}`)
    isBotRunning = false
    res.status(500).json({
      message: "Failed to start bot.",
      error: error instanceof Error ? error.message : String(error),
    })
  }
})

// Route to manually send a "still alive" notification
app.post("/send-status", async (req, res) => {
  try {
    addLog("Manually sending status notification...")
    await sendStillAliveNotification()
    addLog("Status notification sent successfully")
    res.status(200).json({ message: "Status notification sent successfully!" })
  } catch (error) {
    addLog(`Error sending status notification: ${error instanceof Error ? error.message : String(error)}`)
    res.status(500).json({
      message: "Failed to send status notification",
      error: error instanceof Error ? error.message : String(error),
    })
  }
})

// Route to get logs
app.get("/logs", (req, res) => {
  // Return the in-memory logs
  res.status(200).json({ logs: memoryLogs })
})

// Enhanced health check endpoint with more stats
app.get("/health", async (req, res) => {
  // Get uptime if bot is running
  let uptime = "Not running"
  if (isBotRunning && botStartTime) {
    const uptimeMs = Date.now() - botStartTime.getTime()
    const uptimeHours = Math.floor(uptimeMs / (1000 * 60 * 60))
    const uptimeMinutes = Math.floor((uptimeMs % (1000 * 60 * 60)) / (1000 * 60))
    uptime = `${uptimeHours}h ${uptimeMinutes}m`
  }

  // Get last status email time
  let lastStatusEmail = "Never"
  try {
    const latestStatus = await StatusLog.findOne().sort({ sentAt: -1 })
    if (latestStatus) {
      lastStatusEmail = new Date(latestStatus.sentAt).toLocaleString()
    }
  } catch (error) {
    console.error("Error fetching last status email:", error)
  }

  // Get memory usage
  const memoryUsage = process.memoryUsage()
  const memoryUsageFormatted = `${Math.round(memoryUsage.rss / 1024 / 1024)} MB`

  // Get CPU usage (simplified)
  const cpuUsage = `${Math.round(os.loadavg()[0] * 100) / 100}`

  // Get members count
  let membersCount = 0
  try {
    membersCount = await Referral.countDocuments()
  } catch (error) {
    console.error("Error counting members:", error)
  }

  res.status(200).json({
    status: "ok",
    timestamp: new Date().toISOString(),
    botRunning: isBotRunning,
    stats: {
      uptime,
      membersCount,
      lastStatusEmail,
      memoryUsage: memoryUsageFormatted,
      cpuUsage,
      dbConnected: isDatabaseConnected(),
    },
  })
})

// Database connection with improved configuration
connectToDatabase()
  .then(() => {
    addLog("Connected to MongoDB")

    // Start the bot automatically after database connection is established
    startBot().catch((err: Error) => {
      addLog(`Failed to start bot automatically: ${err.message}`)
    })
  })
  .catch((err: Error) => {
    addLog(`MongoDB connection error: ${err.message}`)

    // Add more detailed error logging
    if (err.name === "MongoServerSelectionError") {
      addLog("Could not connect to any MongoDB servers in your connection string")
      addLog("Please check your MONGODB_URI environment variable")
    }

    // Even if MongoDB fails, we can still start the bot
    // It will just log errors when trying to access the database
    addLog("Starting bot despite MongoDB connection failure...")
    startBot().catch((botErr: Error) => {
      addLog(`Failed to start bot after MongoDB connection failure: ${botErr.message}`)
    })
  })

// Set up process error handlers to keep the app running
process.on("uncaughtException", async (error) => {
  addLog(`Uncaught Exception: ${error.message}`)

  // Don't send emails for "Request is already handled" errors
  if (error.message && error.message.includes("Request is already handled")) {
    addLog("Ignoring 'Request is already handled' error")
    return // Just ignore these errors
  }

  // Don't exit the process, try to keep running
})

process.on("unhandledRejection", async (reason, promise) => {
  addLog(`Unhandled Promise Rejection: ${reason instanceof Error ? reason.message : String(reason)}`)

  // Don't send emails for "Request is already handled" errors
  if (reason instanceof Error && reason.message && reason.message.includes("Request is already handled")) {
    addLog("Ignoring 'Request is already handled' error")
    return // Just ignore these errors
  }

  // Don't exit the process, try to keep running
})

// Start server
app.listen(PORT, () => {
  addLog(`Server running on port ${PORT}`)
})

export default app
