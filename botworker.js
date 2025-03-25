require('dotenv').config();
const mongoose = require('mongoose');
const { setupBot, loginToAvaility, startReferralMonitoring, closeBrowser } = require('./dist/services/bot');
const { sendEmail } = require('./dist/services/email');

// Track bot state
let isBotRunning = false;
let lastActivityTime = new Date();
let consecutiveErrors = 0;
const MAX_CONSECUTIVE_ERRORS = 5;

// Function to update activity time
function updateActivityTime() {
  lastActivityTime = new Date();
  console.log(`Activity recorded at ${lastActivityTime.toISOString()}`);
}

// Function to log with timestamp
function log(message) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${message}`);
}

// Function to start the bot
async function startBot() {
  if (isBotRunning) {
    log("Bot is already running, skipping startup");
    return;
  }
  
  try {
    log("🚀 Starting Availity monitoring bot...");
    await setupBot(); // Initialize the bot
    updateActivityTime();
    
    const loginSuccess = await loginToAvaility(); // Attempt to log in
    updateActivityTime();

    if (loginSuccess) {
      isBotRunning = true;
      consecutiveErrors = 0;
      
      // Get current members from database for the startup notification
      const Referral = mongoose.model("Referral");
      const currentMembers = await Referral.find().sort({ createdAt: -1 }).limit(10);
      updateActivityTime();

      // Start the monitoring process
      await startReferralMonitoring();
      updateActivityTime();

      // Prepare email content
      let emailContent =
        `The Availity monitoring bot has been started as a Background Worker at ${new Date().toLocaleString()}.\n\n` +
        `The bot will check for new referrals every 30 seconds and notify you of any changes.\n\n`;

      // Add current members to the email if there are any
      if (currentMembers && currentMembers.length > 0) {
        emailContent += `Current Members in Database:\n\n`;

        currentMembers.forEach((member, index) => {
          emailContent += `Member ${index + 1}:\n`;
          emailContent += `Name: ${member.memberName}\n`;
          emailContent += `ID: ${member.memberID}\n`;

          if (member.serviceName) {
            emailContent += `Service: ${member.serviceName}\n`;
          }

          if (member.status) {
            emailContent += `Status: ${member.status}\n`;
          }

          if (member.county) {
            emailContent += `County: ${member.county}\n`;
          }

          if (member.requestOn) {
            emailContent += `Request Date: ${member.requestOn}\n`;
          }

          emailContent += `\n`;
        });
      } else {
        emailContent += `No members currently in the database. You will be notified when new referrals are detected.\n\n`;
      }

      emailContent += `This is an automated message from the monitoring system.`;

      // Send startup notification with member information
      await sendEmail("Availity Monitoring Bot Started", emailContent);
      updateActivityTime();

      log("Bot started and logged in successfully!");
    } else {
      log("Bot failed to log in during startup");
      consecutiveErrors++;
      
      // Send error notification
      await sendEmail(
        "⚠️ Availity Monitoring Bot Failed to Start",
        `The Availity monitoring bot failed to log in during startup at ${new Date().toLocaleString()}.\n\n` +
          `The system will automatically attempt to restart.\n\n` +
          `This is an automated message from the monitoring system.`,
      );
      
      // Force restart after login failure
      throw new Error("Login failed");
    }
  } catch (error) {
    log(`❌ Error starting bot: ${error.message}`);
    isBotRunning = false;
    consecutiveErrors++;

    // Send error notification
    try {
      await sendEmail(
        "⚠️ Availity Monitoring Bot Failed to Start",
        `The Availity monitoring bot failed to start at ${new Date().toLocaleString()}.\n\n` +
          `Error: ${error}\n\n` +
          `The system will automatically attempt to restart.\n\n` +
          `This is an automated message from the monitoring system.`,
      );
    } catch (emailError) {
      log(`Failed to send error notification email: ${emailError.message}`);
    }
    
    // Throw the error to trigger restart
    throw error;
  }
}

// Function to check bot health
async function checkBotHealth() {
  log("Running health check...");
  
  try {
    // Check if too many consecutive errors
    if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
      log(`Too many consecutive errors (${consecutiveErrors}), forcing restart...`);
      await forceRestart();
      return;
    }
    
    // Check for inactivity
    const now = new Date();
    const inactivityTime = now.getTime() - lastActivityTime.getTime();
    
    if (inactivityTime > 10 * 60 * 1000) { // 10 minutes
      log(`Bot has been inactive for ${inactivityTime / 1000} seconds, forcing restart...`);
      await forceRestart();
      return;
    }
    
    // Log memory usage
    const memUsage = process.memoryUsage();
    log(`Memory usage - RSS: ${Math.round(memUsage.rss / 1024 / 1024)}MB, Heap: ${Math.round(memUsage.heapUsed / 1024 / 1024)}/${Math.round(memUsage.heapTotal / 1024 / 1024)}MB`);
    
    // If memory usage is too high, force restart
    if (memUsage.rss > 450 * 1024 * 1024) { // 450MB
      log("Memory usage too high, forcing restart...");
      await forceRestart();
      return;
    }
    
    log("Health check completed successfully");
  } catch (error) {
    log(`Error in health check: ${error.message}`);
    consecutiveErrors++;
  }
}

// Function to force restart
async function forceRestart() {
  log("Forcing restart of bot...");
  
  try {
    isBotRunning = false;
    
    // Close browser
    await closeBrowser();
    log("Browser closed successfully");
    
    // Wait a moment before restarting
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // Restart the bot
    await startBot();
    log("Bot restarted successfully");
  } catch (error) {
    log(`Error during forced restart: ${error.message}`);
    consecutiveErrors++;
    
    // Send notification about the error
    try {
      await sendEmail(
        "⚠️ Availity Bot Restart Failed",
        `The Availity monitoring bot failed to restart at ${new Date().toLocaleString()}.\n\n` +
          `Error: ${error.message}\n\n` +
          `The system will continue attempting to restart.\n\n` +
          `This is an automated message from the monitoring system.`
      );
    } catch (emailError) {
      log(`Failed to send error notification email: ${emailError.message}`);
    }
    
    // Wait longer before trying again
    await new Promise(resolve => setTimeout(resolve, 30000));
    
    // Try again
    process.nextTick(startWorker);
  }
}

// Main worker function
async function startWorker() {
  try {
    log("Starting Availity monitoring worker...");
    
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || "");
    log("Connected to MongoDB");
    updateActivityTime();
    
    // Start the bot
    await startBot();
    updateActivityTime();
    
    // Set up health check interval
    setInterval(checkBotHealth, 5 * 60 * 1000); // Every 5 minutes
    
    // Keep the process alive with heartbeat
    setInterval(() => {
      log(`Worker heartbeat - uptime: ${process.uptime().toFixed(2)}s`);
      updateActivityTime();
    }, 60 * 1000); // Every minute
    
    log("Worker setup completed successfully");
  } catch (error) {
    log(`Worker encountered an error: ${error.message}`);
    log(`Stack trace: ${error.stack}`);
    consecutiveErrors++;
    
    // Try to clean up
    try {
      await closeBrowser();
    } catch (cleanupError) {
      log(`Error during cleanup: ${cleanupError.message}`);
    }
    
    // Wait before restarting
    const delay = Math.min(30000 * Math.pow(2, consecutiveErrors - 1), 300000); // Exponential backoff, max 5 minutes
    log(`Restarting worker in ${delay/1000} seconds...`);
    
    setTimeout(() => {
      startWorker().catch(err => {
        log(`Failed to restart worker: ${err.message}`);
        // Exit with error code to trigger Render's automatic restart if we can't recover
        if (consecutiveErrors > 10) {
          log("Too many consecutive errors, exiting process to trigger Render restart");
          process.exit(1);
        }
      });
    }, delay);
  }
}

// Handle graceful shutdown
process.on('SIGTERM', async () => {
  log('SIGTERM received, shutting down gracefully');
  
  try {
    await closeBrowser();
    log('Browser closed successfully');
  } catch (error) {
    log(`Error closing browser: ${error.message}`);
  }
  
  // Close MongoDB connection
  try {
    await mongoose.disconnect();
    log('MongoDB disconnected');
  } catch (error) {
    log(`Error disconnecting from MongoDB: ${error.message}`);
  }
  
  process.exit(0);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  log('Unhandled Rejection at:');
  log(promise);
  log('Reason:');
  log(reason);
  updateActivityTime();
  consecutiveErrors++;
  
  // Don't exit, let the error handling in the main loop deal with it
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  log(`Uncaught Exception: ${error.message}`);
  log(error.stack);
  updateActivityTime();
  consecutiveErrors++;
  
  // Try to clean up
  closeBrowser().catch(err => log(`Error during cleanup: ${err.message}`));
  
  // Don't exit immediately, let the worker restart itself
  setTimeout(() => {
    if (consecutiveErrors > 10) {
      log("Too many consecutive errors after uncaught exception, exiting process to trigger Render restart");
      process.exit(1);
    }
  }, 5000);
});

// Start the worker
startWorker();