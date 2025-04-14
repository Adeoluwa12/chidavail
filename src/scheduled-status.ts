// import * as fs from "fs"
// import * as path from "path"

// // Define a more robust tracking system for sent notifications
// interface LastSentRecord {
//   timestamp: string
//   date: string // Store just the date portion for easy comparison
// }

// // Extend the global namespace to include our custom properties
// declare global {
//   namespace NodeJS {
//     interface Global {
//       lastSentTimes: Record<string, LastSentRecord>
//     }
//   }
// }

// // Initialize the global object if it doesn't exist
// if (!(global as any).lastSentTimes) {
//   ;(global as any).lastSentTimes = {}
// }

// // Function to schedule status emails at specific times of day
// export function scheduleStatusEmails(sendStatusFn: () => Promise<void>): NodeJS.Timeout[] {
//   const timeouts: NodeJS.Timeout[] = []

//   // Get current date
//   const now = new Date()

//   // Define the scheduled times
//   const scheduledTimes = [
//     { hour: 6, minute: 0, name: "morning" }, // 6:00 AM
//     { hour: 12, minute: 0, name: "afternoon" }, // 12:00 PM
//     { hour: 18, minute: 0, name: "evening" }, // 6:00 PM
//     { hour: 0, minute: 0, name: "midnight" }, // 12:00 AM
//   ]

//   // Log scheduled times
//   console.log("Status emails scheduled for:")
//   scheduledTimes.forEach((time) => {
//     const scheduledTime = new Date(now)
//     scheduledTime.setHours(time.hour, time.minute, 0, 0)
//     if (scheduledTime < now) scheduledTime.setDate(scheduledTime.getDate() + 1)
//     const msUntil = scheduledTime.getTime() - now.getTime()
//     console.log(`  - ${time.name}: ${scheduledTime.toLocaleString()} (in ${Math.round(msUntil / 60000)} minutes)`)
//   })

//   // Check if we missed any emails due to restart
//   checkForMissedEmails(sendStatusFn)

//   // Schedule the emails
//   scheduledTimes.forEach((time) => {
//     const scheduledTime = new Date(now)
//     scheduledTime.setHours(time.hour, time.minute, 0, 0)
//     if (scheduledTime < now) scheduledTime.setDate(scheduledTime.getDate() + 1)

//     const msUntil = scheduledTime.getTime() - now.getTime()

//     // Schedule the initial email
//     const initialTimeout = setTimeout(() => {
//       // Check if we've already sent this notification today
//       if (!hasAlreadySentToday(time.name)) {
//         console.log(`Sending scheduled ${time.name} status email`)
//         sendStatusFn().catch((err) => console.error(`Error sending ${time.name} status email:`, err))

//         // Save the last sent time to persistent storage
//         saveLastSentTime(time.name)
//       } else {
//         console.log(`Already sent ${time.name} status email today, skipping`)
//       }

//       // Then schedule it to repeat every 24 hours
//       const dailyInterval = setInterval(
//         () => {
//           // Always check if we've already sent today before sending
//           if (!hasAlreadySentToday(time.name)) {
//             console.log(`Sending daily ${time.name} status email`)
//             sendStatusFn().catch((err) => console.error(`Error sending ${time.name} status email:`, err))

//             // Save the last sent time to persistent storage
//             saveLastSentTime(time.name)
//           } else {
//             console.log(`Already sent ${time.name} status email today, skipping`)
//           }
//         },
//         24 * 60 * 60 * 1000,
//       )

//       timeouts.push(dailyInterval)
//     }, msUntil)

//     timeouts.push(initialTimeout)
//   })

//   return timeouts
// }

// // Function to check if we missed any emails due to restart
// async function checkForMissedEmails(sendStatusFn: () => Promise<void>): Promise<void> {
//   try {
//     const now = new Date()
//     const scheduledTimes = [
//       { hour: 6, minute: 0, name: "morning" }, // 6:00 AM
//       { hour: 12, minute: 0, name: "afternoon" }, // 12:00 PM
//       { hour: 18, minute: 0, name: "evening" }, // 6:00 PM
//       { hour: 0, minute: 0, name: "midnight" }, // 12:00 AM
//     ]

//     // Check each scheduled time
//     for (const time of scheduledTimes) {
//       // Skip if we've already sent this notification today
//       if (hasAlreadySentToday(time.name)) {
//         console.log(`Already sent ${time.name} status email today, skipping missed email check`)
//         continue
//       }

