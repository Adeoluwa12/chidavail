// import express from "express"
// import mongoose from "mongoose"
// import path from "path"
// import { config } from "dotenv"
// import { setupBot, loginToAvaility, startReferralMonitoring, sendStillAliveNotification } from "./services/bot"
// import { sendEmail } from "./services/email"

// // Load environment variables
// config()

// const app = express()
// const PORT = process.env.PORT || 7008

// // Middleware
// app.use(express.json())
// app.use(express.urlencoded({ extended: true }))
// app.use(express.static(path.join(__dirname, "public")))

// // Track if the bot is running
// let isBotRunning = false
// let statusNotificationInterval: NodeJS.Timeout | null = null

// // Function to start the bot
// async function startBot() {
//   if (isBotRunning) {
//     console.log("Bot is already running, skipping startup")
//     return
//   }

//   try {
//     console.log("🚀 Starting bot automatically...")
//     await setupBot() // Initialize the bot
//     const loginSuccess = await loginToAvaility() // Attempt to log in

//     if (loginSuccess) {
//       isBotRunning = true

//       // Get current members from database for the startup notification
//       const Referral = mongoose.model("Referral")
//       const currentMembers = await Referral.find().sort({ createdAt: -1 }).limit(10)

//       // Start the monitoring process
//       startReferralMonitoring().catch((err: Error) => {
//         console.error("Error in monitoring process:", err)
//         isBotRunning = false

//         // Don't send notification for "Request is already handled" errors
//         if (err.message && err.message.includes("Request is already handled")) {
//           console.log("Ignoring 'Request is already handled' error")
//           return // Just ignore these errors
//         }

//         // Send notification about other errors
//         sendEmail(
//           "Chcking in....",
//           // `The Availity monitoring bot encountered an error during monitoring at ${new Date().toLocaleString()}.\n\n` +
//           `Message: No issues\n\n` +
//             `The application continues to run.\n\n` +
//             `This is an automated message from the monitoring system.`,
//         ).catch((emailErr) => console.error(" notification:", emailErr))
//       })

//       // Prepare email content
//       let emailContent =
//         `The Availity monitoring bot has been started automatically at ${new Date().toLocaleString()}.\n\n` +
//         `The bot will check for new referrals every 10 seconds and notify you of any changes.\n\n`

//       // Add current members to the email if there are any
//       if (currentMembers && currentMembers.length > 0) {
//         emailContent += `Current Members in Database:\n\n`

//         currentMembers.forEach((member, index) => {
//           emailContent += `Member ${index + 1}:\n`
//           emailContent += `Name: ${member.memberName}\n`
//           emailContent += `ID: ${member.memberID}\n`

//           if (member.serviceName) {
//             emailContent += `Service: ${member.serviceName}\n`
//           }

//           if (member.status) {
//             emailContent += `Status: ${member.status}\n`
//           }

//           if (member.county) {
//             emailContent += `County: ${member.county}\n`
//           }

//           if (member.requestOn) {
//             emailContent += `Request Date: ${member.requestOn}\n`
//           }

//           emailContent += `\n`
//         })
//       } else {
//         emailContent += `No members currently in the database. You will be notified when new referrals are detected.\n\n`
//       }

//       emailContent += `This is an automated message from the monitoring system.`

//       // Send startup notification with member information
//       await sendEmail("Availity Monitoring Bot Started", emailContent)

//       // Set up the "still alive" notification interval (every 2 hours)
//       if (statusNotificationInterval) {
//         clearInterval(statusNotificationInterval)
//       }

//       statusNotificationInterval = setInterval(
//         async () => {
//           await sendStillAliveNotification()
//         },
//         30 * 60 * 1000, // 30 minutes in milliseconds (changed from 0.5 * 60 * 60 * 1000)
//       ) // 2 hours in milliseconds

//       console.log("Set up status notification to send every 30 minutes") // Updated log message

//       console.log("Bot started and logged in successfully!")
//     } else {
//       console.error("Bot failed to log in during automatic startup")

//       // Send error notification
//       await sendEmail(
//         "Just checking in",
//         `Bot is logging in during automatic startup at ${new Date().toLocaleString()}.\n\n` +
//           `You may please ignore.\n\n` +
//           `This is an automated message from the monitoring system.`,
//       )
//     }
//   } catch (error) {
//     console.error("❌ Error starting bot automatically:", error)
//     isBotRunning = false

