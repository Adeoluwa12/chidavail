const { spawn } = require("child_process")
const fs = require("fs")
const path = require("path")

// Ensure logs directory exists
const logsDir = path.join(__dirname, "logs")
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true })
}

// Create log file streams
const logFile = fs.createWriteStream(path.join(logsDir, "process-manager.log"), { flags: "a" })

// Log function
function log(message) {
  const timestamp = new Date().toISOString()
  const logMessage = `[${timestamp}] ${message}`
  console.log(logMessage)
  logFile.write(logMessage + "\n")
}

// Function to start the bot
function startBot() {
  log("Starting bot process...")

  // Use npm run start-web to start the bot
  const botProcess = spawn("npm", ["run", "start-web"], {
    stdio: "pipe",
    shell: true,
  })

  // Handle stdout
  botProcess.stdout.on("data", (data) => {
    process.stdout.write(data)

    // Also write to log file
    fs.appendFileSync(path.join(logsDir, "bot-stdout.log"), data)
  })

  // Handle stderr
  botProcess.stderr.on("data", (data) => {
    process.stderr.write(data)

    // Also write to log file
    fs.appendFileSync(path.join(logsDir, "bot-stderr.log"), data)
  })

  // Handle process exit
  botProcess.on("close", (code) => {
    log(`Bot process exited with code ${code}`)

    // Restart the bot after a short delay
    log("Restarting bot in 5 seconds...")
    setTimeout(startBot, 5000)
  })

  return botProcess
}

// Start the bot initially
startBot()

// Handle process manager termination
process.on("SIGINT", () => {
  log("Process manager received SIGINT, shutting down...")
  process.exit(0)
})

process.on("SIGTERM", () => {
  log("Process manager received SIGTERM, shutting down...")
  process.exit(0)
})
