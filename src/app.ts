// // import express from "express"
// // import mongoose from "mongoose"
// // import path from "path"
// // import { config } from "dotenv"
// // import { setupBot, loginToAvaility, startReferralMonitoring } from "./services/bot"
// // import { sendEmail } from "./services/email"

// // // Load environment variables
// // config()

// // const app = express()
// // const PORT = process.env.PORT || 7008

// // // Middleware
// // app.use(express.json())
// // app.use(express.urlencoded({ extended: true }))
// // app.use(express.static(path.join(__dirname, "public")))

// // // Track if the bot is running
// // let isBotRunning = false

// // // Function to start the bot
// // async function startBot() {
// //   if (isBotRunning) {
// //     console.log("Bot is already running, skipping startup");
// //     return;
// //   }
  
// //   try {
// //     console.log("🚀 Starting bot automatically...");
// //     await setupBot(); // Initialize the bot
// //     const loginSuccess = await loginToAvaility(); // Attempt to log in

// //     if (loginSuccess) {
// //       isBotRunning = true;
      
// //       // Get current members from database for the startup notification
// //       const Referral = mongoose.model("Referral");
// //       const currentMembers = await Referral.find().sort({ createdAt: -1 }).limit(10);

// //       // Start the monitoring process
// //       startReferralMonitoring().catch((err) => {
// //         console.error("Error in monitoring process:", err);
// //         isBotRunning = false;
        
// //         // Send notification about the error
// //         sendEmail(
// //           "⚠️ Availity Bot Monitoring Failed",
// //           `The Availity monitoring bot encountered an error during monitoring at ${new Date().toLocaleString()}.\n\n` +
// //             `Error: ${err}\n\n` +
// //             `The application will attempt to continue running, but you may need to restart it if monitoring stops.\n\n` +
// //             `This is an automated message from the monitoring system.`,
// //         ).catch(emailErr => console.error("Failed to send error notification:", emailErr));
// //       });

// //       // Prepare email content
// //       let emailContent =
// //         `The Availity monitoring bot has been started automatically at ${new Date().toLocaleString()}.\n\n` +
// //         `The bot will check for new referrals every 30 seconds and notify you of any changes.\n\n`;

// //       // Add current members to the email if there are any
// //       if (currentMembers && currentMembers.length > 0) {
// //         emailContent += `Current Members in Database:\n\n`;

// //         currentMembers.forEach((member, index) => {
// //           emailContent += `Member ${index + 1}:\n`;
// //           emailContent += `Name: ${member.memberName}\n`;
// //           emailContent += `ID: ${member.memberID}\n`;

// //           if (member.serviceName) {
// //             emailContent += `Service: ${member.serviceName}\n`;
// //           }

// //           if (member.status) {
// //             emailContent += `Status: ${member.status}\n`;
// //           }

// //           if (member.county) {
// //             emailContent += `County: ${member.county}\n`;
// //           }

// //           if (member.requestOn) {
// //             emailContent += `Request Date: ${member.requestOn}\n`;
// //           }

// //           emailContent += `\n`;
// //         });
// //       } else {
// //         emailContent += `No members currently in the database. You will be notified when new referrals are detected.\n\n`;
// //       }

// //       emailContent += `This is an automated message from the monitoring system.`;

// //       // Send startup notification with member information
// //       await sendEmail("Availity Monitoring Bot Started", emailContent);

// //       console.log("Bot started and logged in successfully!");
// //     } else {
// //       console.error("Bot failed to log in during automatic startup");
      
// //       // Send error notification
// //       await sendEmail(
// //         "⚠️ Availity Monitoring Bot Failed to Start",
// //         `The Availity monitoring bot failed to log in during automatic startup at ${new Date().toLocaleString()}.\n\n` +
// //           `Please check the logs and restart the application if needed.\n\n` +
// //           `This is an automated message from the monitoring system.`,
// //       );
// //     }
// //   } catch (error) {
// //     console.error("❌ Error starting bot automatically:", error);
// //     isBotRunning = false;