//     // Send error notification
//     try {
//       await sendEmail(
//         "Just checking in",
//         `Bot is logging in during automatic startup at ${new Date().toLocaleString()}.\n\n` +
//           `You may please ignore.\n\n` +
//           `This is an automated message from the monitoring system.`,
//       )
//     } catch (emailError) {
//       console.error("Failed to send error notification email:", emailError)
//     }
//   }
// }

// // Route to manually start the bot
// app.post("/start-bot", async (req, res): Promise<any> => {
//   try {
//     if (isBotRunning) {
//       return res.status(200).json({ message: "Bot is already running!" })
//     }

//     console.log("🚀 Starting bot from interface...")
//     await setupBot() // Initialize the bot
//     const loginSuccess = await loginToAvaility() // Attempt to log in

//     if (loginSuccess) {
//       isBotRunning = true

//       // Get current members from database for the startup notification
//       const Referral = mongoose.model("Referral")
//       const currentMembers = await Referral.find().sort({ createdAt: -1 }).limit(10)

//       // Start the monitoring process
//       startReferralMonitoring().catch((err: Error) => {
//         console.error("Error in monitoring process:", err)
//         isBotRunning = false
//       })

//       // Prepare email content
//       let emailContent =
//         `The Availity monitoring bot has been started manually at ${new Date().toLocaleString()}.\n\n` +
//         `The bot will check for new referrals every 30 seconds and notify you of any changes.\n\n`

//       // Add current members to the email if there are any
//       if (currentMembers && currentMembers.length > 0) {
//         emailContent += `Current Members in Database:\n\n`

//         currentMembers.forEach((member, index) => {
//           emailContent += `Member ${index + 1}:\n`
//           emailContent += `Name: ${member.memberName}\n`
//           emailContent += `ID: ${member.memberID}\n`

//           if (member.serviceName) {
//             emailContent += `Service: ${member.serviceName}\n`
//           }

//           if (member.status) {
//             emailContent += `Status: ${member.status}\n`
//           }

//           if (member.county) {
//             emailContent += `County: ${member.county}\n`
//           }

//           if (member.requestOn) {
//             emailContent += `Request Date: ${member.requestOn}\n`
//           }

//           emailContent += `\n`
//         })
//       } else {
//         emailContent += `No members currently in the database. You will be notified when new referrals are detected.\n\n`
//       }

//       emailContent += `This is an automated message from the monitoring system.`

//       // Send startup notification with member information
//       await sendEmail("Availity Monitoring Bot Started", emailContent)

//       // Set up the "still alive" notification interval (every 2 hours)
//       if (statusNotificationInterval) {
//         clearInterval(statusNotificationInterval)
//       }

//       statusNotificationInterval = setInterval(
//         async () => {
//           await sendStillAliveNotification()
//         },
//         30 * 60 * 1000, // 30 minutes in milliseconds (changed from 0.5 * 60 * 60 * 1000)
//       ) // 2 hours in milliseconds

//       console.log("Set up status notification to send every 30 minutes") // Updated log message

//       res.status(200).json({ message: "Bot started and logged in successfully!" })
//     } else {
//       res.status(500).json({ message: "Bot failed to log in." })
//     }
//   } catch (error) {
//     console.error("❌ Error starting bot:", error)
//     isBotRunning = false

//     // Send error notification
//     try {
//       await sendEmail(
//         "Just checking in",
//         `Bot is logging in during automatic startup at ${new Date().toLocaleString()}.\n\n` +
//           `You may please ignore.\n\n` +
//           `This is an automated message from the monitoring system.`,
//       )
//     } catch (emailError) {
//       console.error("Failed to send error notification email:", emailError)
//     }

//     res.status(500).json({ message: "Failed to start bot.", error: (error as any).message })
//   }
// })

// // Route to manually send a "still alive" notification
// app.post("/send-status", async (req, res) => {
//   try {
//     await sendStillAliveNotification()
//     res.status(200).json({ message: "Status notification sent successfully!" })
//   } catch (error) {
//     console.error("Error sending status notification:", error)
//     res.status(500).json({ message: "Failed to send status notification", error: (error as any).message })
//   }
// })

