import mongoose from "mongoose"
import { config } from "dotenv"

config()

const MONGODB_URI = process.env.MONGODB_URI || "mongodb+srv://Adeoluwa123:09014078564Feranmi@cluster0.r8sg61r.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0"
const MAX_RETRY_ATTEMPTS = 5
const RETRY_INTERVAL_MS = 5000

// Connection options with increased timeouts
const connectionOptions = {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverSelectionTimeoutMS: 30000, // Increase from default 30s to 60s
  socketTimeoutMS: 45000, // Increase socket timeout
  connectTimeoutMS: 30000, // Increase connection timeout
  heartbeatFrequencyMS: 10000, // More frequent heartbeats
  maxPoolSize: 10, // Limit connection pool size
}

// Track connection state
let isConnected = false
let connectionAttempts = 0

// Connect to MongoDB with retry logic
export async function connectToDatabase(): Promise<void> {
  if (isConnected) {
    console.log("Already connected to MongoDB")
    return
  }

  try {
    console.log(`Connecting to MongoDB at ${MONGODB_URI.split("@").pop()}...`)
    
    await mongoose.connect(MONGODB_URI, connectionOptions)
    
    isConnected = true
    connectionAttempts = 0
    console.log("Successfully connected to MongoDB")

    // Set up connection event handlers
    mongoose.connection.on("error", (err) => {
      console.error("MongoDB connection error:", err)
      isConnected = false
      
      // Try to reconnect if this wasn't a deliberate disconnection
      if (mongoose.connection.readyState !== 0) {
        attemptReconnect()
      }
    })

    mongoose.connection.on("disconnected", () => {
      console.log("MongoDB disconnected")
      isConnected = false
      
      // Try to reconnect if this wasn't a deliberate disconnection
      if (mongoose.connection.readyState !== 0) {
        attemptReconnect()
      }
    })

    // Graceful shutdown
    process.on("SIGINT", async () => {
      try {
        await mongoose.connection.close()
        console.log("MongoDB connection closed through app termination")
        process.exit(0)
      } catch (err) {
        console.error("Error during MongoDB disconnection:", err)
        process.exit(1)
      }
    })

  } catch (error) {
    console.error("Failed to connect to MongoDB:", error)
    isConnected = false
    
    // Retry connection with backoff
    if (connectionAttempts < MAX_RETRY_ATTEMPTS) {
      connectionAttempts++
      console.log(`Retrying connection (attempt ${connectionAttempts}/${MAX_RETRY_ATTEMPTS}) in ${RETRY_INTERVAL_MS/1000} seconds...`)
      setTimeout(connectToDatabase, RETRY_INTERVAL_MS)
    } else {
      console.error(`Failed to connect to MongoDB after ${MAX_RETRY_ATTEMPTS} attempts`)
      throw error
    }
  }
}

// Function to attempt reconnection
function attemptReconnect(): void {
  if (connectionAttempts < MAX_RETRY_ATTEMPTS) {
    connectionAttempts++
    const delay = RETRY_INTERVAL_MS * connectionAttempts // Exponential backoff
    console.log(`Attempting to reconnect to MongoDB (attempt ${connectionAttempts}/${MAX_RETRY_ATTEMPTS}) in ${delay/1000} seconds...`)
    
    setTimeout(async () => {
      try {
        await mongoose.connect(MONGODB_URI, connectionOptions)
        isConnected = true
        connectionAttempts = 0
        console.log("Successfully reconnected to MongoDB")
      } catch (error) {
        console.error("Failed to reconnect to MongoDB:", error)
        attemptReconnect()
      }
    }, delay)
  } else {
    console.error(`Failed to reconnect to MongoDB after ${MAX_RETRY_ATTEMPTS} attempts`)
    // Consider sending an alert or restarting the application here
  }
}

// Check database connection status
export function isDatabaseConnected(): boolean {
  return isConnected && mongoose.connection.readyState === 1
}

// Safely execute a database operation with retry logic
export async function safeDbOperation<T>(operation: () => Promise<T>, defaultValue: T): Promise<T> {
  try {
    // Ensure we're connected before attempting operation
    if (!isDatabaseConnected()) {
      await connectToDatabase()
    }
    
    return await operation()
  } catch (error) {
    if (error instanceof Error && error.name === 'MongooseError' && error.message.includes('buffering timed out')) {
      console.error("MongoDB operation timed out, attempting to reconnect...")
      
      // Try to reconnect
      await connectToDatabase()
      
      // Retry the operation once
      try {
        return await operation()
      } catch (retryError) {
        console.error("Operation failed after reconnection attempt:", retryError)
        return defaultValue
      }
    }
    
    console.error("Database operation failed:", error)
    return defaultValue
  }
}


///one thing after the other
//I don't actually make noise, so don't know what else you wnat

//omooo
//God abeg