// //     // Send error notification
// //     try {
// //       await sendEmail(
// //         "⚠️ Availity Monitoring Bot Failed to Start",
// //         `The Availity monitoring bot failed to start automatically at ${new Date().toLocaleString()}.\n\n` +
// //           `Error: ${error}\n\n` +
// //           `Please check the logs and restart the application.\n\n` +
// //           `This is an automated message from the monitoring system.`,
// //       );
// //     } catch (emailError) {
// //       console.error("Failed to send error notification email:", emailError);
// //     }
// //   }
// // }

// // // Route to manually start the bot
// // app.post("/start-bot", async (req, res): Promise<any>  => {
// //   try {
// //     if (isBotRunning) {
// //       return res.status(200).json({ message: "Bot is already running!" });
// //     }
    
// //     console.log("🚀 Starting bot from interface...");
// //     await setupBot(); // Initialize the bot
// //     const loginSuccess = await loginToAvaility(); // Attempt to log in

// //     if (loginSuccess) {
// //       isBotRunning = true;
      
// //       // Get current members from database for the startup notification
// //       const Referral = mongoose.model("Referral");
// //       const currentMembers = await Referral.find().sort({ createdAt: -1 }).limit(10);

// //       // Start the monitoring process
// //       startReferralMonitoring().catch((err) => {
// //         console.error("Error in monitoring process:", err);
// //         isBotRunning = false;
// //       });

// //       // Prepare email content
// //       let emailContent =
// //         `The Availity monitoring bot has been started manually at ${new Date().toLocaleString()}.\n\n` +
// //         `The bot will check for new referrals every 30 seconds and notify you of any changes.\n\n`;

// //       // Add current members to the email if there are any
// //       if (currentMembers && currentMembers.length > 0) {
// //         emailContent += `Current Members in Database:\n\n`;

// //         currentMembers.forEach((member, index) => {
// //           emailContent += `Member ${index + 1}:\n`;
// //           emailContent += `Name: ${member.memberName}\n`;
// //           emailContent += `ID: ${member.memberID}\n`;

// //           if (member.serviceName) {
// //             emailContent += `Service: ${member.serviceName}\n`;
// //           }

// //           if (member.status) {
// //             emailContent += `Status: ${member.status}\n`;
// //           }

// //           if (member.county) {
// //             emailContent += `County: ${member.county}\n`;
// //           }

// //           if (member.requestOn) {
// //             emailContent += `Request Date: ${member.requestOn}\n`;
// //           }

// //           emailContent += `\n`;
// //         });
// //       } else {
// //         emailContent += `No members currently in the database. You will be notified when new referrals are detected.\n\n`;
// //       }

// //       emailContent += `This is an automated message from the monitoring system.`;

// //       // Send startup notification with member information
// //       await sendEmail("Availity Monitoring Bot Started", emailContent);

// //       res.status(200).json({ message: "Bot started and logged in successfully!" });
// //     } else {
// //       res.status(500).json({ message: "Bot failed to log in." });
// //     }
// //   } catch (error) {
// //     console.error("❌ Error starting bot:", error);
// //     isBotRunning = false;

// //     // Send error notification
// //     try {
// //       await sendEmail(
// //         "⚠️ Availity Monitoring Bot Failed to Start",
// //         `The Availity monitoring bot failed to start at ${new Date().toLocaleString()}.\n\n` +
// //           `Error: ${error}\n\n` +
// //           `Please check the logs and restart the application.\n\n` +
// //           `This is an automated message from the monitoring system.`,
// //       );
// //     } catch (emailError) {
// //       console.error("Failed to send error notification email:", emailError);
// //     }

// //     res.status(500).json({ message: "Failed to start bot.", error: (error as any).message });
// //   }
// // });

// // // Health check endpoint
// // app.get("/health", (req, res) => {
// //   res.status(200).json({ 
// //     status: "ok", 
// //     timestamp: new Date().toISOString(),
// //     botRunning: isBotRunning
// //   });
// // });

// // // Database connection
// // mongoose
// //   .connect(process.env.MONGODB_URI || "")
// //   .then(() => {
// //     console.log("Connected to MongoDB");
    
// //     // Start the bot automatically after database connection is established
// //     startBot().catch(err => {
// //       console.error("Failed to start bot automatically:", err);
// //     });
// //   })
// //   .catch((err) => {
// //     console.error("MongoDB connection error:", err);
// //   });