//       // Create a date object for today's scheduled time
//       const scheduledTime = new Date(now)
//       scheduledTime.setHours(time.hour, time.minute, 0, 0)

//       // If the scheduled time has passed today but we haven't sent the email yet
//       if (scheduledTime < now && scheduledTime.getDate() === now.getDate()) {
//         console.log(`Detected missed ${time.name} status email. Sending now...`)
//         await sendStatusFn()

//         // Save the last sent time
//         saveLastSentTime(time.name)
//       }
//     }
//   } catch (error) {
//     console.error("Error checking for missed emails:", error)
//   }
// }

// // Helper function to check if we've already sent a notification today
// function hasAlreadySentToday(timeName: string): boolean {
//   try {
//     const record = getLastSentTime(timeName)
//     if (!record) return false

//     // Get today's date in YYYY-MM-DD format
//     const today = new Date().toISOString().split("T")[0]

//     // Compare with the stored date
//     return record.date === today
//   } catch (error) {
//     console.error(`Error checking if ${timeName} notification was sent today:`, error)
//     return false
//   }
// }

// // Function to save the last sent time to persistent storage
// function saveLastSentTime(timeName: string): void {
//   try {
//     const now = new Date()
//     // Create a record with both timestamp and date
//     const record: LastSentRecord = {
//       timestamp: now.toISOString(),
//       date: now.toISOString().split("T")[0], // Just the YYYY-MM-DD part
//     }

//     // Use a global object to store the last sent times in memory
//     ;(global as any).lastSentTimes[timeName] = record

//     // Also save to file system for persistence across restarts
//     const dataDir = path.join(__dirname, "../data")
//     if (!fs.existsSync(dataDir)) {
//       fs.mkdirSync(dataDir, { recursive: true })
//     }

//     // Save all times to a JSON file
//     const filePath = path.join(dataDir, "last-sent-times.json")
//     fs.writeFileSync(filePath, JSON.stringify((global as any).lastSentTimes, null, 2))

//     console.log(`Saved last sent time for ${timeName}: ${record.timestamp} (date: ${record.date})`)
//   } catch (error) {
//     console.error(`Error saving last sent time for ${timeName}:`, error)
//   }
// }

// // Function to get the last sent time from persistent storage
// function getLastSentTime(timeName: string): LastSentRecord | null {
//   try {
//     // Try to get from memory first
//     if ((global as any).lastSentTimes && (global as any).lastSentTimes[timeName]) {
//       return (global as any).lastSentTimes[timeName]
//     }

//     // If not in memory, try to load from file
//     const filePath = path.join(__dirname, "../data", "last-sent-times.json")

//     if (fs.existsSync(filePath)) {
//       // Load the file and parse it
//       const data = fs.readFileSync(filePath, "utf8")
//       const times = JSON.parse(data)

//       // Initialize the global object if needed
//       if (!(global as any).lastSentTimes) {
//         ;(global as any).lastSentTimes = {}
//       }

//       // Merge the loaded times with the global object
//       Object.assign((global as any).lastSentTimes, times)

//       return times[timeName] || null
//     }

//     return null
//   } catch (error) {
//     console.error(`Error getting last sent time for ${timeName}:`, error)
//     return null
//   }
// }


import { StatusLog } from "../src/models/status-log"