// // Health check endpoint
// app.get("/health", (req, res) => {
//   res.status(200).json({
//     status: "ok",
//     timestamp: new Date().toISOString(),
//     botRunning: isBotRunning,
//   })
// })

// // Database connection with improved configuration
// mongoose
//   .connect(process.env.MONGODB_URI || "", {
//     // Add connection options to handle timeouts and retries better
//     serverSelectionTimeoutMS: 30000, // Increase timeout from 10s to 30s
//     socketTimeoutMS: 45000, // How long the socket can be idle before closing
//     connectTimeoutMS: 30000, // How long to wait for initial connection
//     heartbeatFrequencyMS: 10000, // Check connection status more frequently
//     retryWrites: true, // Retry write operations if they fail
//     retryReads: true, // Retry read operations if they fail
//     maxPoolSize: 10, // Maximum number of connections in the connection pool
//     minPoolSize: 2, // Minimum number of connections in the connection pool
//   })
//   .then(() => {
//     console.log("Connected to MongoDB")

//     // Start the bot automatically after database connection is established
//     startBot().catch((err: Error) => {
//       console.error("Failed to start bot automatically:", err)
//     })
//   })
//   .catch((err: Error) => {
//     console.error("MongoDB connection error:", err)

//     // Add more detailed error logging
//     if (err.name === "MongoServerSelectionError") {
//       console.error("Could not connect to any MongoDB servers in your connection string")
//       console.error("Please check your MONGODB_URI environment variable")
//     }

//     // Even if MongoDB fails, we can still start the bot
//     // It will just log errors when trying to access the database
//     console.log("Starting bot despite MongoDB connection failure...")
//     startBot().catch((botErr: Error) => {
//       console.error("Failed to start bot after MongoDB connection failure:", botErr)
//     })
//   })

// // Set up process error handlers to keep the app running
// process.on("uncaughtException", async (error) => {
//   console.error("Uncaught Exception:", error)

//   // Don't send emails for "Request is already handled" errors
//   if (error.message && error.message.includes("Request is already handled")) {
//     console.log("Ignoring 'Request is already handled' error")
//     return // Just ignore these errors
//   }

//   try {
//     // Send notification about other errors
//     await sendEmail(
//       "Just checking in",
//       `Bot is logging in during automatic startup at ${new Date().toLocaleString()}.\n\n` +
//         `You may please ignore.\n\n` +
//         `This is an automated message from the monitoring system.`,
//     )
//   } catch (emailError) {
//     console.error("Failed to send error notification email:", emailError)
//   }

//   // Don't exit the process, try to keep running
// })

// process.on("unhandledRejection", async (reason, promise) => {
//   console.error("Unhandled Promise Rejection:", reason)

//   // Don't send emails for "Request is already handled" errors
//   if (reason instanceof Error && reason.message && reason.message.includes("Request is already handled")) {
//     console.log("Ignoring 'Request is already handled' error")
//     return // Just ignore these errors
//   }

//   try {
//     // Send notification about the rejection
//     await sendEmail(
//       "Just checking in",
//       `Bot is logging in during automatic startup at ${new Date().toLocaleString()}.\n\n` +
//         `You may please ignore.\n\n` +
//         `This is an automated message from the monitoring system.`,
//     )
//   } catch (emailError) {
//     console.error("Failed to send rejection notification email:", emailError)
//   }

//   // Don't exit the process, try to keep running
// })

// // Start server
// app.listen(PORT, () => {
//   console.log(`Server running on port ${PORT}`)
// })

// export default app



import express from "express"
import mongoose from "mongoose"
import path from "path"
import { config } from "dotenv"
import { setupBot, loginToAvaility, startReferralMonitoring, sendStillAliveNotification } from "./services/bot"
import { sendEmail } from "./services/email"
import { scheduleStatusEmails } from "./scheduled-status"

// Load environment variables
config()

const app = express()
const PORT = process.env.PORT || 7008

// Middleware
app.use(express.json())
app.use(express.urlencoded({ extended: true }))
app.use(express.static(path.join(__dirname, "public")))

// Track if the bot is running
let isBotRunning = false
let statusNotificationInterval: NodeJS.Timeout[] | null = null