// // // Set up process error handlers to keep the app running
// // process.on("uncaughtException", async (error) => {
// //   console.error("Uncaught Exception:", error);

// //   try {
// //     // Send notification about the error
// //     await sendEmail(
// //       "⚠️ Availity Bot Encountered an Error",
// //       `The Availity monitoring bot encountered an uncaught exception at ${new Date().toLocaleString()}.\n\n` +
// //         `Error: ${error.message}\n\n` +
// //         `Stack: ${error.stack}\n\n` +
// //         `The application will attempt to continue running, but you may need to restart it if monitoring stops.\n\n` +
// //         `This is an automated message from the monitoring system.`,
// //     );
// //   } catch (emailError) {
// //     console.error("Failed to send error notification email:", emailError);
// //   }

// //   // Don't exit the process, try to keep running
// // });

// // process.on("unhandledRejection", async (reason, promise) => {
// //   console.error("Unhandled Promise Rejection:", reason);

// //   try {
// //     // Send notification about the rejection
// //     await sendEmail(
// //       "⚠️ Availity Bot Encountered a Promise Rejection",
// //       `The Availity monitoring bot encountered an unhandled promise rejection at ${new Date().toLocaleString()}.\n\n` +
// //         `Reason: ${reason}\n\n` +
// //         `The application will attempt to continue running, but you may need to restart it if monitoring stops.\n\n` +
// //         `This is an automated message from the monitoring system.`,
// //     );
// //   } catch (emailError) {
// //     console.error("Failed to send rejection notification email:", emailError);
// //   }

// //   // Don't exit the process, try to keep running
// // });

// // // Start server
// // app.listen(PORT, () => {
// //   console.log(`Server running on port ${PORT}`);
// // });

// // export default app;


// import express from "express"
// import mongoose from "mongoose"
// import path from "path"
// import { config } from "dotenv"
// import { setupBot, loginToAvaility, startReferralMonitoring } from "./services/bot"
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

// // Function to start the bot
// async function startBot() {
//   if (isBotRunning) {
//     console.log("Bot is already running, skipping startup");
//     return;
//   }
  
//   try {
//     console.log("🚀 Starting bot automatically...");
//     await setupBot(); // Initialize the bot
//     const loginSuccess = await loginToAvaility(); // Attempt to log in

//     if (loginSuccess) {
//       isBotRunning = true;
      
//       // Get current members from database for the startup notification
//       const Referral = mongoose.model("Referral");
//       const currentMembers = await Referral.find().sort({ createdAt: -1 }).limit(10);

//       // Start the monitoring process
//       startReferralMonitoring().catch((err: Error) => {
//         console.error("Error in monitoring process:", err);
//         isBotRunning = false;
        
//         // Send notification about the error
//         sendEmail(
//           "⚠️ Availity Bot Monitoring Failed",
//           `The Availity monitoring bot encountered an error during monitoring at ${new Date().toLocaleString()}.\n\n` +
//             `Error: ${err}\n\n` +
//             `The application will attempt to continue running, but you may need to restart it if monitoring stops.\n\n` +
//             `This is an automated message from the monitoring system.`,
//         ).catch(emailErr => console.error("Failed to send error notification:", emailErr));
//       });

//       // Prepare email content
//       let emailContent =
//         `The Availity monitoring bot has been started automatically at ${new Date().toLocaleString()}.\n\n` +
//         `The bot will check for new referrals every 30 seconds and notify you of any changes.\n\n`;

//       // Add current members to the email if there are any
//       if (currentMembers && currentMembers.length > 0) {
//         emailContent += `Current Members in Database:\n\n`;

//         currentMembers.forEach((member, index) => {
//           emailContent += `Member ${index + 1}:\n`;
//           emailContent += `Name: ${member.memberName}\n`;
//           emailContent += `ID: ${member.memberID}\n`;

//           if (member.serviceName) {
//             emailContent += `Service: ${member.serviceName}\n`;
//           }

//           if (member.status) {
//             emailContent += `Status: ${member.status}\n`;
//           }

//           if (member.county) {
//             emailContent += `County: ${member.county}\n`;
//           }

//           if (member.requestOn) {
//             emailContent += `Request Date: ${member.requestOn}\n`;
//           }

