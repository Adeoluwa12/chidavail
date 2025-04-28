// // Simple script to ensure the data directory exists
// const fs = require("fs")
// const path = require("path")

// // Create the data directory if it doesn't exist
// const dataDir = path.join(__dirname, "data")
// if (!fs.existsSync(dataDir)) {
//   console.log("Creating data directory for persistent storage")
//   fs.mkdirSync(dataDir, { recursive: true })
// } else {
//   console.log("Data directory already exists")
// }



const fs = require("fs")
const path = require("path")

// Ensure data directory exists
const dataDir = path.join(__dirname, "../data")
console.log("Data directory already exists")

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true })
  console.log("Created data directory:", dataDir)
}

module.exports = {}
