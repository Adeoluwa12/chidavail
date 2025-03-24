// This is a wrapper script to ensure the bot doesn't auto-start
// Place this in the root directory of your project

// Set environment variable to indicate manual start is required
process.env.MANUAL_START_ONLY = "true"

// Run the actual app
require("./dist/app.js")