// Function to schedule status emails at specific times of day
export function scheduleStatusEmails(sendStatusFn: () => Promise<void>): NodeJS.Timeout[] {
  const timeouts: NodeJS.Timeout[] = []

  // Get current date
  const now = new Date()

  // Define the scheduled times
  const scheduledTimes = [
    { hour: 6, minute: 0, name: "morning" }, // 6:00 AM
    { hour: 12, minute: 0, name: "afternoon" }, // 12:00 PM
    { hour: 18, minute: 0, name: "evening" }, // 6:00 PM
    { hour: 0, minute: 0, name: "midnight" }, // 12:00 AM
  ]

  // Log scheduled times
  console.log("Status emails scheduled for:")
  scheduledTimes.forEach((time) => {
    const scheduledTime = new Date(now)
    scheduledTime.setHours(time.hour, time.minute, 0, 0)
    if (scheduledTime < now) scheduledTime.setDate(scheduledTime.getDate() + 1)
    const msUntil = scheduledTime.getTime() - now.getTime()
    console.log(`  - ${time.name}: ${scheduledTime.toLocaleString()} (in ${Math.round(msUntil / 60000)} minutes)`)
  })

  // Check if we missed any emails due to restart
  checkForMissedEmails(sendStatusFn)

  // Schedule the emails
  scheduledTimes.forEach((time) => {
    const scheduledTime = new Date(now)
    scheduledTime.setHours(time.hour, time.minute, 0, 0)
    if (scheduledTime < now) scheduledTime.setDate(scheduledTime.getDate() + 1)

    const msUntil = scheduledTime.getTime() - now.getTime()

    // Schedule the initial email
    const initialTimeout = setTimeout(async () => {
      // Check if we've already sent this notification today using the database
      if (!(await hasAlreadySentToday(time.name))) {
        console.log(`Sending scheduled ${time.name} status email`)
        try {
          await sendStatusFn()
          // Save the last sent time to database
          await saveStatusLog(time.name)
        } catch (err) {
          console.error(`Error sending ${time.name} status email:`, err)
        }
      } else {
        console.log(`Already sent ${time.name} status email today, skipping`)
      }

      // Then schedule it to repeat every 24 hours
      const dailyInterval = setInterval(
        async () => {
          // Always check if we've already sent today before sending
          if (!(await hasAlreadySentToday(time.name))) {
            console.log(`Sending daily ${time.name} status email`)
            try {
              await sendStatusFn()
              // Save the last sent time to database
              await saveStatusLog(time.name)
            } catch (err) {
              console.error(`Error sending ${time.name} status email:`, err)
            }
          } else {
            console.log(`Already sent ${time.name} status email today, skipping`)
          }
        },
        24 * 60 * 60 * 1000,
      )

      timeouts.push(dailyInterval)
    }, msUntil)

    timeouts.push(initialTimeout)
  })

  return timeouts
}

// Function to check if we missed any emails due to restart
async function checkForMissedEmails(sendStatusFn: () => Promise<void>): Promise<void> {
  try {
    const now = new Date()
    const scheduledTimes = [
      { hour: 6, minute: 0, name: "morning" }, // 6:00 AM
      { hour: 12, minute: 0, name: "afternoon" }, // 12:00 PM
      { hour: 18, minute: 0, name: "evening" }, // 6:00 PM
      { hour: 0, minute: 0, name: "midnight" }, // 12:00 AM
    ]

    // Check each scheduled time
    for (const time of scheduledTimes) {
      // Skip if we've already sent this notification today
      if (await hasAlreadySentToday(time.name)) {
        console.log(`Already sent ${time.name} status email today, skipping missed email check`)
        continue
      }

      // Create a date object for today's scheduled time
      const scheduledTime = new Date(now)
      scheduledTime.setHours(time.hour, time.minute, 0, 0)

      // If the scheduled time has passed today but we haven't sent the email yet
      if (scheduledTime < now && scheduledTime.getDate() === now.getDate()) {
        console.log(`Detected missed ${time.name} status email. Sending now...`)
        try {
          await sendStatusFn()
          // Save the last sent time to database
          await saveStatusLog(time.name)
        } catch (error) {
          console.error(`Error sending missed ${time.name} status email:`, error)
        }
      }
    }
  } catch (error) {
    console.error("Error checking for missed emails:", error)
  }
}

// Helper function to check if we've already sent a notification today using the database
async function hasAlreadySentToday(timeName: string): Promise<boolean> {
  try {
    // Get today's date in YYYY-MM-DD format
    const today = new Date().toISOString().split("T")[0]

    // Check if we have a record for today
    const existingLog = await StatusLog.findOne({ type: timeName, date: today })
    return !!existingLog
  } catch (error) {
    console.error(`Error checking if ${timeName} notification was sent today:`, error)
    return false
  }
}

// Function to save status log to database
async function saveStatusLog(timeName: string): Promise<void> {
  try {
    const now = new Date()
    const today = now.toISOString().split("T")[0] // YYYY-MM-DD format

    // Use findOneAndUpdate with upsert to avoid duplicates
    await StatusLog.findOneAndUpdate({ type: timeName, date: today }, { sentAt: now }, { upsert: true, new: true })

    console.log(`Saved status log for ${timeName} at ${now.toISOString()}`)
  } catch (error) {
    console.error(`Error saving status log for ${timeName}:`, error)
  }
}