// Function to start the bot
async function startBot(): Promise<void> {
  if (isBotRunning) {
    console.log("Bot is already running, skipping startup")
    return
  }

  try {
    console.log("🚀 Starting bot automatically...")
    await setupBot() // Initialize the bot
    const loginSuccess = await loginToAvaility() // Attempt to log in

    if (loginSuccess) {
      isBotRunning = true

      // Get current members from database for the startup notification
      const Referral = mongoose.model("Referral")
      const currentMembers = await Referral.find().sort({ createdAt: -1 }).limit(10)

      // Start the monitoring process
      startReferralMonitoring().catch((err: Error) => {
        console.error("Error in monitoring process:", err)
        isBotRunning = false

        // Don't send notification for "Request is already handled" errors
        if (err.message && err.message.includes("Request is already handled")) {
          console.log("Ignoring 'Request is already handled' error")
          return // Just ignore these errors
        }

        // Send notification about other errors
        // sendEmail(
        //   "Checking in...",
        //   `The Availity monitoring bot is running normally at ${new Date().toLocaleString()}.\n\n` +
        //     `Message: No issues\n\n` +
        //     `The application continues to run.\n\n` +
        //     `This is an automated message from the monitoring system.`,
        // ).catch((emailErr) => console.error("Error sending notification:", emailErr))
      })

      // Prepare email content
      let emailContent =
        `The Availity monitoring bot has been started automatically at ${new Date().toLocaleString()}.\n\n` +
        `The bot will check for new referrals every 10 seconds and notify you of any changes.\n\n`

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
      // await sendEmail("Availity Monitoring Bot Started", emailContent)

      // Set up scheduled status notifications (morning, afternoon, evening, midnight)
      if (statusNotificationInterval) {
        // Clear any existing timeouts
        if (Array.isArray(statusNotificationInterval)) {
          statusNotificationInterval.forEach((timeout) => clearTimeout(timeout))
        }
      }

      // Schedule status emails at fixed times
      statusNotificationInterval = scheduleStatusEmails(sendStillAliveNotification)
      console.log("Set up status notifications for morning, afternoon, evening, and midnight with restart recovery")

      console.log("Bot started and logged in successfully!")
    } else {
      console.error("Bot failed to log in during automatic startup")

      // Send error notification
      // await sendEmail(
      //   "Just checking in",
      //   `Bot is logging in during automatic startup at ${new Date().toLocaleString()}.\n\n` +
      //     `You may please ignore.\n\n` +
      //     `This is an automated message from the monitoring system.`,
      // )
    }
  } catch (error) {
    console.error("❌ Error starting bot automatically:", error)
    isBotRunning = false

    // Send error notification
    try {
      // await sendEmail(
      //   "Just checking in",
      //   `Bot is logging in during automatic startup at ${new Date().toLocaleString()}.\n\n` +
      //     `You may please ignore.\n\n` +
      //     `This is an automated message from the monitoring system.`,
      // )
    } catch (emailError) {
      console.error("Failed to send error notification email:", emailError)
    }
  }
}

// Route to manually start the bot
app.post("/start-bot", async (req, res): Promise<any> => {
  try {
    if (isBotRunning) {
      return res.status(200).json({ message: "Bot is already running!" })
    }

    console.log("🚀 Starting bot from interface...")
    await setupBot() // Initialize the bot
    const loginSuccess = await loginToAvaility() // Attempt to log in

    if (loginSuccess) {
      isBotRunning = true

      // Get current members from database for the startup notification
      const Referral = mongoose.model("Referral")
      const currentMembers = await Referral.find().sort({ createdAt: -1 }).limit(10)

      // Start the monitoring process
      startReferralMonitoring().catch((err: Error) => {
        console.error("Error in monitoring process:", err)
        isBotRunning = false
      })

      // Prepare email content
      let emailContent =
        `The Availity monitoring bot has been started manually at ${new Date().toLocaleString()}.\n\n` +
        `The bot will check for new referrals every 10 seconds and notify you of any changes.\n\n`

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
      // await sendEmail("Availity Monitoring Bot Started", emailContent)

      // Set up scheduled status notifications (morning, afternoon, evening, midnight)
      if (statusNotificationInterval) {
        // Clear any existing timeouts
        if (Array.isArray(statusNotificationInterval)) {
          statusNotificationInterval.forEach((timeout) => clearTimeout(timeout))
        }
      }

      // Schedule status emails at fixed times
      statusNotificationInterval = scheduleStatusEmails(sendStillAliveNotification)
      console.log("Set up status notifications for morning, afternoon, evening, and midnight with restart recovery")

      res.status(200).json({ message: "Bot started and logged in successfully!" })
    } else {
      res.status(500).json({ message: "Bot failed to log in." })
    }
  } catch (error) {
    console.error("❌ Error starting bot:", error)
    isBotRunning = false

    // Send error notification
    try {
      // await sendEmail(
      //   "Just checking in",
      //   `Bot is logging in during automatic startup at ${new Date().toLocaleString()}.\n\n` +
      //     `You may please ignore.\n\n` +
      //     `This is an automated message from the monitoring system.`,
      // )
    } catch (emailError) {
      console.error("Failed to send error notification email:", emailError)
    }

    res.status(500).json({ message: "Failed to start bot.", error: (error as Error).message })
  }
})

