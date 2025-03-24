// // This is a wrapper script to ensure the bot doesn't auto-start
// // Place this in the root directory of your project

// // Set environment variable to indicate manual start is required
// process.env.MANUAL_START_ONLY = "true"

// // Run the actual app
// require("./dist/app.js")


// Enhanced start wrapper script with error handling and automatic restarts
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

// Create logs directory if it doesn't exist
const logsDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir);
}

// Set environment variable to indicate manual start is required
process.env.MANUAL_START_ONLY = "true";

// Function to start the server
function startServer() {
  // Create log streams
  const out = fs.openSync(path.join(logsDir, 'out.log'), 'a');
  const err = fs.openSync(path.join(logsDir, 'err.log'), 'a');
  
  // Spawn the process
  const server = spawn('node', ['--max-old-space-size=500', 'app.js'], {
    stdio: ['ignore', out, err],
    env: { ...process.env }
  });
  
  console.log(`Started server process with PID: ${server.pid}`);
  
  // Handle process exit
  server.on('exit', (code, signal) => {
    console.log(`Server process exited with code ${code} and signal ${signal}`);
    
    // Close file descriptors
    fs.closeSync(out);
    fs.closeSync(err);
    
    // Wait a bit before restarting
    setTimeout(() => {
      console.log('Restarting server...');
      startServer();
    }, 10000); // Wait 10 seconds before restarting
  });
  
  // Handle process errors
  server.on('error', (err) => {
    console.error('Failed to start server process:', err);
    
    // Close file descriptors
    fs.closeSync(out);
    fs.closeSync(err);
    
    // Wait a bit before restarting
    setTimeout(() => {
      console.log('Restarting server after error...');
      startServer();
    }, 10000);
  });
}

// Start the server
startServer();