// Import required modules
const { startReferralMonitoring, sendStillAliveNotification, setupBot } = require("./services/bot")
const { sendEmail } = require("./services/email")

// Set up interval for "still alive" notifications (every 30 minutes)
const STILL_ALIVE_INTERVAL_MS = 30 * 60 * 1000 // 30 minutes (changed from 1 hour)

// Track startup time
const startupTime = new Date()

// Main function to start the bot
async function startBot() {
  console.log("Starting Availity monitoring bot...")

  try {
    // Send startup notification
    await sendEmail(
      "Availity Monitoring Bot Started",
      `The Availity monitoring bot has been started at ${new Date().toLocaleString()}.\n\n` +
        `The bot will check for new referrals every 10 seconds and notify you when new members are detected.\n\n` +
        `This is an automated message from the monitoring system.`,
    )

    // Initialize the bot
    await setupBot()

    // Start the full monitoring
    await startReferralMonitoring()

    // Set up "still alive" notifications every 30 minutes
    setInterval(async () => {
      try {
        await sendStillAliveNotification()
      } catch (error) {
        console.error("Error sending still alive notification:", error)
      }
    }, STILL_ALIVE_INTERVAL_MS)

    console.log("Bot startup complete")
  } catch (error) {
    console.error("Error starting bot:", error)
    // No error email - just log the error
  }
}

// Start the bot
startBot()