// Route to manually send a "still alive" notification
app.post("/send-status", async (req, res) => {
  try {
    await sendStillAliveNotification()
    res.status(200).json({ message: "Status notification sent successfully!" })
  } catch (error) {
    console.error("Error sending status notification:", error)
    res.status(500).json({ message: "Failed to send status notification", error: (error as Error).message })
  }
})

// Health check endpoint
app.get("/health", (req, res) => {
  res.status(200).json({
    status: "ok",
    timestamp: new Date().toISOString(),
    botRunning: isBotRunning,
  })
})

// Database connection with improved configuration
mongoose
  .connect(process.env.MONGODB_URI || "", {
    // Add connection options to handle timeouts and retries better
    serverSelectionTimeoutMS: 30000, // Increase timeout from 10s to 30s
    socketTimeoutMS: 45000, // How long the socket can be idle before closing
    connectTimeoutMS: 30000, // How long to wait for initial connection
    heartbeatFrequencyMS: 10000, // Check connection status more frequently
  } as mongoose.ConnectOptions)
  .then(() => {
    console.log("Connected to MongoDB")

    // Start the bot automatically after database connection is established
    startBot().catch((err: Error) => {
      console.error("Failed to start bot automatically:", err)
    })
  })
  .catch((err: Error) => {
    console.error("MongoDB connection error:", err)

    // Add more detailed error logging
    if (err.name === "MongoServerSelectionError") {
      console.error("Could not connect to any MongoDB servers in your connection string")
      console.error("Please check your MONGODB_URI environment variable")
    }

    // Even if MongoDB fails, we can still start the bot
    // It will just log errors when trying to access the database
    console.log("Starting bot despite MongoDB connection failure...")
    startBot().catch((botErr: Error) => {
      console.error("Failed to start bot after MongoDB connection failure:", botErr)
    })
  })

// Set up process error handlers to keep the app running
process.on("uncaughtException", async (error) => {
  console.error("Uncaught Exception:", error)

  // Don't send emails for "Request is already handled" errors
  if (error.message && error.message.includes("Request is already handled")) {
    console.log("Ignoring 'Request is already handled' error")
    return // Just ignore these errors
  }

  try {
    // Send notification about other errors
    // await sendEmail(
    //   "Just checking in",
    //   `Bot is logging in during automatic startup at ${new Date().toLocaleString()}.\n\n` +
    //     `You may please ignore.\n\n` +
    //     `This is an automated message from the monitoring system.`,
    // )
  } catch (emailError) {
    console.error("Failed to send error notification email:", emailError)
  }

  // Don't exit the process, try to keep running
})

process.on("unhandledRejection", async (reason, promise) => {
  console.error("Unhandled Promise Rejection:", reason)

  // Don't send emails for "Request is already handled" errors
  if (reason instanceof Error && reason.message && reason.message.includes("Request is already handled")) {
    console.log("Ignoring 'Request is already handled' error")
    return // Just ignore these errors
  }

  try {
    // Send notification about the rejection
    // await sendEmail(
    //   "Just checking in",
    //   `Bot is logging in during automatic startup at ${new Date().toLocaleString()}.\n\n` +
    //     `You may please ignore.\n\n` +
    //     `This is an automated message from the monitoring system.`,
    // )
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