//           emailContent += `\n`;
//         });
//       } else {
//         emailContent += `No members currently in the database. You will be notified when new referrals are detected.\n\n`;
//       }

//       emailContent += `This is an automated message from the monitoring system.`;

//       // Send startup notification with member information
//       await sendEmail("Availity Monitoring Bot Started", emailContent);

//       console.log("Bot started and logged in successfully!");
//     } else {
//       console.error("Bot failed to log in during automatic startup");
      
//       // Send error notification
//       await sendEmail(
//         "⚠️ Availity Monitoring Bot Failed to Start",
//         `The Availity monitoring bot failed to log in during automatic startup at ${new Date().toLocaleString()}.\n\n` +
//           `Please check the logs and restart the application if needed.\n\n` +
//           `This is an automated message from the monitoring system.`,
//       );
//     }
//   } catch (error) {
//     console.error("❌ Error starting bot automatically:", error);
//     isBotRunning = false;

//     // Send error notification
//     try {
//       await sendEmail(
//         "⚠️ Availity Monitoring Bot Failed to Start",
//         `The Availity monitoring bot failed to start automatically at ${new Date().toLocaleString()}.\n\n` +
//           `Error: ${error}\n\n` +
//           `Please check the logs and restart the application.\n\n` +
//           `This is an automated message from the monitoring system.`,
//       );
//     } catch (emailError) {
//       console.error("Failed to send error notification email:", emailError);
//     }
//   }
// }

// // Route to manually start the bot
// app.post("/start-bot", async (req, res): Promise<any> => {
//   try {
//     if (isBotRunning) {
//       return res.status(200).json({ message: "Bot is already running!" });
//     }
    
//     console.log("🚀 Starting bot from interface...");
//     await setupBot(); // Initialize the bot
//     const loginSuccess = await loginToAvaility(); // Attempt to log in

//     if (loginSuccess) {
//       isBotRunning = true;
      
//       // Get current members from database for the startup notification
//       const Referral = mongoose.model("Referral");
//       const currentMembers = await Referral.find().sort({ createdAt: -1 }).limit(10);

//       // Start the monitoring process
//       startReferralMonitoring().catch((err: Error) => {
//         console.error("Error in monitoring process:", err);
//         isBotRunning = false;
//       });

//       // Prepare email content
//       let emailContent =
//         `The Availity monitoring bot has been started manually at ${new Date().toLocaleString()}.\n\n` +
//         `The bot will check for new referrals every 30 seconds and notify you of any changes.\n\n`;

//       // Add current members to the email if there are any
//       if (currentMembers && currentMembers.length > 0) {
//         emailContent += `Current Members in Database:\n\n`;

//         currentMembers.forEach((member, index) => {
//           emailContent += `Member ${index + 1}:\n`;
//           emailContent += `Name: ${member.memberName}\n`;
//           emailContent += `ID: ${member.memberID}\n`;

//           if (member.serviceName) {
//             emailContent += `Service: ${member.serviceName}\n`;
//           }

//           if (member.status) {
//             emailContent += `Status: ${member.status}\n`;
//           }

//           if (member.county) {
//             emailContent += `County: ${member.county}\n`;
//           }

//           if (member.requestOn) {
//             emailContent += `Request Date: ${member.requestOn}\n`;
//           }

//           emailContent += `\n`;
//         });
//       } else {
//         emailContent += `No members currently in the database. You will be notified when new referrals are detected.\n\n`;
//       }

//       emailContent += `This is an automated message from the monitoring system.`;

//       // Send startup notification with member information
//       await sendEmail("Availity Monitoring Bot Started", emailContent);

//       res.status(200).json({ message: "Bot started and logged in successfully!" });
//     } else {
//       res.status(500).json({ message: "Bot failed to log in." });
//     }
//   } catch (error) {
//     console.error("❌ Error starting bot:", error);
//     isBotRunning = false;

//     // Send error notification
//     try {
//       await sendEmail(
//         "⚠️ Availity Monitoring Bot Failed to Start",
//         `The Availity monitoring bot failed to start at ${new Date().toLocaleString()}.\n\n` +
//           `Error: ${error}\n\n` +
//           `Please check the logs and restart the application.\n\n` +
//           `This is an automated message from the monitoring system.`,
//       );
//     } catch (emailError) {
//       console.error("Failed to send error notification email:", emailError);
//     }

