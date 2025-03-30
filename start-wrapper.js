const { spawn } = require("child_process")
const fs = require("fs")
const path = require("path")
const { exec } = require("child_process")

// Configuration
const MAX_RUNTIME_MS = 60 * 60 * 1000 // 1 hour exactly
const RESTART_DELAY_MS = 60000 // 1 minute
const LOG_FILE = path.join(__dirname, "bot-restarts.log")

// State tracking
let botProcess = null
let shutdownTimer = null

// Function to log restart events
function logRestart(message) {
  const timestamp = new Date().toISOString()
  const logMessage = `${timestamp} - ${message}\n`

  console.log(message)

  // Append to log file
  fs.appendFileSync(LOG_FILE, logMessage)
}

// Function to start the bot
function startBot() {
  // Start the bot process
  logRestart("Starting bot process...")

  // Use node directly with the compiled JS file
  botProcess = spawn("node", ["dist/botworker.js"], {
    stdio: "inherit",
    env: process.env,
  })

  // Set up the shutdown timer - EXACTLY 1 HOUR
  shutdownTimer = setTimeout(() => {
    logRestart(`Maximum runtime of 60 minutes reached. Shutting down for restart...`)

    if (botProcess) {
      // Send SIGTERM to allow graceful shutdown
      botProcess.kill("SIGTERM")

      // Force kill after 10 seconds if not exited
      setTimeout(() => {
        if (botProcess) {
          logRestart("Forcing process termination...")
          botProcess.kill("SIGKILL")
        }
      }, 10000)
    }
  }, MAX_RUNTIME_MS)

  // Handle process exit
  botProcess.on("exit", (code, signal) => {
    logRestart(`Bot process exited with code ${code} and signal ${signal}`)

    // Clear the shutdown timer if it exists
    if (shutdownTimer) {
      clearTimeout(shutdownTimer)
      shutdownTimer = null
    }

    // Schedule restart with delay
    logRestart(`Scheduling restart in ${RESTART_DELAY_MS / 1000} seconds...`)
    setTimeout(() => {
      // Use npm start to restart the process
      exec("npm start", (error, stdout, stderr) => {
        if (error) {
          logRestart(`Error restarting with npm start: ${error.message}`)
          // Fall back to direct restart
          startBot()
        } else {
          logRestart("Process restarted with npm start")
          // Exit this process since npm start will create a new one
          process.exit(0)
        }
      })
    }, RESTART_DELAY_MS)
  })

  // Handle process errors
  botProcess.on("error", (err) => {
    logRestart(`Bot process error: ${err.message}`)
  })
}

// Handle script termination
process.on("SIGINT", () => {
  logRestart("Received SIGINT. Shutting down...")
  if (shutdownTimer) {
    clearTimeout(shutdownTimer)
  }
  if (botProcess) {
    botProcess.kill("SIGINT")
  }
  process.exit(0)
})

process.on("SIGTERM", () => {
  logRestart("Received SIGTERM. Shutting down...")
  if (shutdownTimer) {
    clearTimeout(shutdownTimer)
  }
  if (botProcess) {
    botProcess.kill("SIGTERM")
  }
  process.exit(0)
})

// Start the bot
startBot()

