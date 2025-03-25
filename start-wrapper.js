

// Set environment variable to indicate manual start is required
process.env.MANUAL_START_ONLY = "true"

// Run the actual app
require("./dist/app.js")