//     res.status(500).json({ message: "Failed to start bot.", error: (error as any).message });
//   }
// });

// // Health check endpoint
// app.get("/health", (req, res) => {
//   res.status(200).json({ 
//     status: "ok", 
//     timestamp: new Date().toISOString(),
//     botRunning: isBotRunning
//   });
// });

// // Database connection
// mongoose
//   .connect(process.env.MONGODB_URI || "")
//   .then(() => {
//     console.log("Connected to MongoDB");
    
//     // Start the bot automatically after database connection is established
//     startBot().catch((err: Error) => {
//       console.error("Failed to start bot automatically:", err);
//     });
//   })
//   .catch((err: Error) => {
//     console.error("MongoDB connection error:", err);
//   });

// // Set up process error handlers to keep the app running
// process.on("uncaughtException", async (error) => {
//   console.error("Uncaught Exception:", error);

//   try {
//     // Send notification about the error
//     await sendEmail(
//       "⚠️ Availity Bot Encountered an Error",
//       `The Availity monitoring bot encountered an uncaught exception at ${new Date().toLocaleString()}.\n\n` +
//         `Error: ${error.message}\n\n` +
//         `Stack: ${error.stack}\n\n` +
//         `The application will attempt to continue running, but you may need to restart it if monitoring stops.\n\n` +
//         `This is an automated message from the monitoring system.`,
//     );
//   } catch (emailError) {
//     console.error("Failed to send error notification email:", emailError);
//   }

//   // Don't exit the process, try to keep running
// });

// process.on("unhandledRejection", async (reason, promise) => {
//   console.error("Unhandled Promise Rejection:", reason);

//   try {
//     // Send notification about the rejection
//     await sendEmail(
//       "⚠️ Availity Bot Encountered a Promise Rejection",
//       `The Availity monitoring bot encountered an unhandled promise rejection at ${new Date().toLocaleString()}.\n\n` +
//         `Reason: ${reason}\n\n` +
//         `The application will attempt to continue running, but you may need to restart it if monitoring stops.\n\n` +
//         `This is an automated message from the monitoring system.`,
//     );
//   } catch (emailError) {
//     console.error("Failed to send rejection notification email:", emailError);
//   }

//   // Don't exit the process, try to keep running
// });

// // Start server
// app.listen(PORT, () => {
//   console.log(`Server running on port ${PORT}`);
// });

// export default app;


const express = require('express');
const { setupBot, startReferralMonitoring, closeBrowser, checkBrowserHealth } = require('./dist/services/bot');
const { sendEmail } = require('./dist/services/email');

const app = express();
const PORT = process.env.PORT || 3000;
const startTime = Date.now();
let botStarted = false;
let lastActivity = Date.now();
let watchdogInterval: string | number | NodeJS.Timeout | undefined;
let healthCheckInterval: string | number | NodeJS.Timeout | undefined;

// Basic middleware
app.use(express.json());

// Health check endpoint that Render and UptimeRobot can ping
app.get('/health', (req: any, res: { status: (arg0: number) => { (): any; new(): any; json: { (arg0: { status: string; timestamp: string; botRunning: boolean; uptime: string; lastActivity: string; }): void; new(): any; }; }; }) => {
  lastActivity = Date.now();
  res.status(200).json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    botRunning: botStarted,
    uptime: `${Math.floor((Date.now() - startTime) / 1000 / 60)} minutes`,
    lastActivity: new Date(lastActivity).toISOString()
  });
});

// Root endpoint for simple checks
app.get('/', (req: any, res: { send: (arg0: string) => void; }) => {
  lastActivity = Date.now();
  res.send('Availity Bot is running');
});

// Status endpoint with detailed information
app.get('/status', (req: any, res: { json: (arg0: { status: string; startTime: string; uptime: string; lastActivity: string; idleTime: string; botStarted: boolean; memoryUsage: NodeJS.MemoryUsage; }) => void; }) => {
  const uptime = Math.floor((Date.now() - startTime) / 1000 / 60);
  const idleTime = Math.floor((Date.now() - lastActivity) / 1000 / 60);
  
  res.json({
    status: 'running',
    startTime: new Date(startTime).toISOString(),
    uptime: `${uptime} minutes`,
    lastActivity: new Date(lastActivity).toISOString(),
    idleTime: `${idleTime} minutes`,
    botStarted: botStarted,
    memoryUsage: process.memoryUsage(),
  });
});

// Restart endpoint
app.post('/restart', async (req: any, res: { json: (arg0: { success: boolean; message: string; }) => void; status: (arg0: number) => { (): any; new(): any; json: { (arg0: { success: boolean; error: any; }): void; new(): any; }; }; }) => {
  try {
    console.log("Restarting bot...");
    await closeBrowser();
    botStarted = false;
    await startBot();
    res.json({ success: true, message: "Bot restarted successfully" });
  } catch (error) {
    console.error("Error restarting bot:", error);
    res.status(500).json({ success: false, error: (error as any).message });
  }
});

// Start the bot
async function startBot() {
  if (botStarted) {
    console.log("Bot is already running");
    return;
  }
  
  try {
    console.log("Starting bot...");
    await setupBot();
    await startReferralMonitoring();
    botStarted = true;
    console.log("Bot started successfully");
    
    // Send notification
    try {
      await sendEmail(
        "Availity Bot Started",
        `The Availity monitoring bot was started at ${new Date().toISOString()}.`
      );
    } catch (emailError) {
      console.error("Failed to send startup notification:", emailError);
    }
  } catch (error) {
    console.error("Failed to start bot:", error);
    botStarted = false;
    
    // Send error notification
    try {
      await sendEmail(
        "Availity Bot Failed to Start",
        `The Availity monitoring bot failed to start at ${new Date().toISOString()}.\n\nError: ${(error as any).message}`
      );
    } catch (emailError) {
      console.error("Failed to send error notification:", emailError);
    }
    
    // Try again in 5 minutes
    setTimeout(startBot, 300000);
  }
}

// Set up watchdog timer to monitor and restart the bot if needed
function setupWatchdog() {
  watchdogInterval = setInterval(async () => {
    try {
      // Check if the bot has been idle for too long (10 minutes)
      const idleTime = (Date.now() - lastActivity) / 1000 / 60;
      if (idleTime > 10) {
        console.log(`Bot has been idle for ${idleTime.toFixed(2)} minutes, restarting...`);
        await closeBrowser();
        botStarted = false;
        await startBot();
        lastActivity = Date.now();
      }
      
      // If the bot should be running but isn't, restart it
      if (!botStarted) {
        console.log("Bot should be running but isn't, restarting...");
        await startBot();
      }
      
      // Check browser health
      if (botStarted) {
        await checkBrowserHealth();
      }
      
      // Force garbage collection if available
      if (global.gc) {
        try {
          global.gc();
          console.log("Forced garbage collection executed");
        } catch (gcError) {
          console.error("Error during garbage collection:", gcError);
        }
      }
    } catch (error) {
      console.error("Error in watchdog:", error);
    }
  }, 300000); // Check every 5 minutes
}

// Set up a health check ping to keep the service alive
function setupHealthCheck() {
  healthCheckInterval = setInterval(() => {
    // This is a self-ping to prevent Render from spinning down the service
    try {
      fetch(`http://localhost:${PORT}/health`)
        .then(response => {
          if (!response.ok) {
            console.error(`Health check failed: ${response.status}`);
          }
        })
        .catch(error => {
          console.error("Error during self health check:", error);
        });
    } catch (error) {
      console.error("Error setting up health check:", error);
    }
  }, 60000); // Every minute
}

// Start the server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  
  // Only start the bot automatically if not in manual start mode
  if (process.env.MANUAL_START_ONLY !== "true") {
    startBot();
  } else {
    console.log("Manual start mode enabled. Use /start-bot endpoint to start the bot.");
  }
  
  setupWatchdog();
  setupHealthCheck();
});

// Handle graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully');
  clearInterval(watchdogInterval);
  clearInterval(healthCheckInterval);
  await closeBrowser();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, shutting down gracefully');
  clearInterval(watchdogInterval);
  clearInterval(healthCheckInterval);
  await closeBrowser();
  process.exit(0);
});

// Export for testing
module.exports = app;