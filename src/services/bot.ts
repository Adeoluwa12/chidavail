// import puppeteer, { type Browser, type Page, type Frame } from "puppeteer"
// import axios, { type AxiosError } from "axios"
// import { authenticator } from "otplib"
// import { config } from "dotenv"
// import { sendEmail } from "./email"
// import { sendSMS } from "./sms"
// import { Referral } from "../models/referrals"
// import { Notification } from "../models/notification"
// import { StatusLog } from "../models/status-log"
// // Add the import for the database connection functions at the top of the file
// import { connectToDatabase, safeDbOperation } from "./database"

// export const BOT_VERSION = "1.0.0"

// config()

// // Global variables
// let browser: Browser | null = null
// let page: Page | null = null
// let lastCheckTime = new Date()
// let monitoringInterval: NodeJS.Timeout | null = null
// let isMonitoring = false
// let currentMembers: MemberData[] = []
// let isLoggedIn = false
// let currentFrame: Frame | null = null
// const pendingRequests = new Set<string>() // Track pending requests to prevent duplicates
// let lastRestartTime = new Date() // Track when we last restarted the browser
// const requestQueue: Map<string, boolean> = new Map() // Queue to track operations
// let requestAlreadyHandledErrors = 0 // Counter for "Request is already handled" errors
// const MAX_REQUEST_ALREADY_HANDLED_ERRORS = 20 // Threshold for restart

// // Constants
// const AVAILITY_URL = "https://apps.availity.com"
// const LOGIN_URL = "https://apps.availity.com/availity/web/public.elegant.login"
// const REFERRALS_API_URL = "https://apps.availity.com/api/v1/proxy/anthem/provconn/v1/carecentral/ltss/referral/details"
// const TOTP_SECRET = process.env.TOTP_SECRET || "RU4SZCAW4UESMUQNCG3MXTWKXA"
// const MONITORING_INTERVAL_MS = 60000 // 10 seconds (changed from 30000)
// const API_RETRY_DELAY_MS = 60000 // 60 seconds (based on Availity's retry header)
// const MAX_RETRIES = 5 // Maximum number of retries for operations
// const BROWSER_RESTART_INTERVAL_MS = 3600000 // 1 hour - restart browser periodically to prevent memory leaks

// // Interfaces
// interface ReferralResponse {
//   effectiveDate: string
//   referrals: Array<{
//     memberName: string
//     memberID: string
//     serviceName: string
//     regionName: string
//     county: string
//     plan: string
//     preferredStartDate: string
//     status: string
//     requestOn: string
//   }>
// }

// // Member interface for data extracted from the page
// export interface MemberData {
//   memberName: string
//   memberID: string
//   serviceName?: string
//   status?: string
//   county?: string
//   requestDate?: string
//   additionalInfo?: string
// }

// // Helper function for timeouts - reduced delay times
// async function delay(ms: number): Promise<void> {
//   return new Promise((resolve) => setTimeout(resolve, ms))
// }

// // Retry operation helper - reduced delay time
// async function retryOperation(operation: () => Promise<void>, retries = MAX_RETRIES, delayMs = 1000) {
//   for (let i = 0; i < retries; i++) {
//     try {
//       await operation()
//       return
//     } catch (error) {
//       console.log(`Attempt ${i + 1} failed:`, error)
//       if (i < retries - 1) {
//         console.log(`Retrying in ${delayMs}ms...`)
//         await delay(delayMs)
//       } else {
//         throw error
//       }
//     }
//   }
// }

// // Helper function to temporarily disable request interception
// async function withoutInterception<T>(page: Page, fn: () => Promise<T>): Promise<T> {
//   // Check if interception is enabled before trying to disable it
//   let wasEnabled = false

//   try {
//     // Check if interception is enabled using a safe method
//     wasEnabled = await page
//       .evaluate(() => {
//         // @ts-ignore - accessing internal property for checking
//         return !!window["_puppeteer"]?.network?._requestInterceptionEnabled
//       })
//       .catch(() => false)
//   } catch (error) {
//     console.log("Error checking interception status:", error)
//     wasEnabled = false
//   }

//   // Only disable if it was enabled
//   if (wasEnabled) {
//     try {
//       await page.setRequestInterception(false)
//       console.log("Request interception disabled temporarily")
//     } catch (error) {
//       console.error("Error disabling request interception:", error)
//       // Continue anyway
//     }
//   }

//   try {
//     // Run the function
//     return await fn()
//   } finally {
//     // Re-enable interception only if it was enabled before
//     if (wasEnabled) {
//       try {
//         await page.setRequestInterception(true)
//         console.log("Request interception re-enabled")
//       } catch (error) {
//         console.error("Error re-enabling request interception:", error)
//       }
//     }
//   }
// }

// // Safe wrapper for any puppeteer operation to handle "Request is already handled" errors
// async function safeOperation<T>(operation: () => Promise<T>, defaultValue: T): Promise<T> {
//   const operationId = `op-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`

//   // Check if we're already processing too many operations
//   if (requestQueue.size > 50) {
//     // Wait a bit if the queue is getting too large
//     await delay(100)
//   }

//   // Add to queue
//   requestQueue.set(operationId, true)

//   try {
//     return await operation()
//   } catch (error) {
//     if (error instanceof Error && error.message.includes("Request is already handled")) {
//       console.log("Ignoring 'Request is already handled' error in operation")
//       requestAlreadyHandledErrors++
//       return defaultValue
//     }
//     throw error
//   } finally {
//     // Remove from queue
//     requestQueue.delete(operationId)
//   }
// }

// export async function getSessionCookies(): Promise<string> {
//   if (!page) {
//     throw new Error("Page not initialized")
//   }

//   try {
//     const cookies = await page.cookies()
//     return cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join("; ")
//   } catch (error) {
//     console.error("Error getting session cookies:", error)
//     return ""
//   }
// }

// export async function closeBrowser(): Promise<void> {
//   if (browser) {
//     try {
//       await browser.close()
//     } catch (error) {
//       console.error("Error closing browser:", error)
//     } finally {
//       browser = null
//       page = null
//       currentFrame = null
//       isLoggedIn = false
//       console.log("Browser closed successfully")
//     }
//   }
// }

// // Check if browser needs to be restarted periodically to prevent memory leaks
// async function checkBrowserHealth(): Promise<void> {
//   const now = new Date()
//   const timeSinceLastRestart = now.getTime() - lastRestartTime.getTime()

//   if (timeSinceLastRestart > BROWSER_RESTART_INTERVAL_MS) {
//     console.log("Performing scheduled browser restart to prevent memory leaks...")

//     // Save current state
//     const wasMonitoring = isMonitoring

//     // Stop monitoring
//     if (monitoringInterval) {
//       clearInterval(monitoringInterval)
//       monitoringInterval = null
//     }

//     isMonitoring = false
//     isLoggedIn = false

//     // Close and restart browser
//     await closeBrowser()
//     await setupBot()

//     // Restore monitoring if it was active
//     if (wasMonitoring) {
//       await loginToAvaility()
//     }

//     // Update restart time
//     lastRestartTime = new Date()
//     console.log("Scheduled browser restart completed successfully")
//   }

//   // Check for too many "Request is already handled" errors
//   if (requestAlreadyHandledErrors > MAX_REQUEST_ALREADY_HANDLED_ERRORS) {
//     console.log(`Too many "Request is already handled" errors (${requestAlreadyHandledErrors}), forcing restart...`)
//     requestAlreadyHandledErrors = 0
//     await forceRestart()
//   }
// }

// // Force restart of the browser and monitoring
// async function forceRestart(): Promise<void> {
//   console.log("Forcing restart of browser and monitoring...")

//   try {
//     // Save current monitoring state
//     const wasMonitoring = isMonitoring

//     // Stop monitoring
//     if (monitoringInterval) {
//       clearInterval(monitoringInterval)
//       monitoringInterval = null
//     }

//     isMonitoring = false
//     isLoggedIn = false
//     currentFrame = null

//     // Close browser
//     await closeBrowser()

//     // Reset error counter
//     requestAlreadyHandledErrors = 0

//     // Update restart time
//     lastRestartTime = new Date()

//     // Restart the bot
//     await setupBot()

//     // Try to log in again
//     try {
//       await loginToAvaility()
//       console.log("Successfully restarted and logged in")

//       // Monitoring will be resumed by loginToAvaility if wasMonitoring was true
//     } catch (loginError) {
//       console.error("Failed to log in after restart:", loginError)

//       // No error email - just log the error

//       // Try to resume monitoring after a delay if it was active before
//       if (wasMonitoring) {
//         setTimeout(async () => {
//           try {
//             await loginToAvaility()
//           } catch (retryError) {
//             console.error("Failed to login on retry after restart:", retryError)
//           }
//         }, 60000) // Wait 1 minute before retry
//       }
//     }
//   } catch (error) {
//     console.error("Error during forced restart:", error)
//     // No error email - just log the error
//   }
// }

// // Update the setupBot function to include database connection
// export async function setupBot(): Promise<void> {
//   try {
//     // Connect to the database first
//     await connectToDatabase()

//     // If browser is already initialized, don't create a new one
//     if (browser && page) {
//       console.log("Browser already initialized, skipping setup")
//       return
//     }

//     // Close any existing browser instance to prevent resource leaks
//     await closeBrowser()

//     browser = await puppeteer.launch({
//       headless: true,
//       args: [
//         "--no-sandbox",
//         "--disable-setuid-sandbox",
//         "--disable-dev-shm-usage",
//         "--disable-accelerated-2d-canvas",
//         "--no-first-run",
//         "--no-zygote",
//         "--single-process",
//         "--disable-gpu",
//         "--disable-extensions",
//         "--disable-component-extensions-with-background-pages",
//         "--disable-default-apps",
//         "--mute-audio",
//         "--disable-background-timer-throttling",
//         "--disable-backgrounding-occluded-windows",
//         "--disable-renderer-backgrounding",
//         "--disable-background-networking",
//         "--disable-breakpad",
//         "--disable-sync",
//         "--disable-translate",
//         "--metrics-recording-only",
//         "--disable-hang-monitor",
//         "--disable-ipc-flooding-protection",
//         // Add these new options for better stability
//         "--disable-features=site-per-process",
//         "--disable-threaded-animation",
//         "--disable-threaded-scrolling",
//         "--disable-web-security",
//         "--memory-pressure-off",
//         // Reduce memory usage
//         "--js-flags=--max-old-space-size=512",
//       ],
//       defaultViewport: { width: 1024, height: 768 }, // Reduced from 1280x800
//       timeout: 60000, // Increased timeout
//     })

//     console.log("✅ Browser launched successfully")

//     // Create a new page
//     page = await browser.newPage()

//     // Set viewport size
//     await page.setViewport({ width: 1280, height: 800 })

//     // Add additional configurations
//     await page.setDefaultNavigationTimeout(50000)
//     await page.setDefaultTimeout(50000)

//     // Enable request interception to optimize performance - with better error handling
//     try {
//       await page.setRequestInterception(true)
//       console.log("Request interception enabled successfully")

//       page.on("request", (request) => {
//         // Use a more targeted approach to request interception
//         try {
//           if (request.isInterceptResolutionHandled()) {
//             return // Skip if already handled
//           }

//           const url = request.url()
//           const resourceType = request.resourceType()

//           // Only abort specific resource types or URLs
//           if (
//             resourceType === "image" ||
//             resourceType === "font" ||
//             resourceType === "media" ||
//             url.includes(".jpg") ||
//             url.includes(".png") ||
//             url.includes(".gif") ||
//             url.includes(".woff")
//           ) {
//             // For resources we want to block
//             request.abort()
//           } else {
//             // For resources we want to allow
//             request.continue()
//           }
//         } catch (error) {
//           // If request is already handled, just log and continue
//           if (error instanceof Error && error.message.includes("Request is already handled")) {
//             console.log("Request is already handled, ignoring")
//             requestAlreadyHandledErrors++
//           } else {
//             console.error("Error handling request:", error)
//             // Try to continue the request if possible
//             try {
//               if (!request.isInterceptResolutionHandled()) {
//                 request.continue()
//               }
//             } catch (continueError) {
//               // Just log, don't crash
//               console.error("Error continuing request:", continueError)
//             }
//           }
//         }
//       })
//     } catch (interceptError) {
//       console.error("Failed to enable request interception:", interceptError)
//       // Continue without interception
//     }

//     // Set up error handler for the page
//     page.on("error", (err) => {
//       console.error("Page error:", err)
//       // Don't crash the process, just log the error
//     })

//     // Update restart time
//     lastRestartTime = new Date()

//     console.log("✅ Bot setup completed")

//     // Set up the watchdog
//     setupWatchdog()
//   } catch (error) {
//     console.error("❌ Error setting up bot:", error)
//     throw error
//   }
// }

// async function handlePopups(page: Page): Promise<void> {
//   console.log("Checking for popups to dismiss...")
//   try {
//     const closeButtonSelectors = [
//       'button:has-text("×")',
//       "button.close",
//       'button[aria-label="Close"]',
//       ".modal-close",
//       ".dialog-close",
//       ".modal-header button",
//       'button:has-text("Close")',
//       'button:has-text("Cancel")',
//       'button:has-text("Dismiss")',
//     ]

//     for (const selector of closeButtonSelectors) {
//       try {
//         const closeButtons = await safeOperation(() => page.$$(selector), [])
//         for (const button of closeButtons) {
//           try {
//             const isVisible = await safeOperation(
//               () =>
//                 button.evaluate((el) => {
//                   const style = window.getComputedStyle(el)
//                   return style.display !== "none" && style.visibility !== "hidden" && style.opacity !== "0"
//                 }),
//               false,
//             )

//             if (isVisible) {
//               await safeOperation(() => button.click(), null)
//               await delay(300)
//             }
//           } catch (buttonError) {
//             // Continue to next button
//           }
//         }
//       } catch (error) {
//         // Continue to next selector
//       }
//     }

//     const modalSelectors = [".modal.show", ".dialog.show", '[role="dialog"]', '[aria-modal="true"]']

//     for (const selector of modalSelectors) {
//       try {
//         const modals = await safeOperation(() => page.$$(selector), [])
//         for (const modal of modals) {
//           try {
//             const closeButton = await safeOperation(
//               () => modal.$('button:has-text("×"), button.close, button[aria-label="Close"]'),
//               null,
//             )
//             if (closeButton) {
//               await safeOperation(() => closeButton.click(), null)
//               await delay(300)
//             }
//           } catch (modalError) {
//             // Continue to next modal
//           }
//         }
//       } catch (error) {
//         // Continue to next selector
//       }
//     }
//   } catch (error) {
//     console.error("❌ Error handling popups:", error)
//   }
// }

// export async function loginToAvaility(): Promise<boolean> {
//   // Create a unique request ID for this login attempt
//   const requestId = `login-${Date.now()}`

//   // Check if this request is already in progress
//   if (pendingRequests.has(requestId)) {
//     console.log(`Login request ${requestId} is already in progress, skipping`)
//     return false
//   }

//   // Add this request to pending requests
//   pendingRequests.add(requestId)

//   // Save current monitoring state
//   const wasMonitoring = isMonitoring

//   // Pause monitoring during login
//   if (monitoringInterval) {
//     console.log("Pausing monitoring during login process...")
//     clearInterval(monitoringInterval)
//     monitoringInterval = null
//     isMonitoring = false
//   }

//   console.log("Starting Availity login process...")

//   try {
//     // Check if browser needs to be restarted
//     await checkBrowserHealth()

//     // Check if we're already logged in and have a valid frame for monitoring
//     if (isLoggedIn && currentFrame) {
//       try {
//         // Verify the frame is still valid by executing a simple operation
//         await currentFrame.evaluate(() => document.title)
//         console.log("Already logged in and on referrals page, skipping login process")

//         // Resume monitoring if it was active before
//         if (wasMonitoring && !isMonitoring) {
//           console.log("Resuming monitoring after login check...")
//           await startContinuousMonitoring(currentFrame)
//         }

//         pendingRequests.delete(requestId)
//         return true
//       } catch (frameError) {
//         console.log("Current frame is no longer valid, will re-login")
//         isLoggedIn = false
//         currentFrame = null
//       }
//     }

//     if (!browser || !page) {
//       console.log("Browser or page not initialized. Setting up bot...")
//       await setupBot()
//     }

//     if (!page) {
//       throw new Error("Browser page not initialized")
//     }

//     console.log("Navigating to Availity login page...")
//     await withoutInterception(page!, async () => {
//       await page!.goto(LOGIN_URL, { waitUntil: "networkidle2" })
//     })

//     // Enter username and password
//     console.log("Entering credentials...")
//     await safeOperation(() => page!.type("#userId", process.env.AVAILITY_USERNAME || ""), null)
//     await safeOperation(() => page!.type("#password", process.env.AVAILITY_PASSWORD || ""), null)

//     // Click login button
//     await safeOperation(() => page!.click('button[type="submit"]'), null)

//     // Wait for either navigation to complete or for 2FA form to appear
//     try {
//       await Promise.race([
//         withoutInterception(page!, async () => {
//           await page!.waitForNavigation({ timeout: 50000 })
//         }),
//         safeOperation(() => page!.waitForSelector('form[name="backupCodeForm"]', { timeout: 50000 }), null),
//         safeOperation(() => page!.waitForSelector('form[name="authenticatorCodeForm"]', { timeout: 50000 }), null),
//         safeOperation(() => page!.waitForSelector(".top-applications", { timeout: 50000 }), null),
//       ])
//     } catch (navError) {
//       console.log("Navigation timeout or selector not found. Checking login status...")
//     }

//     // Check if we're logged in by looking for dashboard elements
//     const loginCheck = await safeOperation(
//       () =>
//         page!.evaluate(() => {
//           const dashboardElements =
//             document.querySelector(".top-applications") !== null ||
//             document.querySelector(".av-dashboard") !== null ||
//             document.querySelector(".dashboard-container") !== null

//           const cookieConsent = Array.from(document.querySelectorAll("h1, h2, h3, h4, h5, h6")).some((h) =>
//             h.textContent?.includes("Cookie Consent & Preferences"),
//           )

//           return dashboardElements || cookieConsent
//         }),
//       false,
//     )

//     // Check if we need to handle 2FA
//     console.log("Checking if 2FA authentication is required...")
//     const is2FARequired = await safeOperation(
//       () =>
//         page!.evaluate(() => {
//           return (
//             document.querySelector('form[name="backupCodeForm"]') !== null ||
//             document.querySelector('form[name="authenticatorCodeForm"]') !== null ||
//             document.querySelector('input[type="radio"][value*="authenticator"]') !== null ||
//             document.querySelector('input[type="radio"][value*="backup"]') !== null
//           )
//         }),
//       false,
//     )

//     if (is2FARequired) {
//       console.log("2FA authentication is required. Handling 2FA...")
//       await handle2FA(page!)
//       isLoggedIn = true
//     } else if (loginCheck) {
//       console.log("Already logged in - no 2FA required")
//       isLoggedIn = true
//     } else {
//       const currentUrl = page!.url()
//       console.log(`Current URL: ${currentUrl}`)

//       if (currentUrl.includes("login") || currentUrl.includes("authenticate")) {
//         throw new Error("Login failed - still on login page")
//       }
//     }

//     // Handle any cookie consent popup that might appear after login
//     await handleCookieConsent(page!)

//     // Handle any other popups that might appear
//     await handlePopups(page!)

//     // Navigate to Care Central
//     console.log("Proceeding to navigate to Care Central...")
//     await navigateToCareCentral(page!)

//     console.log("Login process completed successfully")

//     // Resume monitoring if it was active before
//     if (wasMonitoring && !isMonitoring && currentFrame) {
//       console.log("Resuming monitoring after successful login...")
//       await startContinuousMonitoring(currentFrame)
//     }

//     pendingRequests.delete(requestId)
//     return true
//   } catch (error) {
//     console.error("Error during login attempt:", error)
//     isLoggedIn = false
//     currentFrame = null

//     // Try to resume monitoring if it was active before, even after error
//     if (wasMonitoring && !isMonitoring) {
//       console.log("Attempting to resume monitoring after login failure...")
//       // Try again to login after a short delay
//       setTimeout(async () => {
//         try {
//           await loginToAvaility()
//         } catch (retryError) {
//           console.error("Failed to login on retry:", retryError)
//         }
//       }, 60000) // Wait 1 minute before retry
//     }

//     pendingRequests.delete(requestId)
//     throw error
//   }
// }

// async function handle2FA(page: Page): Promise<void> {
//   console.log("Starting 2FA authentication process...")
//   try {
//     // Wait for the 2FA options to be visible
//     await safeOperation(() => page.waitForSelector('input[type="radio"]', { visible: true, timeout: 40000 }), null)

//     let authenticatorOptionSelected = false

//     // Approach 1: Try direct selector for the authenticator app radio button
//     try {
//       const authenticatorRadioSelector =
//         'input[type="radio"][value*="authenticator"], input[type="radio"][id*="authenticator"], input[type="radio"][name*="authenticator"]'
//       const authenticatorRadio = await safeOperation(() => page.$(authenticatorRadioSelector), null)

//       if (authenticatorRadio) {
//         await safeOperation(() => authenticatorRadio.click(), null)
//         authenticatorOptionSelected = true
//       }
//     } catch (error) {
//       // Try next approach
//     }

//     // Approach 2: Try finding by label text if approach 1 failed
//     if (!authenticatorOptionSelected) {
//       try {
//         const labels = await safeOperation(() => page.$$("label"), [])
//         for (const label of labels) {
//           try {
//             const text = await safeOperation(() => label.evaluate((el) => el.textContent), null)
//             if (text && text.toLowerCase().includes("authenticator app")) {
//               await safeOperation(() => label.click(), null)
//               authenticatorOptionSelected = true
//               break
//             }
//           } catch (labelError) {
//             // Continue to next label
//           }
//         }
//       } catch (error) {
//         // Try next approach
//       }
//     }

//     // Approach 3: Try selecting the first radio button (assuming it's the authenticator app option)
//     if (!authenticatorOptionSelected) {
//       try {
//         const radioButtons = await safeOperation(() => page.$$('input[type="radio"]'), [])
//         if (radioButtons.length >= 1) {
//           await safeOperation(() => radioButtons[0].click(), null)
//           authenticatorOptionSelected = true
//         }
//       } catch (error) {
//         // Failed all approaches
//       }
//     }

//     if (!authenticatorOptionSelected) {
//       throw new Error("Could not select authenticator app option using any method")
//     }

//     // Click the Continue button
//     const continueButton = await safeOperation(() => page.$('button[type="submit"]'), null)
//     if (!continueButton) {
//       throw new Error("Continue button not found")
//     }
//     await safeOperation(() => continueButton.click(), null)

//     // Wait for the OTP input form to load
//     await safeOperation(
//       () =>
//         page.waitForSelector('input[name="code"], input[name="authenticatorCode"], input[type="text"]', {
//           visible: true,
//           timeout: 40000,
//         }),
//       null,
//     )

//     // Generate the TOTP code
//     const totpCode = authenticator.generate(TOTP_SECRET)
//     console.log("Generated TOTP code")

//     // Enter the TOTP code
//     const codeInputSelectors = ['input[name="code"]', 'input[name="authenticatorCode"]', 'input[type="text"]']

//     let codeEntered = false

//     for (const selector of codeInputSelectors) {
//       try {
//         const codeInput = await safeOperation(() => page.$(selector), null)
//         if (codeInput) {
//           await safeOperation(() => codeInput.type(totpCode), null)
//           codeEntered = true
//           break
//         }
//       } catch (error) {
//         // Try next selector
//       }
//     }

//     if (!codeEntered) {
//       throw new Error("Could not enter TOTP code")
//     }

//     // Click submit button
//     const submitButtonSelectors = [
//       'button[type="submit"]',
//       'button:has-text("Continue")',
//       'button:has-text("Submit")',
//       'button:has-text("Verify")',
//       "button.btn-primary",
//     ]

//     let submitButtonClicked = false

//     for (const selector of submitButtonSelectors) {
//       try {
//         const submitButton = await safeOperation(() => page.$(selector), null)
//         if (submitButton) {
//           await Promise.all([
//             safeOperation(() => submitButton.click(), null),
//             page.waitForNavigation({ waitUntil: "networkidle2", timeout: 40000 }).catch((err) => {
//               console.log("Navigation timeout after submitting code, but this might be expected")
//             }),
//           ])
//           submitButtonClicked = true
//           break
//         }
//       } catch (error) {
//         // Try next selector
//       }
//     }

//     if (!submitButtonClicked) {
//       throw new Error("Could not find or click submit button")
//     }

//     // Wait for post-2FA page to load
//     try {
//       await Promise.race([
//         safeOperation(
//           () =>
//             page.waitForSelector(".top-applications, .av-dashboard, .dashboard-container", {
//               timeout: 50000,
//               visible: true,
//             }),
//           null,
//         ),
//         safeOperation(
//           () =>
//             page.waitForFunction(
//               () => {
//                 const headings = Array.from(document.querySelectorAll("h1, h2, h3, h4, h5, h6"))
//                 return headings.some((h) => h.textContent?.includes("Cookie Consent & Preferences"))
//               },
//               { timeout: 50000 },
//             ),
//           null,
//         ),
//         safeOperation(
//           () =>
//             page.waitForSelector(".alert-danger, .error-message", {
//               timeout: 50000,
//               visible: true,
//             }),
//           null,
//         ),
//       ])

//       const errorMessage = await safeOperation(() => page.$(".alert-danger, .error-message"), null)
//       if (errorMessage) {
//         const text = await safeOperation(() => page.evaluate((el) => el.textContent, errorMessage), "")
//         throw new Error(`2FA resulted in error: ${text}`)
//       }

//       await delay(3000)
//     } catch (error) {
//       // Navigation timeout after 2FA, but this might be expected
//     }

//     const isLoggedInCheck = await safeOperation(
//       () =>
//         page.evaluate(() => {
//           const dashboardElements =
//             document.querySelector(".top-applications") !== null ||
//             document.querySelector(".av-dashboard") !== null ||
//             document.querySelector(".dashboard-container") !== null

//           const cookieConsent = Array.from(document.querySelectorAll("h1, h2, h3, h4, h5, h6")).some((h) =>
//             h.textContent?.includes("Cookie Consent & Preferences"),
//           )

//           return dashboardElements || cookieConsent
//         }),
//       false,
//     )

//     if (!isLoggedInCheck) {
//       throw new Error("2FA verification failed - no dashboard elements found")
//     }

//     console.log("2FA authentication successful")
//   } catch (error) {
//     console.error("Error handling 2FA:", error)
//     throw error
//   }
// }

// async function handleCookieConsent(page: Page): Promise<void> {
//   console.log("Checking for cookie consent popup...")
//   try {
//     await safeOperation(
//       () =>
//         page
//           .waitForFunction(
//             () => {
//               const heading = Array.from(document.querySelectorAll("h1, h2, h3, h4, h5, h6")).find((el) =>
//                 el.textContent?.includes("Cookie Consent & Preferences"),
//               )
//               const acceptButton = document.querySelector(
//                 'button.primary-button, button:has-text("Accept All Cookies")',
//               )
//               return heading && acceptButton
//             },
//             { timeout: 3000 },
//           )
//           .catch(() => {
//             // No cookie consent popup found within timeout
//           }),
//       null,
//     )

//     let accepted = false

//     try {
//       const acceptButtonSelector = 'button.primary-button, button:has-text("Accept All Cookies")'
//       const acceptButton = await safeOperation(() => page.$(acceptButtonSelector), null)
//       if (acceptButton) {
//         await safeOperation(() => acceptButton.click(), null)
//         await delay(500)
//         accepted = true
//       }
//     } catch (error) {
//       // Try next approach
//     }

//     if (!accepted) {
//       try {
//         accepted = await safeOperation(
//           () =>
//             page.evaluate(() => {
//               const buttons = Array.from(document.querySelectorAll("button"))
//               const acceptButton = buttons.find((button) =>
//                 button.textContent?.toLowerCase().includes("accept all cookies"),
//               )
//               if (acceptButton) {
//                 acceptButton.click()
//                 return true
//               }
//               return false
//             }),
//           false,
//         )
//         if (accepted) {
//           await delay(500)
//         }
//       } catch (error) {
//         // Try next approach
//       }
//     }

//     if (!accepted) {
//       try {
//         await safeOperation(() => page.mouse.click(636, 636), null)
//         await delay(500)
//       } catch (error) {
//         // Failed all approaches
//       }
//     }

//     console.log("Cookie consent handled")
//   } catch (error) {
//     // Ignore cookie consent errors
//   }
// }

// async function navigateToCareCentral(page: Page): Promise<void> {
//   console.log("Navigating to Care Central...")
//   try {
//     // Wait for the dashboard to load
//     await safeOperation(() => page.waitForSelector("body", { timeout: 50000, visible: true }), null)

//     // Wait for a bit to ensure the page is fully loaded  { timeout: 50000, visible: true }), null)

//     // Wait for a bit to ensure the page is fully loaded
//     await delay(1000)

//     // Look for "My Top Applications" heading first
//     const myTopAppsHeadingSelectors = [
//       'h1:has-text("My Top Applications")',
//       'h2:has-text("My Top Applications")',
//       'h3:has-text("My Top Applications")',
//       'h4:has-text("My Top Applications")',
//       'div:has-text("My Top Applications")',
//       'span:has-text("My Top Applications")',
//     ]

//     let myTopAppsHeading = null
//     for (const selector of myTopAppsHeadingSelectors) {
//       try {
//         myTopAppsHeading = await safeOperation(() => page.$(selector), null)
//         if (myTopAppsHeading) {
//           break
//         }
//       } catch (error) {
//         // Try next selector
//       }
//     }

//     // Now try to find Care Central by searching for all elements containing that text
//     const careCentralElements = await safeOperation(
//       () =>
//         page.evaluate(() => {
//           const allElements = Array.from(document.querySelectorAll("*"))
//           return allElements
//             .filter((el) => {
//               const text = el.textContent || ""
//               return text.includes("Care Central") && !text.includes("Care Central.")
//             })
//             .map((el) => {
//               const rect = el.getBoundingClientRect()
//               return {
//                 x: rect.x + rect.width / 2,
//                 y: rect.y + rect.height / 2,
//                 width: rect.width,
//                 height: rect.height,
//                 text: el.textContent,
//                 tagName: el.tagName,
//                 id: el.id,
//               }
//             })
//         }),
//       [],
//     )

//     // Try to click the most likely element (filter for reasonable size and position)
//     let clicked = false
//     for (const element of careCentralElements) {
//       // Look for elements that are likely to be clickable tiles (reasonable size)
//       if (element.width > 50 && element.height > 50) {
//         try {
//           await safeOperation(() => page.mouse.click(element.x, element.y), null)
//           clicked = true

//           // Wait a bit to see if navigation happens
//           await delay(4000)

//           // Check if we've navigated away from the dashboard
//           const currentUrl = page.url()

//           if (currentUrl.includes("care-central") || !currentUrl.includes("dashboard")) {
//             break
//           } else {
//             clicked = false
//           }
//         } catch (error) {
//           // Try next element
//         }
//       }
//     }

//     // If we still haven't clicked successfully, try a different approach
//     if (!clicked) {
//       // Try to find the Wellpoint image
//       const wellpointImages = await safeOperation(
//         () =>
//           page.evaluate(() => {
//             const images = Array.from(document.querySelectorAll("img"))
//             return images
//               .filter((img) => {
//                 const src = img.src || ""
//                 const alt = img.alt || ""
//                 return (
//                   src.includes("wellpoint") ||
//                   alt.includes("Wellpoint") ||
//                   src.includes("Wellpoint") ||
//                   alt.includes("wellpoint")
//                 )
//               })
//               .map((img) => {
//                 const rect = img.getBoundingClientRect()
//                 return {
//                   x: rect.x + rect.width / 2,
//                   y: rect.y + rect.height / 2,
//                   width: rect.width,
//                   height: rect.height,
//                   src: img.src,
//                   alt: img.alt,
//                 }
//               })
//           }),
//         [],
//       )

//       // Try clicking on a Wellpoint image
//       for (const img of wellpointImages) {
//         try {
//           await safeOperation(() => page.mouse.click(img.x, img.y), null)
//           clicked = true
//           await delay(4000)
//           break
//         } catch (error) {
//           // Try next image
//         }
//       }
//     }

//     // Last resort - try clicking at fixed coordinates where Care Central is likely to be
//     if (!clicked) {
//       // Try a few different positions where Care Central might be
//       const potentialPositions = [
//         { x: 240, y: 400 },
//         { x: 240, y: 430 },
//         { x: 270, y: 400 },
//         { x: 200, y: 400 },
//       ]

//       for (const pos of potentialPositions) {
//         try {
//           await safeOperation(() => page.mouse.click(pos.x, pos.y), null)
//           await delay(4000)

//           // Check if we've navigated away
//           const currentUrl = page.url()
//           if (currentUrl.includes("care-central") || !currentUrl.includes("dashboard")) {
//             clicked = true
//             break
//           }
//         } catch (error) {
//           // Try next position
//         }
//       }
//     }

//     if (!clicked) {
//       throw new Error("Failed to click on Care Central after trying multiple approaches")
//     }

//     // Wait for the iframe to load
//     await safeOperation(() => page.waitForSelector("#newBodyFrame", { timeout: 40000 }), null)

//     // Get all frames and find the one with name="newBody"
//     const frames = page.frames()
//     const newBodyFrame = frames.find((frame) => frame.name() === "newBody")

//     if (!newBodyFrame) {
//       throw new Error("Could not find newBody iframe")
//     }

//     // Wait for the form to load in the iframe
//     await safeOperation(() => newBodyFrame.waitForSelector("form", { timeout: 40000 }), null)

//     // Wait for the organization dropdown to be present in the iframe
//     await safeOperation(() => newBodyFrame.waitForSelector("#organizations", { timeout: 40000 }), null)

//     // Click on the organization dropdown
//     await safeOperation(() => newBodyFrame.click("#organizations"), null)
//     await delay(500)

//     // Type the organization name
//     await safeOperation(() => newBodyFrame.click("#organizations"), null)
//     await delay(500)

//     // Wait for and click the option
//     await safeOperation(() => newBodyFrame.waitForSelector(".av-select", { visible: true, timeout: 30000 }), null)
//     await safeOperation(() => newBodyFrame.click(".av-select"), null)

//     // Look specifically for Harmony Health LLC option
//     const harmonyOption = await safeOperation(
//       () =>
//         newBodyFrame.evaluate(() => {
//           const options = Array.from(document.querySelectorAll(".av__option"))
//           const harmonyOption = options.find(
//             (option) => option.textContent && option.textContent.includes("Harmony Health LLC"),
//           )
//           return harmonyOption ? true : false
//         }),
//       false,
//     )

//     if (harmonyOption) {
//       // Click on the Harmony Health LLC option
//       await safeOperation(
//         () =>
//           newBodyFrame.evaluate(() => {
//             const options = Array.from(document.querySelectorAll(".av__option"))
//             const harmonyOption = options.find(
//               (option) => option.textContent && option.textContent.includes("Harmony Health LLC"),
//             )
//             if (harmonyOption) {
//               ;(harmonyOption as HTMLElement).click()
//             }
//           }),
//         null,
//       )
//     } else {
//       // If Harmony Health LLC not found, click the first option
//       await safeOperation(() => newBodyFrame.click(".av__option"), null)
//     }

//     // Wait for provider field to become enabled
//     // Click and select provider
//     await safeOperation(() => newBodyFrame.click("#providerName"), null)
//     await delay(500)

//     // Wait for dropdown options to appear
//     await safeOperation(() => newBodyFrame.waitForSelector(".av__option", { visible: true, timeout: 30000 }), null)

//     // Look specifically for Harmony Health provider option
//     const harmonyProviderOption = await safeOperation(
//       () =>
//         newBodyFrame.evaluate(() => {
//           const options = Array.from(document.querySelectorAll(".av__option"))
//           const harmonyOption = options.find(
//             (option) =>
//               option.textContent &&
//               (option.textContent.includes("Harmony Health") || option.textContent.includes("HARMONY HEALTH")),
//           )
//           return harmonyOption ? true : false
//         }),
//       false,
//     )

//     if (harmonyProviderOption) {
//       // Click on the Harmony Health provider option
//       await safeOperation(
//         () =>
//           newBodyFrame.evaluate(() => {
//             const options = Array.from(document.querySelectorAll(".av__option"))
//             const harmonyOption = options.find(
//               (option) =>
//                 option.textContent &&
//                 (option.textContent.includes("Harmony Health") || option.textContent.includes("HARMONY HEALTH")),
//             )
//             if (harmonyOption) {
//               ;(harmonyOption as HTMLElement).click()
//             }
//           }),
//         null,
//       )
//     } else {
//       // If Harmony Health not found, click the first option
//       await safeOperation(() => newBodyFrame.click(".av__option"), null)
//     }

//     // Wait for selection to be processed
//     await delay(500)

//     // Click the Next button
//     await safeOperation(() => newBodyFrame.click("button.btn.btn-primary"), null)

//     // Wait for navigation
//     try {
//       await page.waitForNavigation({ waitUntil: "networkidle0", timeout: 30000 })
//     } catch (navError) {
//       // Navigation timeout after Next, but this might be expected
//       console.log("Navigation timeout after clicking Next, continuing anyway")
//     }

//     // Now we need to click on the Referrals button inside the iframe
//     // Get the updated frames after navigation
//     const updatedFrames = page.frames()
//     const updatedNewBodyFrame = updatedFrames.find((frame) => frame.name() === "newBody")

//     if (!updatedNewBodyFrame) {
//       throw new Error("Could not find newBody iframe after navigation")
//     }

//     // Store the current frame for future use
//     currentFrame = updatedNewBodyFrame

//     // Look for the Referrals button with data-id="referral"
//     try {
//       // Wait for the button to be visible
//       await safeOperation(
//         () => currentFrame!.waitForSelector('button[data-id="referral"]', { visible: true, timeout: 10000 }),
//         null,
//       )

//       // Click the Referrals button
//       await safeOperation(() => currentFrame!.click('button[data-id="referral"]'), null)

//       // Wait for the page to update after clicking
//       await delay(4000)
//     } catch (error) {
//       // Try alternative approach - evaluate and click directly in the frame
//       const clicked = await safeOperation(
//         () =>
//           currentFrame!.evaluate(() => {
//             const buttons = Array.from(document.querySelectorAll("button"))
//             const referralButton = buttons.find(
//               (button) => button.textContent && button.textContent.includes("Referrals"),
//             )
//             if (referralButton) {
//               ;(referralButton as HTMLElement).click()
//               return true
//             }
//             return false
//           }),
//         false,
//       )

//       if (!clicked) {
//         throw new Error("Could not find Referrals button by text")
//       }

//       // Wait for the page to update
//       await delay(4000)
//     }

//     // Now extract member information from the referrals page
//     await extractMemberInformation(currentFrame)
//   } catch (error) {
//     console.error("Error navigating to Care Central:", error)
//     currentFrame = null
//     isLoggedIn = false
//     throw error
//   }
// }

// // Function to extract member information from the referrals page
// async function extractMemberInformation(frame: Frame): Promise<MemberData[]> {
//   console.log("Extracting member information from referrals page...")
//   try {
//     // Wait for the referrals content to load
//     await safeOperation(
//       () =>
//         frame.waitForSelector(".incoming-referral-info", { timeout: 15000 }).catch(async () => {
//           // If no referrals are found, send a notification and start monitoring
//           console.log("No members found in referrals page.")

//           // Send email notification that no members were found
//           // await sendEmail(
//           //   "Availity Referrals Monitoring Active",
//           //   "No members were found in the referrals section at this time.\n\n" +
//           //     "The monitoring system is active and will check for new members every 10 seconds.\n\n" +
//           //     "You will receive an email notification as soon as a new member is detected.",
//           // )

//           // Start continuous monitoring
//           await startContinuousMonitoring(frame)

//           return []
//         }),
//       null,
//     )

//     // If referrals are found, extract member information
//     const members = await extractMembersFromFrame(frame)

//     // Save members to database
//     await saveMembersToDatabase(members)

//     // Start continuous monitoring for new referrals
//     await startContinuousMonitoring(frame)

//     return members
//   } catch (error) {
//     console.error("Error extracting member information:", error)
//     return []
//   }
// }

// // Helper function to extract members from the frame
// async function extractMembersFromFrame(frame: Frame): Promise<MemberData[]> {
//   try {
//     return await safeOperation(
//       () =>
//         frame.evaluate(() => {
//           const results: Array<{
//             memberName: string
//             memberID: string
//             serviceName: string
//             status: string
//             county: string
//             requestDate: string
//             additionalInfo: string
//           }> = []

//           // Find all referral info containers
//           const referralContainers = document.querySelectorAll(".incoming-referral-info")

//           if (referralContainers.length === 0) {
//             return results
//           }

//           // Process each referral container
//           referralContainers.forEach((container) => {
//             try {
//               // Extract member name
//               const memberNameElement = container.querySelector(".memName")
//               const memberName =
//                 memberNameElement && memberNameElement.textContent ? memberNameElement.textContent.trim() : "Unknown"

//               // Extract service
//               const serviceElement = container.querySelector(".serviceCol")
//               const serviceName = serviceElement && serviceElement.textContent ? serviceElement.textContent.trim() : ""

//               // Extract region
//               const regionElement = container.querySelector(".regionCol")
//               const region = regionElement && regionElement.textContent ? regionElement.textContent.trim() : ""

//               // Extract county
//               const countyElement = container.querySelector(".countyCol")
//               const county = countyElement && countyElement.textContent ? countyElement.textContent.trim() : ""

//               // Extract program
//               const programElement = container.querySelector(".programCol")
//               const program = programElement && programElement.textContent ? programElement.textContent.trim() : ""

//               // Extract status
//               const statusElement = container.querySelector(".statusCol .badge")
//               const status = statusElement && statusElement.textContent ? statusElement.textContent.trim() : ""

//               // Extract referral number from more details section
//               const moreDetailsSection = container.querySelector(".more-detail-section")
//               let referralNumber = ""
//               let requestDate = ""
//               let yearOfBirth = ""
//               let zipCode = ""

//               if (moreDetailsSection) {
//                 // Find all detail rows
//                 const detailRows = moreDetailsSection.querySelectorAll(".d-flex")

//                 detailRows.forEach((row) => {
//                   // Look for Referral # field
//                   const headers = row.querySelectorAll(".moreDetailsHeader")
//                   const data = row.querySelectorAll(".moreDetailsData")

//                   for (let i = 0; i < headers.length; i++) {
//                     const headerElement = headers[i]
//                     const dataElement = i < data.length ? data[i] : null

//                     const headerText =
//                       headerElement && headerElement.textContent ? headerElement.textContent.trim() : ""
//                     const dataText = dataElement && dataElement.textContent ? dataElement.textContent.trim() : ""

//                     if (headerText.includes("Referral #")) {
//                       referralNumber = dataText
//                     }

//                     if (headerText.includes("Requested On")) {
//                       requestDate = dataText
//                     }

//                     if (headerText.includes("Year of Birth")) {
//                       yearOfBirth = dataText
//                     }

//                     if (headerText.includes("Zip Code")) {
//                       zipCode = dataText
//                     }
//                   }
//                 })
//               }

//               // Create member data object
//               const memberData = {
//                 memberName,
//                 memberID: referralNumber || `unknown-${Date.now()}`, // Using referral number as member ID, with fallback
//                 serviceName,
//                 status,
//                 county,
//                 requestDate,
//                 additionalInfo: `Region: ${region}, County: ${county}, Program: ${program}, YOB: ${yearOfBirth}, Zip: ${zipCode}`,
//               }

//               results.push(memberData)
//             } catch (err) {
//               // Skip this container if there's an error
//             }
//           })

//           return results
//         }),
//       [],
//     )
//   } catch (error) {
//     console.error("Error extracting members from frame:", error)
//     return []
//   }
// }

// // Function to save members to database
// async function saveMembersToDatabase(members: MemberData[]): Promise<void> {
//   try {
//     for (const member of members) {
//       // Check if member already exists in database using safeDbOperation
//       const existingMember = await safeDbOperation(
//         () =>
//           Referral.findOne({
//             memberID: member.memberID,
//             memberName: member.memberName,
//           }),
//         null,
//       )

//       if (!existingMember) {
//         console.log(`Adding new member to database: ${member.memberName} (${member.memberID})`)

//         // Create new referral record using safeDbOperation
//         const newReferral = await safeDbOperation(
//           () =>
//             Referral.create({
//               memberName: member.memberName,
//               memberID: member.memberID,
//               serviceName: member.serviceName || "",
//               status: member.status || "",
//               county: member.county || "",
//               requestOn: member.requestDate || new Date().toISOString(),
//               isNotified: true, // Mark as notified immediately when creating
//             }),
//           null,
//         )

//         if (newReferral) {
//           // Create notification using safeDbOperation
//           await safeDbOperation(
//             () =>
//               Notification.create({
//                 referralId: newReferral._id,
//                 memberName: member.memberName,
//                 memberID: member.memberID,
//                 message: `Member found in referrals: ${member.memberName} (${member.serviceName || "No service specified"})`,
//               }),
//             null,
//           )

//           // Send SMS notification for new member
//           await sendSMS(
//             `New member in referrals: ${member.memberName} (${member.memberID}). Check dashboard for details.`,
//           )
//         }
//       } else if (existingMember && !existingMember.isNotified) {
//         // If the member exists but hasn't been notified yet, mark as notified
//         existingMember.isNotified = true
//         await safeDbOperation(() => existingMember.save(), null)

//         console.log(`Marked existing member as notified: ${member.memberName} (${member.memberID})`)
//       }
//     }
//   } catch (error) {
//     console.error("Error saving members to database:", error)
//     // Continue even if database operations fail
//   }
// }

// // Update the processNewMembers function to use safeDbOperation
// async function processNewMembers(members: MemberData[]): Promise<void> {
//   console.log("Processing new members...")
//   try {
//     // We'll use the database to check which members have already been notified about
//     const unnotifiedMembers = []

//     for (const member of members) {
//       // Check if this referral has already been notified about using safeDbOperation
//       const existingReferral = await safeDbOperation(
//         () =>
//           Referral.findOne({
//             memberID: member.memberID,
//             memberName: member.memberName,
//             isNotified: true,
//           }),
//         null,
//       )

//       if (!existingReferral) {
//         unnotifiedMembers.push(member)
//       }
//     }

//     if (unnotifiedMembers.length === 0) {
//       console.log("All new members have already been notified about, skipping notifications")
//       return
//     }

//     // Rest of the function remains the same...

//     // Save to database
//     await saveMembersToDatabase(unnotifiedMembers)

//     // Send email notification
//     let emailContent = "New Referrals Detected:\n\n"

//     unnotifiedMembers.forEach((member, index) => {
//       emailContent += `Member ${index + 1}:\n`
//       emailContent += `Name: ${member.memberName}\n`
//       emailContent += `ID: ${member.memberID}\n`

//       if (member.serviceName) {
//         emailContent += `Service: ${member.serviceName}\n`
//       }

//       if (member.status) {
//         emailContent += `Status: ${member.status}\n`
//       }

//       if (member.county) {
//         emailContent += `County: ${member.county}\n`
//       }

//       if (member.requestDate) {
//         emailContent += `Request Date: ${member.requestDate}\n`
//       }

//       emailContent += "\n"
//     })

//     await sendEmail("New Availity Referrals Detected", emailContent)
//     console.log("Email notification sent for new members")

//     // Send SMS for each new member
//     for (const member of unnotifiedMembers) {
//       await sendSMS(`New referral detected: ${member.memberName} (${member.memberID}). Check dashboard for details.`)
//     }
//     console.log("SMS notifications sent for new members")
//   } catch (error) {
//     console.error("Error processing new members:", error)
//     // Continue even if notification fails
//   }
// }

// async function startContinuousMonitoring(frame: Frame): Promise<void> {
//   if (isMonitoring) {
//     console.log("Monitoring already active, skipping setup")
//     return // Already monitoring
//   }

//   console.log("Starting continuous monitoring for new referrals")
//   isMonitoring = true

//   // Store the current members for comparison
//   currentMembers = await extractMembersFromFrame(frame)
//   console.log(`Initial monitoring state: ${currentMembers.length} members`)

//   // Set up the interval to check for new referrals every 30 seconds
//   monitoringInterval = setInterval(async () => {
//     try {
//       console.log("Checking for new referrals...")

//       // Check if browser needs to be restarted
//       await checkBrowserHealth()

//       // Create a unique request ID for this monitoring check
//       const requestId = `monitor-${Date.now()}`

//       // Check if this request is already in progress
//       if (pendingRequests.has(requestId)) {
//         console.log(`Monitoring request ${requestId} is already in progress, skipping`)
//         return
//       }

//       // Add this request to pending requests
//       pendingRequests.add(requestId)

//       try {
//         // Verify the frame is still valid
//         try {
//           await frame.evaluate(() => document.title)
//         } catch (frameError) {
//           console.log("Frame is no longer valid, attempting to recover...")
//           throw new Error("detached Frame")
//         }

//         // Click on the "incoming" tab to refresh the data
//         console.log("Clicking on 'incoming' tab to refresh data...")

//         // Try multiple selectors to find the incoming tab
//         const incomingTabSelectors = [
//           'button:has-text("Incoming")',
//           'a:has-text("Incoming")',
//           'div:has-text("Incoming")',
//           'span:has-text("Incoming")',
//           'li:has-text("Incoming")',
//           'tab:has-text("Incoming")',
//           '.nav-item:has-text("Incoming")',
//           '.nav-link:has-text("Incoming")',
//         ]

//         let tabClicked = false

//         // Try each selector
//         for (const selector of incomingTabSelectors) {
//           try {
//             const elements = await safeOperation(() => frame.$$(selector), [])
//             for (const element of elements) {
//               try {
//                 // Check if this element is visible and contains only the text "Incoming"
//                 const isRelevant = await safeOperation(
//                   () =>
//                     element.evaluate((el) => {
//                       const text = el.textContent?.trim()
//                       return text === "Incoming" || text === "INCOMING"
//                     }),
//                   false,
//                 )

//                 if (isRelevant) {
//                   await safeOperation(() => element.click(), null)
//                   tabClicked = true
//                   console.log("Successfully clicked on 'incoming' tab")
//                   break
//                 }
//               } catch (elementError) {
//                 // Continue to next element
//               }
//             }
//             if (tabClicked) break
//           } catch (error) {
//             // Try next selector and try again
//           }
//         }

//         // If we couldn't find the tab by text, try finding it by position or other attributes
//         if (!tabClicked) {
//           // Try to find tabs/navigation elements and click the first one (assuming it's "Incoming"), yeah
//           try {
//             const navElements = await safeOperation(
//               () => frame.$$(".nav-tabs .nav-item, .nav-tabs .nav-link, .nav .nav-item, .nav .nav-link"),
//               [],
//             )
//             if (navElements.length > 0) {
//               await safeOperation(() => navElements[0].click(), null)
//               tabClicked = true
//               console.log("Clicked on first tab (assuming it's 'incoming')")
//             }
//           } catch (error) {
//             console.log("Could not find navigation elements")
//           }
//         }

//         if (!tabClicked) {
//           console.log("Could not find and click 'incoming' tab with any method")
//         }

//         // Wait a moment for the page to update after clicking
//         await delay(2000)

//         // Extract the current members from the frame
//         const newMembers = await extractMembersFromFrame(frame)
//         console.log(`Found ${newMembers.length} members, comparing with previous ${currentMembers.length} members`)

//         // Compare with previous members to find new ones
//         const addedMembers = findNewMembers(currentMembers, newMembers)

//         // If new members are found, process them
//         if (addedMembers.length > 0) {
//           console.log(`Found ${addedMembers.length} new members!`)
//           // Send notifications for new members
//           await processNewMembers(addedMembers)
//         } else {
//           console.log("No new members found")
//         }

//         // Update the current members list
//         currentMembers = newMembers
//       } finally {
//         // Always remove the request from pending requests
//         pendingRequests.delete(requestId)
//       }
//     } catch (error) {
//       console.error("Error during monitoring check:", error)

//       // Check if the frame is detached
//       if (error instanceof Error && error.message.includes("detached Frame")) {
//         console.log("Frame is detached, attempting to recover...")

//         // Stop the current monitoring
//         if (monitoringInterval) {
//           clearInterval(monitoringInterval)
//           monitoringInterval = null
//         }

//         isMonitoring = false
//         isLoggedIn = false
//         currentFrame = null

//         // Try to re-login and restart monitoring
//         try {
//           await loginToAvaility()
//         } catch (loginError) {
//           console.error("Failed to recover after frame detachment:", loginError)

//           // Send notification about the error
//           try {
//             // await sendEmail(
//             //   "Availity Bot Recovery",
//             //   `The Availity monitoring bot needs to briefly restart ${new Date().toLocaleString()}.\n\n` +
//             //     `You can just ignore: ${loginError}\n\n` +
//             //     `The application will restart and continue monitoring.\n\n` +
//             //     `This is an automated message from the monitoring system.`,
//             // )
//           } catch (emailError) {
//             console.error("Failed to send error notification email:", emailError)
//           }
//         }
//       } else if (error instanceof Error && error.message.includes("Request is already handled")) {
//         // This is a common error that can be safely ignored
//         console.log("Request is already handled error, continuing monitoring")
//         requestAlreadyHandledErrors++
//       }
//     }
//   }, MONITORING_INTERVAL_MS) // Check every 10 seconds

//   console.log(`Monitoring interval set up for every ${MONITORING_INTERVAL_MS / 1000} seconds`)
// }

// // Helper function to find new members by comparing two arrays
// function findNewMembers(oldMembers: MemberData[], newMembers: MemberData[]): MemberData[] {
//   return newMembers.filter(
//     (newMember) =>
//       !oldMembers.some(
//         (oldMember) => oldMember.memberID === newMember.memberID && oldMember.memberName === newMember.memberName,
//       ),
//   )
// }

// // Process new members that were found
// // async function processNewMembers(members: MemberData[]): Promise<void> {
// //   console.log("Processing new members...")
// //   try {
// //     // We'll use the database to check which members have already been notified about
// //     const unnotifiedMembers = []

// //     for (const member of members) {
// //       // Check if this referral has already been notified about
// //       const existingReferral = await Referral.findOne({
// //         memberID: member.memberID,
// //         memberName: member.memberName,
// //         isNotified: true,
// //       })

// //       if (!existingReferral) {
// //         unnotifiedMembers.push(member)
// //       }
// //     }

// //     if (unnotifiedMembers.length === 0) {
// //       console.log("All new members have already been notified about, skipping notifications")
// //       return
// //     }

// //     // Save to database
// //     await saveMembersToDatabase(unnotifiedMembers)

// //     // Send email notification
// //     let emailContent = "New Referrals Detected:\n\n"

// //     unnotifiedMembers.forEach((member, index) => {
// //       emailContent += `Member ${index + 1}:\n`
// //       emailContent += `Name: ${member.memberName}\n`
// //       emailContent += `ID: ${member.memberID}\n`

// //       if (member.serviceName) {
// //         emailContent += `Service: ${member.serviceName}\n`
// //       }

// //       if (member.status) {
// //         emailContent += `Status: ${member.status}\n`
// //       }

// //       if (member.county) {
// //         emailContent += `County: ${member.county}\n`
// //       }

// //       if (member.requestDate) {
// //         emailContent += `Request Date: ${member.requestDate}\n`
// //       }

// //       emailContent += "\n"
// //     })

// //     await sendEmail("New Availity Referrals Detected", emailContent)
// //     console.log("Email notification sent for new members")

// //     // Send SMS for each new member
// //     for (const member of unnotifiedMembers) {
// //       await sendSMS(`New referral detected: ${member.memberName} (${member.memberID}). Check dashboard for details.`)
// //     }
// //     console.log("SMS notifications sent for new members")
// //   } catch (error) {
// //     console.error("Error processing new members:", error)
// //     // Continue even if notification fails
// //   }
// // }

// // Update the checkForNewReferrals function to use safeDbOperation
// export async function checkForNewReferrals(): Promise<void> {
//   // Create a unique request ID for this API check
//   const requestId = `api-check-${Date.now()}`

//   // Check if this request is already in progress
//   if (pendingRequests.has(requestId)) {
//     console.log(`API check request ${requestId} is already in progress, skipping`)
//     return
//   }

//   // Add this request to pending requests
//   pendingRequests.add(requestId)

//   console.log("Starting API-based check for new referrals...")
//   try {
//     // Check if browser needs to be restarted
//     await checkBrowserHealth()

//     // Only login if we're not already logged in
//     if (!isLoggedIn || !currentFrame) {
//       console.log("Not logged in, initiating login process...")
//       const loginSuccess = await loginToAvaility()
//       if (!loginSuccess) {
//         throw new Error("Failed to login to Availity")
//       }
//     } else {
//       console.log("Already logged in, skipping login process")
//     }

//     // Get session cookies
//     const cookies = await getSessionCookies()

//     // Extract XSRF token
//     const xsrfToken = extractXsrfToken(cookies)

//     // Make API request to fetch referrals
//     console.log("Making API request to fetch referrals...")
//     try {
//       const response = await axios.post<ReferralResponse>(
//         REFERRALS_API_URL,
//         {
//           brand: "WLP",
//           npi: "1184328189",
//           papi: "",
//           state: "TN",
//           tabStatus: "INCOMING",
//           taxId: "922753606",
//         },
//         {
//           headers: {
//             Cookie: cookies,
//             "Content-Type": "application/json",
//             "X-XSRF-TOKEN": xsrfToken,
//             "User-Agent":
//               "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36",
//             Referer: "https://apps.availity.com/public/apps/care-central/",
//           },
//         },
//       )

//       const currentTime = new Date()
//       console.log(`Retrieved ${response.data.referrals.length} referrals from API`)

//       // Process each referral from the API
//       for (const referral of response.data.referrals) {
//         // Check if referral already exists in database using safeDbOperation
//         const existingReferral = await safeDbOperation(
//           () =>
//             Referral.findOne({
//               memberID: referral.memberID,
//               requestOn: referral.requestOn,
//             }),
//           null,
//         )

//         if (!existingReferral) {
//           // Save the new referral using safeDbOperation
//           const savedReferral = await safeDbOperation(
//             () =>
//               Referral.create({
//                 ...referral,
//                 isNotified: true, // Mark as notified immediately when creating
//               }),
//             null,
//           )

//           if (savedReferral) {
//             // Create notification using safeDbOperation
//             await safeDbOperation(
//               () =>
//                 Notification.create({
//                   referralId: savedReferral._id,
//                   memberName: referral.memberName,
//                   memberID: referral.memberID,
//                   message: `New referral for ${referral.memberName} (${referral.serviceName}) received on ${referral.requestOn}`,
//                 }),
//               null,
//             )

//             // Send email notification
//             await sendEmail(
//               "New Referral Notification",
//               `New referral received for ${referral.memberName} (ID: ${referral.memberID}).\n\n` +
//                 `Service: ${referral.serviceName}\n` +
//                 `Region: ${referral.regionName}\n` +
//                 `County: ${referral.county}\n` +
//                 `Plan: ${referral.plan}\n` +
//                 `Preferred Start Date: ${referral.preferredStartDate}\n` +
//                 `Status: ${referral.status}`,
//             )

//             // Send SMS notification
//             await sendSMS(
//               `New referral: ${referral.memberName} (${referral.memberID}) for ${referral.serviceName}. Check dashboard for details.`,
//             )
//           }
//         }
//       }

//       // Update last check time
//       lastCheckTime = currentTime
//     } catch (axiosError) {
//       if (axios.isAxiosError(axiosError)) {
//         const error = axiosError as AxiosError

//         // Check for rate limiting (503 Service Unavailable)
//         if (error.response && error.response.status === 503) {
//           console.log("API rate limit exceeded. Will retry after delay.")

//           // Get retry delay from header if available
//           const retryDelay = error.response?.headers?.["x-availity-api-retry-delay-sec"]
//           const delayMs = retryDelay ? Number.parseInt(retryDelay as string) * 1000 : API_RETRY_DELAY_MS

//           console.log(`Waiting ${delayMs / 1000} seconds before retrying...`)

//           // Don't throw, just log and continue
//           return
//         }

//         // Check for authentication errors
//         if (error.response && (error.response.status === 401 || error.response.status === 403)) {
//           console.log("Authentication error. Clearing session and will re-login on next check.")

//           // Clear browser session
//           await closeBrowser()
//           browser = null
//           page = null
//           isLoggedIn = false
//           currentFrame = null
//         }

//         throw error
//       }
//       throw axiosError
//     }
//   } catch (error) {
//     console.error("Error checking for new referrals:", error)
//     // No error email - just log the error
//   } finally {
//     // Always remove the request from pending requests
//     pendingRequests.delete(requestId)
//   }
// }

// function extractXsrfToken(cookies: string): string {
//   const match = cookies.match(/XSRF-TOKEN=([^;]+)/)
//   return match ? match[1] : ""
// }

// // Function to start the monitoring process
// export async function startReferralMonitoring(): Promise<void> {
//   console.log("🚀 Starting referral monitoring process with 30-second interval...")
//   console.log(`⏰ Current time: ${new Date().toISOString()}`)

//   // Initial check
//   try {
//     console.log("📊 Performing initial referral check (#0)...")
//     await checkForNewReferrals()
//     console.log(`✅ Initial check completed successfully at ${new Date().toISOString()}`)
//   } catch (error) {
//     console.error("❌ Error in initial referral check:", error)
//     // Retry on error
//     try {
//       console.log("🔄 Retrying initial check after error...")
//       await closeBrowser()
//       await delay(5000)
//       await checkForNewReferrals()
//       console.log("✅ Retry successful")
//     } catch (retryError) {
//       console.error("❌ Retry failed:", retryError)
//       // No error email - just log the error
//     }
//   }

//   // Set up interval for API-based checks every 30 seconds
//   console.log(`⏱️ Setting up scheduled checks every 30 seconds...`)

//   // Use a named function for the interval callback for better debugging
//   const performScheduledCheck = async () => {
//     const startTime = new Date()
//     console.log(`⏳ Running scheduled API check at ${startTime.toISOString()}...`)

//     try {
//       await checkForNewReferrals()
//       const endTime = new Date()
//       const duration = (endTime.getTime() - startTime.getTime()) / 1000
//       console.log(`✅ Scheduled check completed successfully in ${duration.toFixed(2)} seconds`)
//     } catch (error) {
//       console.error(`❌ Error in scheduled API check:`, error)

//       // Retry on error
//       try {
//         console.log(`🔄 Retrying scheduled check after error...`)
//         await closeBrowser()
//         await delay(5000)
//         await checkForNewReferrals()
//         console.log(`✅ Retry successful`)
//       } catch (retryError) {
//         console.error(`❌ Scheduled check retry failed:`, retryError)
//         // No error email - just log the error
//       }
//     }

//     // Log next scheduled check time
//     const nextCheckTime = new Date(Date.now() + MONITORING_INTERVAL_MS)
//     console.log(`🔔 Next check scheduled for ${nextCheckTime.toISOString()}`)
//   }

//   // Use setInterval with the exact millisecond value (30000 ms = 30 seconds)
//   const intervalId = setInterval(performScheduledCheck, MONITORING_INTERVAL_MS)

//   console.log(`🔔 Monitoring setup complete - checking every 30 seconds`)
//   console.log(`⏰ Next check scheduled for ${new Date(Date.now() + MONITORING_INTERVAL_MS).toISOString()}`)

//   // Add a function to stop monitoring if needed
//   process.on("SIGINT", () => {
//     console.log("🛑 Stopping monitoring due to application shutdown...")
//     clearInterval(intervalId)
//     closeBrowser().then(() => {
//       console.log("✅ Monitoring stopped and browser closed successfully")
//       process.exit(0)
//     })
//   })
// }

// // Stop monitoring when needed
// export function stopReferralMonitoring(): void {
//   if (monitoringInterval) {
//     clearInterval(monitoringInterval)
//     monitoringInterval = null
//     console.log("Referral monitoring stopped")
//   }
//   isMonitoring = false
// }

// // Add a watchdog timer that restarts the browser if it detects issues
// export function setupWatchdog(): void {
//   const WATCHDOG_INTERVAL_MS = 300000 // 5 minutes
//   const MAX_INACTIVITY_MS = 600000 // 10 minutes

//   let watchdogInterval: NodeJS.Timeout | null = null
//   let lastSuccessfulOperation = new Date()
//   let consecutiveErrors = 0

//   // Clear any existing watchdog interval
//   if (watchdogInterval) {
//     clearInterval(watchdogInterval)
//   }

//   watchdogInterval = setInterval(async () => {
//     try {
//       console.log("Watchdog check running...")

//       // Check if there have been too many consecutive errors
//       if (consecutiveErrors >= 5) {
//         console.log(`Too many consecutive errors (${consecutiveErrors}), forcing restart...`)
//         await forceRestart()
//         return
//       }

//       // Check if the bot has been inactive for too long
//       const now = new Date()
//       const inactivityTime = now.getTime() - lastSuccessfulOperation.getTime()

//       if (inactivityTime > MAX_INACTIVITY_MS) {
//         console.log(`Bot has been inactive for ${inactivityTime / 1000} seconds, forcing restart...`)
//         await forceRestart()
//         return
//       }

//       // Check if browser is still responsive
//       if (browser && page) {
//         try {
//           // Try a simple operation to see if the browser is responsive
//           await page.evaluate(() => document.title)
//           console.log("Browser is responsive")
//           lastSuccessfulOperation = new Date()
//           consecutiveErrors = 0
//         } catch (error) {
//           console.log("Browser appears to be unresponsive, restarting...")
//           consecutiveErrors++
//           await forceRestart()
//           return
//         }
//       } else if (!browser || !page) {
//         console.log("Browser or page is null, restarting...")
//         consecutiveErrors++
//         await forceRestart()
//         return
//       }

//       // Check if the frame is still valid
//       if (currentFrame) {
//         try {
//           await currentFrame.evaluate(() => document.title)
//           console.log("Frame is responsive")
//           lastSuccessfulOperation = new Date()
//         } catch (error) {
//           console.log("Frame is no longer valid, restarting...")
//           consecutiveErrors++
//           await forceRestart()
//           return
//         }
//       }

//       // Check for too many "Request is already handled" errors
//       if (requestAlreadyHandledErrors > MAX_REQUEST_ALREADY_HANDLED_ERRORS) {
//         console.log(`Too many "Request is already handled" errors (${requestAlreadyHandledErrors}), forcing restart...`)
//         requestAlreadyHandledErrors = 0
//         await forceRestart()
//         return
//       }

//       console.log("Watchdog check completed successfully")
//     } catch (error) {
//       console.error("Error in watchdog:", error)
//       consecutiveErrors++
//       // If the watchdog itself errors, try to restart
//       try {
//         await forceRestart()
//       } catch (restartError) {
//         console.error("Failed to restart after watchdog error:", restartError)
//       }
//     }
//   }, WATCHDOG_INTERVAL_MS)

//   console.log(`Watchdog timer set up to check every ${WATCHDOG_INTERVAL_MS / 1000} seconds`)
// }

// export async function sendStillAliveNotification(): Promise<void> {
//   try {
//     const uptime = process.uptime()
//     const uptimeHours = Math.floor(uptime / 3600)
//     const uptimeMinutes = Math.floor((uptime % 3600) / 60)

//     // Get the current time to determine which status email this is
//     const now = new Date()
//     const hour = now.getHours()
//     let timeOfDay = "Status Update"

//     if (hour >= 0 && hour < 6) {
//       timeOfDay = "Midnight Status"
//     } else if (hour >= 6 && hour < 12) {
//       timeOfDay = "Morning Status"
//     } else if (hour >= 12 && hour < 18) {
//       timeOfDay = "Afternoon Status"
//     } else {
//       timeOfDay = "Evening Status"
//     }

//     // Check if we've already sent this type of status today
//     const statusType = timeOfDay.toLowerCase().split(" ")[0] // "morning", "afternoon", etc.
//     const today = now.toISOString().split("T")[0] // YYYY-MM-DD format

//     const existingStatus = await StatusLog.findOne({ type: statusType, date: today })

//     if (existingStatus) {
//       console.log(`Already sent ${statusType} status today at ${existingStatus.sentAt.toLocaleString()}, skipping`)
//       return
//     }

//     const message =
//       `Hi, just wanted to let you know I'm still active, up and running!\n\n` +
//       `Current time: ${new Date().toLocaleString()}\n` +
//       `Bot version: ${BOT_VERSION}\n\n` +
//       `Current status:\n` +
//       `- Browser initialized: ${browser !== null}\n` +
//       `- Logged in: ${isLoggedIn}\n` +
//       `- Monitoring active: ${isMonitoring}\n` +
//       `- Members being monitored: ${currentMembers.length}\n\n` +
//       `This is an automated status update from your Availity monitoring bot.`

//     await sendEmail(`Availity Bot ${timeOfDay}`, message)
//     console.log(`Sent '${timeOfDay}' notification email`)

//     // Log this status in the database
//     await StatusLog.create({
//       type: statusType,
//       sentAt: now,
//       date: today,
//     })
//   } catch (error) {
//     console.error("Failed to send 'still alive' notification:", error)
//   }
// }


// import puppeteer, { type Browser, type Page, type Frame } from "puppeteer"
// import axios, { type AxiosError } from "axios"
// import { authenticator } from "otplib"
// import { config } from "dotenv"
// import { sendEmail } from "./email"
// import { sendSMS } from "./sms"
// import { Referral } from "../models/referrals"
// import { Notification } from "../models/notification"

// export const BOT_VERSION = "1.0.0"

// config()

// // Global variables
// let browser: Browser | null = null
// let page: Page | null = null
// let lastCheckTime = new Date()
// let monitoringInterval: NodeJS.Timeout | null = null
// let isMonitoring = false
// let currentMembers: MemberData[] = []
// let isLoggedIn = false
// let currentFrame: Frame | null = null
// const pendingRequests = new Set<string>() // Track pending requests to prevent duplicates
// const notifiedMemberIds = new Set<string>() // Track which members we've already notified about
// let lastRestartTime = new Date() // Track when we last restarted the browser
// const requestQueue: Map<string, boolean> = new Map() // Queue to track operations
// let requestAlreadyHandledErrors = 0 // Counter for "Request is already handled" errors
// const MAX_REQUEST_ALREADY_HANDLED_ERRORS = 20 // Threshold for restart

// // Constants
// const AVAILITY_URL = "https://apps.availity.com"
// const LOGIN_URL = "https://apps.availity.com/availity/web/public.elegant.login"
// const REFERRALS_API_URL = "https://apps.availity.com/api/v1/proxy/anthem/provconn/v1/carecentral/ltss/referral/details"
// const TOTP_SECRET = process.env.TOTP_SECRET || "RU4SZCAW4UESMUQNCG3MXTWKXA"
// const MONITORING_INTERVAL_MS = 10000 // 10 seconds (changed from 30000)
// const API_RETRY_DELAY_MS = 60000 // 60 seconds (based on Availity's retry header)
// const MAX_RETRIES = 5 // Maximum number of retries for operations
// const BROWSER_RESTART_INTERVAL_MS = 3600000 // 1 hour - restart browser periodically to prevent memory leaks

// // Interfaces
// interface ReferralResponse {
//   effectiveDate: string
//   referrals: Array<{
//     memberName: string
//     memberID: string
//     serviceName: string
//     regionName: string
//     county: string
//     plan: string
//     preferredStartDate: string
//     status: string
//     requestOn: string
//   }>
// }

// // Member interface for data extracted from the page
// export interface MemberData {
//   memberName: string
//   memberID: string
//   serviceName?: string
//   status?: string
//   county?: string
//   requestDate?: string
//   additionalInfo?: string
// }

// // Helper function for timeouts - reduced delay times
// async function delay(ms: number): Promise<void> {
//   return new Promise((resolve) => setTimeout(resolve, ms))
// }

// // Retry operation helper - reduced delay time
// async function retryOperation(operation: () => Promise<void>, retries = MAX_RETRIES, delayMs = 1000) {
//   for (let i = 0; i < retries; i++) {
//     try {
//       await operation()
//       return
//     } catch (error) {
//       console.log(`Attempt ${i + 1} failed:`, error)
//       if (i < retries - 1) {
//         console.log(`Retrying in ${delayMs}ms...`)
//         await delay(delayMs)
//       } else {
//         throw error
//       }
//     }
//   }
// }

// // Helper function to temporarily disable request interception
// async function withoutInterception<T>(page: Page, fn: () => Promise<T>): Promise<T> {
//   // Check if interception is enabled before trying to disable it
//   let wasEnabled = false

//   try {
//     // Check if interception is enabled using a safe method
//     wasEnabled = await page
//       .evaluate(() => {
//         // @ts-ignore - accessing internal property for checking
//         return !!window["_puppeteer"]?.network?._requestInterceptionEnabled
//       })
//       .catch(() => false)
//   } catch (error) {
//     console.log("Error checking interception status:", error)
//     wasEnabled = false
//   }

//   // Only disable if it was enabled
//   if (wasEnabled) {
//     try {
//       await page.setRequestInterception(false)
//       console.log("Request interception disabled temporarily")
//     } catch (error) {
//       console.error("Error disabling request interception:", error)
//       // Continue anyway
//     }
//   }

//   try {
//     // Run the function
//     return await fn()
//   } finally {
//     // Re-enable interception only if it was enabled before
//     if (wasEnabled) {
//       try {
//         await page.setRequestInterception(true)
//         console.log("Request interception re-enabled")
//       } catch (error) {
//         console.error("Error re-enabling request interception:", error)
//       }
//     }
//   }
// }

// // Safe wrapper for any puppeteer operation to handle "Request is already handled" errors
// async function safeOperation<T>(operation: () => Promise<T>, defaultValue: T): Promise<T> {
//   const operationId = `op-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`

//   // Check if we're already processing too many operations
//   if (requestQueue.size > 50) {
//     // Wait a bit if the queue is getting too large
//     await delay(100)
//   }

//   // Add to queue
//   requestQueue.set(operationId, true)

//   try {
//     return await operation()
//   } catch (error) {
//     if (error instanceof Error && error.message.includes("Request is already handled")) {
//       console.log("Ignoring 'Request is already handled' error in operation")
//       requestAlreadyHandledErrors++
//       return defaultValue
//     }
//     throw error
//   } finally {
//     // Remove from queue
//     requestQueue.delete(operationId)
//   }
// }

// export async function getSessionCookies(): Promise<string> {
//   if (!page) {
//     throw new Error("Page not initialized")
//   }

//   try {
//     const cookies = await page.cookies()
//     return cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join("; ")
//   } catch (error) {
//     console.error("Error getting session cookies:", error)
//     return ""
//   }
// }

// export async function closeBrowser(): Promise<void> {
//   if (browser) {
//     try {
//       await browser.close()
//     } catch (error) {
//       console.error("Error closing browser:", error)
//     } finally {
//       browser = null
//       page = null
//       currentFrame = null
//       isLoggedIn = false
//       console.log("Browser closed successfully")
//     }
//   }
// }

// // Check if browser needs to be restarted periodically to prevent memory leaks
// async function checkBrowserHealth(): Promise<void> {
//   const now = new Date()
//   const timeSinceLastRestart = now.getTime() - lastRestartTime.getTime()

//   if (timeSinceLastRestart > BROWSER_RESTART_INTERVAL_MS) {
//     console.log("Performing scheduled browser restart to prevent memory leaks...")

//     // Save current state
//     const wasMonitoring = isMonitoring

//     // Stop monitoring
//     if (monitoringInterval) {
//       clearInterval(monitoringInterval)
//       monitoringInterval = null
//     }

//     isMonitoring = false
//     isLoggedIn = false

//     // Close and restart browser
//     await closeBrowser()
//     await setupBot()

//     // Restore monitoring if it was active
//     if (wasMonitoring) {
//       await loginToAvaility()
//     }

//     // Update restart time
//     lastRestartTime = new Date()
//     console.log("Scheduled browser restart completed successfully")
//   }

//   // Check for too many "Request is already handled" errors
//   if (requestAlreadyHandledErrors > MAX_REQUEST_ALREADY_HANDLED_ERRORS) {
//     console.log(`Too many "Request is already handled" errors (${requestAlreadyHandledErrors}), forcing restart...`)
//     requestAlreadyHandledErrors = 0
//     await forceRestart()
//   }
// }

// // Force restart of the browser and monitoring
// async function forceRestart(): Promise<void> {
//   console.log("Forcing restart of browser and monitoring...")

//   try {
//     // Save current monitoring state
//     const wasMonitoring = isMonitoring

//     // Stop monitoring
//     if (monitoringInterval) {
//       clearInterval(monitoringInterval)
//       monitoringInterval = null
//     }

//     isMonitoring = false
//     isLoggedIn = false
//     currentFrame = null

//     // Close browser
//     await closeBrowser()

//     // Reset error counter
//     requestAlreadyHandledErrors = 0

//     // Update restart time
//     lastRestartTime = new Date()

//     // Restart the bot
//     await setupBot()

//     // Try to log in again
//     try {
//       await loginToAvaility()
//       console.log("Successfully restarted and logged in")

//       // Monitoring will be resumed by loginToAvaility if wasMonitoring was true
//     } catch (loginError) {
//       console.error("Failed to log in after restart:", loginError)

//       // No error email - just log the error

//       // Try to resume monitoring after a delay if it was active before
//       if (wasMonitoring) {
//         setTimeout(async () => {
//           try {
//             await loginToAvaility()
//           } catch (retryError) {
//             console.error("Failed to login on retry after restart:", retryError)
//           }
//         }, 60000) // Wait 1 minute before retry
//       }
//     }
//   } catch (error) {
//     console.error("Error during forced restart:", error)
//     // No error email - just log the error
//   }
// }

// export async function setupBot(): Promise<void> {
//   try {
//     // If browser is already initialized, don't create a new one
//     if (browser && page) {
//       console.log("Browser already initialized, skipping setup")
//       return
//     }

//     // Close any existing browser instance to prevent resource leaks
//     await closeBrowser()

//     browser = await puppeteer.launch({
//       headless: true,
//       args: [
//         "--no-sandbox",
//         "--disable-setuid-sandbox",
//         "--disable-dev-shm-usage",
//         "--disable-accelerated-2d-canvas",
//         "--no-first-run",
//         "--no-zygote",
//         "--single-process",
//         "--disable-gpu",
//         "--disable-extensions",
//         "--disable-component-extensions-with-background-pages",
//         "--disable-default-apps",
//         "--mute-audio",
//         "--disable-background-timer-throttling",
//         "--disable-backgrounding-occluded-windows",
//         "--disable-renderer-backgrounding",
//         "--disable-background-networking",
//         "--disable-breakpad",
//         "--disable-sync",
//         "--disable-translate",
//         "--metrics-recording-only",
//         "--disable-hang-monitor",
//         "--disable-ipc-flooding-protection",
//         // Add these new options for better stability
//         "--disable-features=site-per-process",
//         "--disable-threaded-animation",
//         "--disable-threaded-scrolling",
//         "--disable-web-security",
//         "--memory-pressure-off",
//         // Reduce memory usage
//         "--js-flags=--max-old-space-size=512",
//       ],
//       defaultViewport: { width: 1024, height: 768 }, // Reduced from 1280x800
//       timeout: 60000, // Increased timeout
//     })

//     console.log("✅ Browser launched successfully")

//     // Create a new page
//     page = await browser.newPage()

//     // Set viewport size
//     await page.setViewport({ width: 1280, height: 800 })

//     // Add additional configurations
//     await page.setDefaultNavigationTimeout(50000)
//     await page.setDefaultTimeout(50000)

//     // Enable request interception to optimize performance - with better error handling
//     try {
//       await page.setRequestInterception(true)
//       console.log("Request interception enabled successfully")

//       page.on("request", (request) => {
//         // Use a more targeted approach to request interception
//         try {
//           if (request.isInterceptResolutionHandled()) {
//             return // Skip if already handled
//           }

//           const url = request.url()
//           const resourceType = request.resourceType()

//           // Only abort specific resource types or URLs
//           if (
//             resourceType === "image" ||
//             resourceType === "font" ||
//             resourceType === "media" ||
//             url.includes(".jpg") ||
//             url.includes(".png") ||
//             url.includes(".gif") ||
//             url.includes(".woff")
//           ) {
//             // For resources we want to block
//             request.abort()
//           } else {
//             // For resources we want to allow
//             request.continue()
//           }
//         } catch (error) {
//           // If request is already handled, just log and continue
//           if (error instanceof Error && error.message.includes("Request is already handled")) {
//             console.log("Request is already handled, ignoring")
//             requestAlreadyHandledErrors++
//           } else {
//             console.error("Error handling request:", error)
//             // Try to continue the request if possible
//             try {
//               if (!request.isInterceptResolutionHandled()) {
//                 request.continue()
//               }
//             } catch (continueError) {
//               // Just log, don't crash
//               console.error("Error continuing request:", continueError)
//             }
//           }
//         }
//       })
//     } catch (interceptError) {
//       console.error("Failed to enable request interception:", interceptError)
//       // Continue without interception
//     }

//     // Set up error handler for the page
//     page.on("error", (err) => {
//       console.error("Page error:", err)
//       // Don't crash the process, just log the error
//     })

//     // Update restart time
//     lastRestartTime = new Date()

//     console.log("✅ Bot setup completed")

//     // Set up the watchdog
//     setupWatchdog()
//   } catch (error) {
//     console.error("❌ Error setting up bot:", error)
//     throw error
//   }
// }

// async function handlePopups(page: Page): Promise<void> {
//   console.log("Checking for popups to dismiss...")
//   try {
//     const closeButtonSelectors = [
//       'button:has-text("×")',
//       "button.close",
//       'button[aria-label="Close"]',
//       ".modal-close",
//       ".dialog-close",
//       ".modal-header button",
//       'button:has-text("Close")',
//       'button:has-text("Cancel")',
//       'button:has-text("Dismiss")',
//     ]

//     for (const selector of closeButtonSelectors) {
//       try {
//         const closeButtons = await safeOperation(() => page.$$(selector), [])
//         for (const button of closeButtons) {
//           try {
//             const isVisible = await safeOperation(
//               () =>
//                 button.evaluate((el) => {
//                   const style = window.getComputedStyle(el)
//                   return style.display !== "none" && style.visibility !== "hidden" && style.opacity !== "0"
//                 }),
//               false,
//             )

//             if (isVisible) {
//               await safeOperation(() => button.click(), null)
//               await delay(300)
//             }
//           } catch (buttonError) {
//             // Continue to next button
//           }
//         }
//       } catch (error) {
//         // Continue to next selector
//       }
//     }

//     const modalSelectors = [".modal.show", ".dialog.show", '[role="dialog"]', '[aria-modal="true"]']

//     for (const selector of modalSelectors) {
//       try {
//         const modals = await safeOperation(() => page.$$(selector), [])
//         for (const modal of modals) {
//           try {
//             const closeButton = await safeOperation(
//               () => modal.$('button:has-text("×"), button.close, button[aria-label="Close"]'),
//               null,
//             )
//             if (closeButton) {
//               await safeOperation(() => closeButton.click(), null)
//               await delay(300)
//             }
//           } catch (modalError) {
//             // Continue to next modal
//           }
//         }
//       } catch (error) {
//         // Continue to next selector
//       }
//     }
//   } catch (error) {
//     console.error("❌ Error handling popups:", error)
//   }
// }

// export async function loginToAvaility(): Promise<boolean> {
//   // Create a unique request ID for this login attempt
//   const requestId = `login-${Date.now()}`

//   // Check if this request is already in progress
//   if (pendingRequests.has(requestId)) {
//     console.log(`Login request ${requestId} is already in progress, skipping`)
//     return false
//   }

//   // Add this request to pending requests
//   pendingRequests.add(requestId)

//   // Save current monitoring state
//   const wasMonitoring = isMonitoring

//   // Pause monitoring during login
//   if (monitoringInterval) {
//     console.log("Pausing monitoring during login process...")
//     clearInterval(monitoringInterval)
//     monitoringInterval = null
//     isMonitoring = false
//   }

//   console.log("Starting Availity login process...")

//   try {
//     // Check if browser needs to be restarted
//     await checkBrowserHealth()

//     // Check if we're already logged in and have a valid frame for monitoring
//     if (isLoggedIn && currentFrame) {
//       try {
//         // Verify the frame is still valid by executing a simple operation
//         await currentFrame.evaluate(() => document.title)
//         console.log("Already logged in and on referrals page, skipping login process")

//         // Resume monitoring if it was active before
//         if (wasMonitoring && !isMonitoring) {
//           console.log("Resuming monitoring after login check...")
//           await startContinuousMonitoring(currentFrame)
//         }

//         pendingRequests.delete(requestId)
//         return true
//       } catch (frameError) {
//         console.log("Current frame is no longer valid, will re-login")
//         isLoggedIn = false
//         currentFrame = null
//       }
//     }

//     if (!browser || !page) {
//       console.log("Browser or page not initialized. Setting up bot...")
//       await setupBot()
//     }

//     if (!page) {
//       throw new Error("Browser page not initialized")
//     }

//     console.log("Navigating to Availity login page...")
//     await withoutInterception(page!, async () => {
//       await page!.goto(LOGIN_URL, { waitUntil: "networkidle2" })
//     })

//     // Enter username and password
//     console.log("Entering credentials...")
//     await safeOperation(() => page!.type("#userId", process.env.AVAILITY_USERNAME || ""), null)
//     await safeOperation(() => page!.type("#password", process.env.AVAILITY_PASSWORD || ""), null)

//     // Click login button
//     await safeOperation(() => page!.click('button[type="submit"]'), null)

//     // Wait for either navigation to complete or for 2FA form to appear
//     try {
//       await Promise.race([
//         withoutInterception(page!, async () => {
//           await page!.waitForNavigation({ timeout: 50000 })
//         }),
//         safeOperation(() => page!.waitForSelector('form[name="backupCodeForm"]', { timeout: 50000 }), null),
//         safeOperation(() => page!.waitForSelector('form[name="authenticatorCodeForm"]', { timeout: 50000 }), null),
//         safeOperation(() => page!.waitForSelector(".top-applications", { timeout: 50000 }), null),
//       ])
//     } catch (navError) {
//       console.log("Navigation timeout or selector not found. Checking login status...")
//     }

//     // Check if we're logged in by looking for dashboard elements
//     const loginCheck = await safeOperation(
//       () =>
//         page!.evaluate(() => {
//           const dashboardElements =
//             document.querySelector(".top-applications") !== null ||
//             document.querySelector(".av-dashboard") !== null ||
//             document.querySelector(".dashboard-container") !== null

//           const cookieConsent = Array.from(document.querySelectorAll("h1, h2, h3, h4, h5, h6")).some((h) =>
//             h.textContent?.includes("Cookie Consent & Preferences"),
//           )

//           return dashboardElements || cookieConsent
//         }),
//       false,
//     )

//     // Check if we need to handle 2FA
//     console.log("Checking if 2FA authentication is required...")
//     const is2FARequired = await safeOperation(
//       () =>
//         page!.evaluate(() => {
//           return (
//             document.querySelector('form[name="backupCodeForm"]') !== null ||
//             document.querySelector('form[name="authenticatorCodeForm"]') !== null ||
//             document.querySelector('input[type="radio"][value*="authenticator"]') !== null ||
//             document.querySelector('input[type="radio"][value*="backup"]') !== null
//           )
//         }),
//       false,
//     )

//     if (is2FARequired) {
//       console.log("2FA authentication is required. Handling 2FA...")
//       await handle2FA(page!)
//       isLoggedIn = true
//     } else if (loginCheck) {
//       console.log("Already logged in - no 2FA required")
//       isLoggedIn = true
//     } else {
//       const currentUrl = page!.url()
//       console.log(`Current URL: ${currentUrl}`)

//       if (currentUrl.includes("login") || currentUrl.includes("authenticate")) {
//         throw new Error("Login failed - still on login page")
//       }
//     }

//     // Handle any cookie consent popup that might appear after login
//     await handleCookieConsent(page!)

//     // Handle any other popups that might appear
//     await handlePopups(page!)

//     // Navigate to Care Central
//     console.log("Proceeding to navigate to Care Central...")
//     await navigateToCareCentral(page!)

//     console.log("Login process completed successfully")

//     // Resume monitoring if it was active before
//     if (wasMonitoring && !isMonitoring && currentFrame) {
//       console.log("Resuming monitoring after successful login...")
//       await startContinuousMonitoring(currentFrame)
//     }

//     pendingRequests.delete(requestId)
//     return true
//   } catch (error) {
//     console.error("Error during login attempt:", error)
//     isLoggedIn = false
//     currentFrame = null

//     // Try to resume monitoring if it was active before, even after error
//     if (wasMonitoring && !isMonitoring) {
//       console.log("Attempting to resume monitoring after login failure...")
//       // Try again to login after a short delay
//       setTimeout(async () => {
//         try {
//           await loginToAvaility()
//         } catch (retryError) {
//           console.error("Failed to login on retry:", retryError)
//         }
//       }, 60000) // Wait 1 minute before retry
//     }

//     pendingRequests.delete(requestId)
//     throw error
//   }
// }

// async function handle2FA(page: Page): Promise<void> {
//   console.log("Starting 2FA authentication process...")
//   try {
//     // Wait for the 2FA options to be visible
//     await safeOperation(() => page.waitForSelector('input[type="radio"]', { visible: true, timeout: 40000 }), null)

//     let authenticatorOptionSelected = false

//     // Approach 1: Try direct selector for the authenticator app radio button
//     try {
//       const authenticatorRadioSelector =
//         'input[type="radio"][value*="authenticator"], input[type="radio"][id*="authenticator"], input[type="radio"][name*="authenticator"]'
//       const authenticatorRadio = await safeOperation(() => page.$(authenticatorRadioSelector), null)

//       if (authenticatorRadio) {
//         await safeOperation(() => authenticatorRadio.click(), null)
//         authenticatorOptionSelected = true
//       }
//     } catch (error) {
//       // Try next approach
//     }

//     // Approach 2: Try finding by label text if approach 1 failed
//     if (!authenticatorOptionSelected) {
//       try {
//         const labels = await safeOperation(() => page.$$("label"), [])
//         for (const label of labels) {
//           try {
//             const text = await safeOperation(() => label.evaluate((el) => el.textContent), null)
//             if (text && text.toLowerCase().includes("authenticator app")) {
//               await safeOperation(() => label.click(), null)
//               authenticatorOptionSelected = true
//               break
//             }
//           } catch (labelError) {
//             // Continue to next label
//           }
//         }
//       } catch (error) {
//         // Try next approach
//       }
//     }

//     // Approach 3: Try selecting the first radio button (assuming it's the authenticator app option)
//     if (!authenticatorOptionSelected) {
//       try {
//         const radioButtons = await safeOperation(() => page.$$('input[type="radio"]'), [])
//         if (radioButtons.length >= 1) {
//           await safeOperation(() => radioButtons[0].click(), null)
//           authenticatorOptionSelected = true
//         }
//       } catch (error) {
//         // Failed all approaches
//       }
//     }

//     if (!authenticatorOptionSelected) {
//       throw new Error("Could not select authenticator app option using any method")
//     }

//     // Click the Continue button
//     const continueButton = await safeOperation(() => page.$('button[type="submit"]'), null)
//     if (!continueButton) {
//       throw new Error("Continue button not found")
//     }
//     await safeOperation(() => continueButton.click(), null)

//     // Wait for the OTP input form to load
//     await safeOperation(
//       () =>
//         page.waitForSelector('input[name="code"], input[name="authenticatorCode"], input[type="text"]', {
//           visible: true,
//           timeout: 40000,
//         }),
//       null,
//     )

//     // Generate the TOTP code
//     const totpCode = authenticator.generate(TOTP_SECRET)
//     console.log("Generated TOTP code")

//     // Enter the TOTP code
//     const codeInputSelectors = ['input[name="code"]', 'input[name="authenticatorCode"]', 'input[type="text"]']

//     let codeEntered = false

//     for (const selector of codeInputSelectors) {
//       try {
//         const codeInput = await safeOperation(() => page.$(selector), null)
//         if (codeInput) {
//           await safeOperation(() => codeInput.type(totpCode), null)
//           codeEntered = true
//           break
//         }
//       } catch (error) {
//         // Try next selector
//       }
//     }

//     if (!codeEntered) {
//       throw new Error("Could not enter TOTP code")
//     }

//     // Click submit button
//     const submitButtonSelectors = [
//       'button[type="submit"]',
//       'button:has-text("Continue")',
//       'button:has-text("Submit")',
//       'button:has-text("Verify")',
//       "button.btn-primary",
//     ]

//     let submitButtonClicked = false

//     for (const selector of submitButtonSelectors) {
//       try {
//         const submitButton = await safeOperation(() => page.$(selector), null)
//         if (submitButton) {
//           await Promise.all([
//             safeOperation(() => submitButton.click(), null),
//             page.waitForNavigation({ waitUntil: "networkidle2", timeout: 40000 }).catch((err) => {
//               console.log("Navigation timeout after submitting code, but this might be expected")
//             }),
//           ])
//           submitButtonClicked = true
//           break
//         }
//       } catch (error) {
//         // Try next selector
//       }
//     }

//     if (!submitButtonClicked) {
//       throw new Error("Could not find or click submit button")
//     }

//     // Wait for post-2FA page to load
//     try {
//       await Promise.race([
//         safeOperation(
//           () =>
//             page.waitForSelector(".top-applications, .av-dashboard, .dashboard-container", {
//               timeout: 50000,
//               visible: true,
//             }),
//           null,
//         ),
//         safeOperation(
//           () =>
//             page.waitForFunction(
//               () => {
//                 const headings = Array.from(document.querySelectorAll("h1, h2, h3, h4, h5, h6"))
//                 return headings.some((h) => h.textContent?.includes("Cookie Consent & Preferences"))
//               },
//               { timeout: 50000 },
//             ),
//           null,
//         ),
//         safeOperation(
//           () =>
//             page.waitForSelector(".alert-danger, .error-message", {
//               timeout: 50000,
//               visible: true,
//             }),
//           null,
//         ),
//       ])

//       const errorMessage = await safeOperation(() => page.$(".alert-danger, .error-message"), null)
//       if (errorMessage) {
//         const text = await safeOperation(() => page.evaluate((el) => el.textContent, errorMessage), "")
//         throw new Error(`2FA resulted in error: ${text}`)
//       }

//       await delay(3000)
//     } catch (error) {
//       // Navigation timeout after 2FA, but this might be expected
//     }

//     const isLoggedInCheck = await safeOperation(
//       () =>
//         page.evaluate(() => {
//           const dashboardElements =
//             document.querySelector(".top-applications") !== null ||
//             document.querySelector(".av-dashboard") !== null ||
//             document.querySelector(".dashboard-container") !== null

//           const cookieConsent = Array.from(document.querySelectorAll("h1, h2, h3, h4, h5, h6")).some((h) =>
//             h.textContent?.includes("Cookie Consent & Preferences"),
//           )

//           return dashboardElements || cookieConsent
//         }),
//       false,
//     )

//     if (!isLoggedInCheck) {
//       throw new Error("2FA verification failed - no dashboard elements found")
//     }

//     console.log("2FA authentication successful")
//   } catch (error) {
//     console.error("Error handling 2FA:", error)
//     throw error
//   }
// }

// async function handleCookieConsent(page: Page): Promise<void> {
//   console.log("Checking for cookie consent popup...")
//   try {
//     await safeOperation(
//       () =>
//         page
//           .waitForFunction(
//             () => {
//               const heading = Array.from(document.querySelectorAll("h1, h2, h3, h4, h5, h6")).find((el) =>
//                 el.textContent?.includes("Cookie Consent & Preferences"),
//               )
//               const acceptButton = document.querySelector(
//                 'button.primary-button, button:has-text("Accept All Cookies")',
//               )
//               return heading && acceptButton
//             },
//             { timeout: 3000 },
//           )
//           .catch(() => {
//             // No cookie consent popup found within timeout
//           }),
//       null,
//     )

//     let accepted = false

//     try {
//       const acceptButtonSelector = 'button.primary-button, button:has-text("Accept All Cookies")'
//       const acceptButton = await safeOperation(() => page.$(acceptButtonSelector), null)
//       if (acceptButton) {
//         await safeOperation(() => acceptButton.click(), null)
//         await delay(500)
//         accepted = true
//       }
//     } catch (error) {
//       // Try next approach
//     }

//     if (!accepted) {
//       try {
//         accepted = await safeOperation(
//           () =>
//             page.evaluate(() => {
//               const buttons = Array.from(document.querySelectorAll("button"))
//               const acceptButton = buttons.find((button) =>
//                 button.textContent?.toLowerCase().includes("accept all cookies"),
//               )
//               if (acceptButton) {
//                 acceptButton.click()
//                 return true
//               }
//               return false
//             }),
//           false,
//         )
//         if (accepted) {
//           await delay(500)
//         }
//       } catch (error) {
//         // Try next approach
//       }
//     }

//     if (!accepted) {
//       try {
//         await safeOperation(() => page.mouse.click(636, 636), null)
//         await delay(500)
//       } catch (error) {
//         // Failed all approaches
//       }
//     }

//     console.log("Cookie consent handled")
//   } catch (error) {
//     // Ignore cookie consent errors
//   }
// }

// async function navigateToCareCentral(page: Page): Promise<void> {
//   console.log("Navigating to Care Central...")
//   try {
//     // Wait for the dashboard to load
//     await safeOperation(() => page.waitForSelector("body", { timeout: 50000, visible: true }), null)

//     // Wait for a bit to ensure the page is fully loaded  { timeout: 50000, visible: true }), null)

//     // Wait for a bit to ensure the page is fully loaded
//     await delay(1000)

//     // Look for "My Top Applications" heading first
//     const myTopAppsHeadingSelectors = [
//       'h1:has-text("My Top Applications")',
//       'h2:has-text("My Top Applications")',
//       'h3:has-text("My Top Applications")',
//       'h4:has-text("My Top Applications")',
//       'div:has-text("My Top Applications")',
//       'span:has-text("My Top Applications")',
//     ]

//     let myTopAppsHeading = null
//     for (const selector of myTopAppsHeadingSelectors) {
//       try {
//         myTopAppsHeading = await safeOperation(() => page.$(selector), null)
//         if (myTopAppsHeading) {
//           break
//         }
//       } catch (error) {
//         // Try next selector
//       }
//     }

//     // Now try to find Care Central by searching for all elements containing that text
//     const careCentralElements = await safeOperation(
//       () =>
//         page.evaluate(() => {
//           const allElements = Array.from(document.querySelectorAll("*"))
//           return allElements
//             .filter((el) => {
//               const text = el.textContent || ""
//               return text.includes("Care Central") && !text.includes("Care Central.")
//             })
//             .map((el) => {
//               const rect = el.getBoundingClientRect()
//               return {
//                 x: rect.x + rect.width / 2,
//                 y: rect.y + rect.height / 2,
//                 width: rect.width,
//                 height: rect.height,
//                 text: el.textContent,
//                 tagName: el.tagName,
//                 id: el.id,
//               }
//             })
//         }),
//       [],
//     )

//     // Try to click the most likely element (filter for reasonable size and position)
//     let clicked = false
//     for (const element of careCentralElements) {
//       // Look for elements that are likely to be clickable tiles (reasonable size)
//       if (element.width > 50 && element.height > 50) {
//         try {
//           await safeOperation(() => page.mouse.click(element.x, element.y), null)
//           clicked = true

//           // Wait a bit to see if navigation happens
//           await delay(4000)

//           // Check if we've navigated away from the dashboard
//           const currentUrl = page.url()

//           if (currentUrl.includes("care-central") || !currentUrl.includes("dashboard")) {
//             break
//           } else {
//             clicked = false
//           }
//         } catch (error) {
//           // Try next element
//         }
//       }
//     }

//     // If we still haven't clicked successfully, try a different approach
//     if (!clicked) {
//       // Try to find the Wellpoint image
//       const wellpointImages = await safeOperation(
//         () =>
//           page.evaluate(() => {
//             const images = Array.from(document.querySelectorAll("img"))
//             return images
//               .filter((img) => {
//                 const src = img.src || ""
//                 const alt = img.alt || ""
//                 return (
//                   src.includes("wellpoint") ||
//                   alt.includes("Wellpoint") ||
//                   src.includes("Wellpoint") ||
//                   alt.includes("wellpoint")
//                 )
//               })
//               .map((img) => {
//                 const rect = img.getBoundingClientRect()
//                 return {
//                   x: rect.x + rect.width / 2,
//                   y: rect.y + rect.height / 2,
//                   width: rect.width,
//                   height: rect.height,
//                   src: img.src,
//                   alt: img.alt,
//                 }
//               })
//           }),
//         [],
//       )

//       // Try clicking on a Wellpoint image
//       for (const img of wellpointImages) {
//         try {
//           await safeOperation(() => page.mouse.click(img.x, img.y), null)
//           clicked = true
//           await delay(4000)
//           break
//         } catch (error) {
//           // Try next image
//         }
//       }
//     }

//     // Last resort - try clicking at fixed coordinates where Care Central is likely to be
//     if (!clicked) {
//       // Try a few different positions where Care Central might be
//       const potentialPositions = [
//         { x: 240, y: 400 },
//         { x: 240, y: 430 },
//         { x: 270, y: 400 },
//         { x: 200, y: 400 },
//       ]

//       for (const pos of potentialPositions) {
//         try {
//           await safeOperation(() => page.mouse.click(pos.x, pos.y), null)
//           await delay(4000)

//           // Check if we've navigated away
//           const currentUrl = page.url()
//           if (currentUrl.includes("care-central") || !currentUrl.includes("dashboard")) {
//             clicked = true
//             break
//           }
//         } catch (error) {
//           // Try next position
//         }
//       }
//     }

//     if (!clicked) {
//       throw new Error("Failed to click on Care Central after trying multiple approaches")
//     }

//     // Wait for the iframe to load
//     await safeOperation(() => page.waitForSelector("#newBodyFrame", { timeout: 40000 }), null)

//     // Get all frames and find the one with name="newBody"
//     const frames = page.frames()
//     const newBodyFrame = frames.find((frame) => frame.name() === "newBody")

//     if (!newBodyFrame) {
//       throw new Error("Could not find newBody iframe")
//     }

//     // Wait for the form to load in the iframe
//     await safeOperation(() => newBodyFrame.waitForSelector("form", { timeout: 40000 }), null)

//     // Wait for the organization dropdown to be present in the iframe
//     await safeOperation(() => newBodyFrame.waitForSelector("#organizations", { timeout: 40000 }), null)

//     // Click on the organization dropdown
//     await safeOperation(() => newBodyFrame.click("#organizations"), null)
//     await delay(500)

//     // Type the organization name
//     await safeOperation(() => newBodyFrame.click("#organizations"), null)
//     await delay(500)

//     // Wait for and click the option
//     await safeOperation(() => newBodyFrame.waitForSelector(".av-select", { visible: true, timeout: 30000 }), null)
//     await safeOperation(() => newBodyFrame.click(".av-select"), null)

//     // Look specifically for Harmony Health LLC option
//     const harmonyOption = await safeOperation(
//       () =>
//         newBodyFrame.evaluate(() => {
//           const options = Array.from(document.querySelectorAll(".av__option"))
//           const harmonyOption = options.find(
//             (option) => option.textContent && option.textContent.includes("Harmony Health LLC"),
//           )
//           return harmonyOption ? true : false
//         }),
//       false,
//     )

//     if (harmonyOption) {
//       // Click on the Harmony Health LLC option
//       await safeOperation(
//         () =>
//           newBodyFrame.evaluate(() => {
//             const options = Array.from(document.querySelectorAll(".av__option"))
//             const harmonyOption = options.find(
//               (option) => option.textContent && option.textContent.includes("Harmony Health LLC"),
//             )
//             if (harmonyOption) {
//               ;(harmonyOption as HTMLElement).click()
//             }
//           }),
//         null,
//       )
//     } else {
//       // If Harmony Health LLC not found, click the first option
//       await safeOperation(() => newBodyFrame.click(".av__option"), null)
//     }

//     // Wait for provider field to become enabled
//     // Click and select provider
//     await safeOperation(() => newBodyFrame.click("#providerName"), null)
//     await delay(500)

//     // Wait for dropdown options to appear
//     await safeOperation(() => newBodyFrame.waitForSelector(".av__option", { visible: true, timeout: 30000 }), null)

//     // Look specifically for Harmony Health provider option
//     const harmonyProviderOption = await safeOperation(
//       () =>
//         newBodyFrame.evaluate(() => {
//           const options = Array.from(document.querySelectorAll(".av__option"))
//           const harmonyOption = options.find(
//             (option) =>
//               option.textContent &&
//               (option.textContent.includes("Harmony Health") || option.textContent.includes("HARMONY HEALTH")),
//           )
//           return harmonyOption ? true : false
//         }),
//       false,
//     )

//     if (harmonyProviderOption) {
//       // Click on the Harmony Health provider option
//       await safeOperation(
//         () =>
//           newBodyFrame.evaluate(() => {
//             const options = Array.from(document.querySelectorAll(".av__option"))
//             const harmonyOption = options.find(
//               (option) =>
//                 option.textContent &&
//                 (option.textContent.includes("Harmony Health") || option.textContent.includes("HARMONY HEALTH")),
//             )
//             if (harmonyOption) {
//               ;(harmonyOption as HTMLElement).click()
//             }
//           }),
//         null,
//       )
//     } else {
//       // If Harmony Health not found, click the first option
//       await safeOperation(() => newBodyFrame.click(".av__option"), null)
//     }

//     // Wait for selection to be processed
//     await delay(500)

//     // Click the Next button
//     await safeOperation(() => newBodyFrame.click("button.btn.btn-primary"), null)

//     // Wait for navigation
//     try {
//       await page.waitForNavigation({ waitUntil: "networkidle0", timeout: 30000 })
//     } catch (navError) {
//       // Navigation timeout after Next, but this might be expected
//       console.log("Navigation timeout after clicking Next, continuing anyway")
//     }

//     // Now we need to click on the Referrals button inside the iframe
//     // Get the updated frames after navigation
//     const updatedFrames = page.frames()
//     const updatedNewBodyFrame = updatedFrames.find((frame) => frame.name() === "newBody")

//     if (!updatedNewBodyFrame) {
//       throw new Error("Could not find newBody iframe after navigation")
//     }

//     // Store the current frame for future use
//     currentFrame = updatedNewBodyFrame

//     // Look for the Referrals button with data-id="referral"
//     try {
//       // Wait for the button to be visible
//       await safeOperation(
//         () => currentFrame!.waitForSelector('button[data-id="referral"]', { visible: true, timeout: 10000 }),
//         null,
//       )

//       // Click the Referrals button
//       await safeOperation(() => currentFrame!.click('button[data-id="referral"]'), null)

//       // Wait for the page to update after clicking
//       await delay(4000)
//     } catch (error) {
//       // Try alternative approach - evaluate and click directly in the frame
//       const clicked = await safeOperation(
//         () =>
//           currentFrame!.evaluate(() => {
//             const buttons = Array.from(document.querySelectorAll("button"))
//             const referralButton = buttons.find(
//               (button) => button.textContent && button.textContent.includes("Referrals"),
//             )
//             if (referralButton) {
//               ;(referralButton as HTMLElement).click()
//               return true
//             }
//             return false
//           }),
//         false,
//       )

//       if (!clicked) {
//         throw new Error("Could not find Referrals button by text")
//       }

//       // Wait for the page to update
//       await delay(4000)
//     }

//     // Now extract member information from the referrals page
//     await extractMemberInformation(currentFrame)
//   } catch (error) {
//     console.error("Error navigating to Care Central:", error)
//     currentFrame = null
//     isLoggedIn = false
//     throw error
//   }
// }

// // Function to extract member information from the referrals page
// async function extractMemberInformation(frame: Frame): Promise<MemberData[]> {
//   console.log("Extracting member information from referrals page...")
//   try {
//     // Wait for the referrals content to load
//     await safeOperation(
//       () =>
//         frame.waitForSelector(".incoming-referral-info", { timeout: 15000 }).catch(async () => {
//           // If no referrals are found, send a notification and start monitoring
//           console.log("No members found in referrals page.")

//           // Send email notification that no members were found
//           await sendEmail(
//             "Availity Referrals Monitoring Active",
//             "No members were found in the referrals section at this time.\n\n" +
//               "The monitoring system is active and will check for new members every 10 seconds.\n\n" +
//               "You will receive an email notification as soon as a new member is detected.",
//           )

//           // Start continuous monitoring
//           await startContinuousMonitoring(frame)

//           return []
//         }),
//       null,
//     )

//     // If referrals are found, extract member information
//     const members = await extractMembersFromFrame(frame)

//     // Save members to database
//     await saveMembersToDatabase(members)

//     // Start continuous monitoring for new referrals
//     await startContinuousMonitoring(frame)

//     return members
//   } catch (error) {
//     console.error("Error extracting member information:", error)
//     return []
//   }
// }

// // Helper function to extract members from the frame
// async function extractMembersFromFrame(frame: Frame): Promise<MemberData[]> {
//   try {
//     return await safeOperation(
//       () =>
//         frame.evaluate(() => {
//           const results: Array<{
//             memberName: string
//             memberID: string
//             serviceName: string
//             status: string
//             county: string
//             requestDate: string
//             additionalInfo: string
//           }> = []

//           // Find all referral info containers
//           const referralContainers = document.querySelectorAll(".incoming-referral-info")

//           if (referralContainers.length === 0) {
//             return results
//           }

//           // Process each referral container
//           referralContainers.forEach((container) => {
//             try {
//               // Extract member name
//               const memberNameElement = container.querySelector(".memName")
//               const memberName =
//                 memberNameElement && memberNameElement.textContent ? memberNameElement.textContent.trim() : "Unknown"

//               // Extract service
//               const serviceElement = container.querySelector(".serviceCol")
//               const serviceName = serviceElement && serviceElement.textContent ? serviceElement.textContent.trim() : ""

//               // Extract region
//               const regionElement = container.querySelector(".regionCol")
//               const region = regionElement && regionElement.textContent ? regionElement.textContent.trim() : ""

//               // Extract county
//               const countyElement = container.querySelector(".countyCol")
//               const county = countyElement && countyElement.textContent ? countyElement.textContent.trim() : ""

//               // Extract program
//               const programElement = container.querySelector(".programCol")
//               const program = programElement && programElement.textContent ? programElement.textContent.trim() : ""

//               // Extract status
//               const statusElement = container.querySelector(".statusCol .badge")
//               const status = statusElement && statusElement.textContent ? statusElement.textContent.trim() : ""

//               // Extract referral number from more details section
//               const moreDetailsSection = container.querySelector(".more-detail-section")
//               let referralNumber = ""
//               let requestDate = ""
//               let yearOfBirth = ""
//               let zipCode = ""

//               if (moreDetailsSection) {
//                 // Find all detail rows
//                 const detailRows = moreDetailsSection.querySelectorAll(".d-flex")

//                 detailRows.forEach((row) => {
//                   // Look for Referral # field
//                   const headers = row.querySelectorAll(".moreDetailsHeader")
//                   const data = row.querySelectorAll(".moreDetailsData")

//                   for (let i = 0; i < headers.length; i++) {
//                     const headerElement = headers[i]
//                     const dataElement = i < data.length ? data[i] : null

//                     const headerText =
//                       headerElement && headerElement.textContent ? headerElement.textContent.trim() : ""
//                     const dataText = dataElement && dataElement.textContent ? dataElement.textContent.trim() : ""

//                     if (headerText.includes("Referral #")) {
//                       referralNumber = dataText
//                     }

//                     if (headerText.includes("Requested On")) {
//                       requestDate = dataText
//                     }

//                     if (headerText.includes("Year of Birth")) {
//                       yearOfBirth = dataText
//                     }

//                     if (headerText.includes("Zip Code")) {
//                       zipCode = dataText
//                     }
//                   }
//                 })
//               }

//               // Create member data object
//               const memberData = {
//                 memberName,
//                 memberID: referralNumber || `unknown-${Date.now()}`, // Using referral number as member ID, with fallback
//                 serviceName,
//                 status,
//                 county,
//                 requestDate,
//                 additionalInfo: `Region: ${region}, County: ${county}, Program: ${program}, YOB: ${yearOfBirth}, Zip: ${zipCode}`,
//               }

//               results.push(memberData)
//             } catch (err) {
//               // Skip this container if there's an error
//             }
//           })

//           return results
//         }),
//       [],
//     )
//   } catch (error) {
//     console.error("Error extracting members from frame:", error)
//     return []
//   }
// }

// // Function to send email with member information
// // async function sendMemberInformationEmail(members: MemberData[]): Promise<void> {
// //   try {
// //     // We're removing this email notification as requested
// //     console.log("Skipping initial members email notification as requested")
// //   } catch (error) {
// //     console.error("Error in sendMemberInformationEmail:", error)
// //   }
// // }

// // Function to save members to database
// async function saveMembersToDatabase(members: MemberData[]): Promise<void> {
//   try {
//     for (const member of members) {
//       // Check if member already exists in database
//       const existingMember = await Referral.findOne({
//         memberID: member.memberID,
//         memberName: member.memberName,
//       })

//       if (!existingMember) {
//         console.log(`Adding new member to database: ${member.memberName} (${member.memberID})`)

//         // Create new referral record
//         const newReferral = await Referral.create({
//           memberName: member.memberName,
//           memberID: member.memberID,
//           serviceName: member.serviceName || "",
//           status: member.status || "",
//           county: member.county || "",
//           requestOn: member.requestDate || new Date().toISOString(),
//           isNotified: true, // Already notified since we're extracting it now
//         })

//         // Create notification
//         const notification = await Notification.create({
//           referralId: newReferral._id,
//           memberName: member.memberName,
//           memberID: member.memberID,
//           message: `Member found in referrals: ${member.memberName} (${member.serviceName || "No service specified"})`,
//         })

//         // Send SMS notification for new member
//         await sendSMS(
//           `New member in referrals: ${member.memberName} (${member.memberID}). Check dashboard for details.`,
//         )
//       }
//     }
//   } catch (error) {
//     console.error("Error saving members to database:", error)
//     // Continue even if database operations fail
//   }
// }

// async function startContinuousMonitoring(frame: Frame): Promise<void> {
//   if (isMonitoring) {
//     console.log("Monitoring already active, skipping setup")
//     return // Already monitoring
//   }

//   console.log("Starting continuous monitoring for new referrals")
//   isMonitoring = true

//   // Store the current members for comparison
//   currentMembers = await extractMembersFromFrame(frame)
//   console.log(`Initial monitoring state: ${currentMembers.length} members`)

//   // Set up the interval to check for new referrals every 30 seconds
//   monitoringInterval = setInterval(async () => {
//     try {
//       console.log("Checking for new referrals...")

//       // Check if browser needs to be restarted
//       await checkBrowserHealth()

//       // Create a unique request ID for this monitoring check
//       const requestId = `monitor-${Date.now()}`

//       // Check if this request is already in progress
//       if (pendingRequests.has(requestId)) {
//         console.log(`Monitoring request ${requestId} is already in progress, skipping`)
//         return
//       }

//       // Add this request to pending requests
//       pendingRequests.add(requestId)

//       try {
//         // Verify the frame is still valid
//         try {
//           await frame.evaluate(() => document.title)
//         } catch (frameError) {
//           console.log("Frame is no longer valid, attempting to recover...")
//           throw new Error("detached Frame")
//         }

//         // Click on the "incoming" tab to refresh the data
//         console.log("Clicking on 'incoming' tab to refresh data...")

//         // Try multiple selectors to find the incoming tab
//         const incomingTabSelectors = [
//           'button:has-text("Incoming")',
//           'a:has-text("Incoming")',
//           'div:has-text("Incoming")',
//           'span:has-text("Incoming")',
//           'li:has-text("Incoming")',
//           'tab:has-text("Incoming")',
//           '.nav-item:has-text("Incoming")',
//           '.nav-link:has-text("Incoming")',
//         ]

//         let tabClicked = false

//         // Try each selector
//         for (const selector of incomingTabSelectors) {
//           try {
//             const elements = await safeOperation(() => frame.$$(selector), [])
//             for (const element of elements) {
//               try {
//                 // Check if this element is visible and contains only the text "Incoming"
//                 const isRelevant = await safeOperation(
//                   () =>
//                     element.evaluate((el) => {
//                       const text = el.textContent?.trim()
//                       return text === "Incoming" || text === "INCOMING"
//                     }),
//                   false,
//                 )

//                 if (isRelevant) {
//                   await safeOperation(() => element.click(), null)
//                   tabClicked = true
//                   console.log("Successfully clicked on 'incoming' tab")
//                   break
//                 }
//               } catch (elementError) {
//                 // Continue to next element
//               }
//             }
//             if (tabClicked) break
//           } catch (error) {
//             // Try next selector
//           }
//         }

//         // If we couldn't find the tab by text, try finding it by position or other attributes
//         if (!tabClicked) {
//           // Try to find tabs/navigation elements and click the first one (assuming it's "Incoming")
//           try {
//             const navElements = await safeOperation(
//               () => frame.$$(".nav-tabs .nav-item, .nav-tabs .nav-link, .nav .nav-item, .nav .nav-link"),
//               [],
//             )
//             if (navElements.length > 0) {
//               await safeOperation(() => navElements[0].click(), null)
//               tabClicked = true
//               console.log("Clicked on first tab (assuming it's 'incoming')")
//             }
//           } catch (error) {
//             console.log("Could not find navigation elements")
//           }
//         }

//         if (!tabClicked) {
//           console.log("Could not find and click 'incoming' tab with any method")
//         }

//         // Wait a moment for the page to update after clicking
//         await delay(2000)

//         // Extract the current members from the frame
//         const newMembers = await extractMembersFromFrame(frame)
//         console.log(`Found ${newMembers.length} members, comparing with previous ${currentMembers.length} members`)

//         // Compare with previous members to find new ones
//         const addedMembers = findNewMembers(currentMembers, newMembers)

//         // If new members are found, process them
//         if (addedMembers.length > 0) {
//           console.log(`Found ${addedMembers.length} new members!`)
//           // Send notifications for new members
//           await processNewMembers(addedMembers)
//         } else {
//           console.log("No new members found")
//         }

//         // Update the current members list
//         currentMembers = newMembers
//       } finally {
//         // Always remove the request from pending requests
//         pendingRequests.delete(requestId)
//       }
//     } catch (error) {
//       console.error("Error during monitoring check:", error)

//       // Check if the frame is detached
//       if (error instanceof Error && error.message.includes("detached Frame")) {
//         console.log("Frame is detached, attempting to recover...")

//         // Stop the current monitoring
//         if (monitoringInterval) {
//           clearInterval(monitoringInterval)
//           monitoringInterval = null
//         }

//         isMonitoring = false
//         isLoggedIn = false
//         currentFrame = null

//         // Try to re-login and restart monitoring
//         try {
//           await loginToAvaility()
//         } catch (loginError) {
//           console.error("Failed to recover after frame detachment:", loginError)

//           // Send notification about the error
//           try {
//             // await sendEmail(
//             //   "Availity Bot Recovery",
//             //   `The Availity monitoring bot needs to briefly restart ${new Date().toLocaleString()}.\n\n` +
//             //     `You can just ignore: ${loginError}\n\n` +
//             //     `The application will restart and continue monitoring.\n\n` +
//             //     `This is an automated message from the monitoring system.`,
//             // )
//           } catch (emailError) {
//             console.error("Failed to send error notification email:", emailError)
//           }
//         }
//       } else if (error instanceof Error && error.message.includes("Request is already handled")) {
//         // This is a common error that can be safely ignored
//         console.log("Request is already handled error, continuing monitoring")
//         requestAlreadyHandledErrors++
//       }
//     }
//   }, MONITORING_INTERVAL_MS) // Check every 30 seconds

//   console.log(`Monitoring interval set up for every ${MONITORING_INTERVAL_MS / 1000} seconds`)
// }

// // Helper function to find new members by comparing two arrays
// function findNewMembers(oldMembers: MemberData[], newMembers: MemberData[]): MemberData[] {
//   return newMembers.filter(
//     (newMember) =>
//       !oldMembers.some(
//         (oldMember) => oldMember.memberID === newMember.memberID && oldMember.memberName === newMember.memberName,
//       ),
//   )
// }

// // Process new members that were found
// async function processNewMembers(members: MemberData[]): Promise<void> {
//   console.log("Processing new members...")
//   try {
//     // Filter out members we've already notified about
//     const unnotifiedMembers = members.filter((member) => !notifiedMemberIds.has(member.memberID))

//     if (unnotifiedMembers.length === 0) {
//       console.log("All new members have already been notified about, skipping notifications")
//       return
//     }

//     // Save to database
//     await saveMembersToDatabase(unnotifiedMembers)

//     // Send email notification
//     let emailContent = "New Referrals Detected:\n\n"

//     unnotifiedMembers.forEach((member, index) => {
//       emailContent += `Member ${index + 1}:\n`
//       emailContent += `Name: ${member.memberName}\n`
//       emailContent += `ID: ${member.memberID}\n`

//       if (member.serviceName) {
//         emailContent += `Service: ${member.serviceName}\n`
//       }

//       if (member.status) {
//         emailContent += `Status: ${member.status}\n`
//       }

//       if (member.county) {
//         emailContent += `County: ${member.county}\n`
//       }

//       if (member.requestDate) {
//         emailContent += `Request Date: ${member.requestDate}\n`
//       }

//       emailContent += "\n"

//       // Add this member to our notified set
//       notifiedMemberIds.add(member.memberID)
//     })

//     await sendEmail("New Availity Referrals Detected", emailContent)
//     console.log("Email notification sent for new members")

//     // Send SMS for each new member
//     for (const member of unnotifiedMembers) {
//       await sendSMS(`New referral detected: ${member.memberName} (${member.memberID}). Check dashboard for details.`)
//     }
//     console.log("SMS notifications sent for new members")
//   } catch (error) {
//     console.error("Error processing new members:", error)
//     // Continue even if notification fails
//   }
// }

// // Function to check for new referrals using API
// export async function checkForNewReferrals(): Promise<void> {
//   // Create a unique request ID for this API check
//   const requestId = `api-check-${Date.now()}`

//   // Check if this request is already in progress
//   if (pendingRequests.has(requestId)) {
//     console.log(`API check request ${requestId} is already in progress, skipping`)
//     return
//   }

//   // Add this request to pending requests
//   pendingRequests.add(requestId)

//   console.log("Starting API-based check for new referrals...")
//   try {
//     // Check if browser needs to be restarted
//     await checkBrowserHealth()

//     // Only login if we're not already logged in
//     if (!isLoggedIn || !currentFrame) {
//       console.log("Not logged in, initiating login process...")
//       const loginSuccess = await loginToAvaility()
//       if (!loginSuccess) {
//         throw new Error("Failed to login to Availity")
//       }
//     } else {
//       console.log("Already logged in, skipping login process")
//     }

//     // Get session cookies
//     const cookies = await getSessionCookies()

//     // Extract XSRF token
//     const xsrfToken = extractXsrfToken(cookies)

//     // Make API request to fetch referrals
//     console.log("Making API request to fetch referrals...")
//     try {
//       const response = await axios.post<ReferralResponse>(
//         REFERRALS_API_URL,
//         {
//           brand: "WLP",
//           npi: "1184328189",
//           papi: "",
//           state: "TN",
//           tabStatus: "INCOMING",
//           taxId: "922753606",
//         },
//         {
//           headers: {
//             Cookie: cookies,
//             "Content-Type": "application/json",
//             "X-XSRF-TOKEN": xsrfToken,
//             "User-Agent":
//               "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36",
//             Referer: "https://apps.availity.com/public/apps/care-central/",
//           },
//         },
//       )

//       const currentTime = new Date()
//       console.log(`Retrieved ${response.data.referrals.length} referrals from API`)

//       const newReferrals = response.data.referrals.filter((referral) => {
//         const requestDate = new Date(referral.requestOn)
//         return requestDate > lastCheckTime
//       })

//       console.log(`Found ${newReferrals.length} new referrals since last check`)

//       if (newReferrals.length > 0) {
//         // Filter out referrals we've already notified about
//         const unnotifiedReferrals = newReferrals.filter((referral) => !notifiedMemberIds.has(referral.memberID))

//         // Process each new referral
//         for (const referral of unnotifiedReferrals) {
//           // Check if referral already exists in database
//           const existingReferral = await Referral.findOne({
//             memberID: referral.memberID,
//             requestOn: referral.requestOn,
//           })

//           if (!existingReferral) {
//             // Save the new referral
//             const savedReferral = await Referral.create({
//               ...referral,
//               isNotified: false,
//             })

//             // Create notification
//             const notification = await Notification.create({
//               referralId: savedReferral._id,
//               memberName: referral.memberName,
//               memberID: referral.memberID,
//               message: `New referral for ${referral.memberName} (${referral.serviceName}) received on ${referral.requestOn}`,
//             })

//             // Send email notification
//             await sendEmail(
//               "New Referral Notification",
//               `New referral received for ${referral.memberName} (ID: ${referral.memberID}).\n\n` +
//                 `Service: ${referral.serviceName}\n` +
//                 `Region: ${referral.regionName}\n` +
//                 `County: ${referral.county}\n` +
//                 `Plan: ${referral.plan}\n` +
//                 `Preferred Start Date: ${referral.preferredStartDate}\n` +
//                 `Status: ${referral.status}`,
//             )

//             // Send SMS notification
//             await sendSMS(
//               `New referral: ${referral.memberName} (${referral.memberID}) for ${referral.serviceName}. Check dashboard for details.`,
//             )

//             // Mark as notified
//             savedReferral.isNotified = true
//             await savedReferral.save()

//             // Add to our notified set
//             notifiedMemberIds.add(referral.memberID)
//           }
//         }
//       } else {
//         console.log("No new referrals found in this check")
//       }

//       // Update last check time
//       lastCheckTime = currentTime
//     } catch (axiosError) {
//       if (axios.isAxiosError(axiosError)) {
//         const error = axiosError as AxiosError

//         // Check for rate limiting (503 Service Unavailable)
//         if (error.response && error.response.status === 503) {
//           console.log("API rate limit exceeded. Will retry after delay.")

//           // Get retry delay from header if available
//           const retryDelay = error.response?.headers?.["x-availity-api-retry-delay-sec"]
//           const delayMs = retryDelay ? Number.parseInt(retryDelay as string) * 1000 : API_RETRY_DELAY_MS

//           console.log(`Waiting ${delayMs / 1000} seconds before retrying...`)

//           // Don't throw, just log and continue
//           return
//         }

//         // Check for authentication errors
//         if (error.response && (error.response.status === 401 || error.response.status === 403)) {
//           console.log("Authentication error. Clearing session and will re-login on next check.")

//           // Clear browser session
//           await closeBrowser()
//           browser = null
//           page = null
//           isLoggedIn = false
//           currentFrame = null
//         }

//         throw error
//       }
//       throw axiosError
//     }
//   } catch (error) {
//     console.error("Error checking for new referrals:", error)
//     // No error email - just log the error
//   } finally {
//     // Always remove the request from pending requests
//     pendingRequests.delete(requestId)
//   }
// }

// function extractXsrfToken(cookies: string): string {
//   const match = cookies.match(/XSRF-TOKEN=([^;]+)/)
//   return match ? match[1] : ""
// }

// // Function to start the monitoring process
// export async function startReferralMonitoring(): Promise<void> {
//   console.log("🚀 Starting referral monitoring process with 30-second interval...")
//   console.log(`⏰ Current time: ${new Date().toISOString()}`)

//   // Send startup notification
//   try {
//     // await sendEmail(
//     //   "Availity Monitoring Bot Active",
//     //   `The Availity monitoring bot has been started at ${new Date().toISOString()}.\n\n` +
//     //     "The bot will check for new referrals every 10 seconds and notify you when new members are detected.",
//     // )
//   } catch (error) {
//     console.error("Failed to send startup notification:", error)
//   }

//   // Initial check
//   try {
//     console.log("📊 Performing initial referral check (#0)...")
//     await checkForNewReferrals()
//     console.log(`✅ Initial check completed successfully at ${new Date().toISOString()}`)
//   } catch (error) {
//     console.error("❌ Error in initial referral check:", error)
//     // Retry on error
//     try {
//       console.log("🔄 Retrying initial check after error...")
//       await closeBrowser()
//       await delay(5000)
//       await checkForNewReferrals()
//       console.log("✅ Retry successful")
//     } catch (retryError) {
//       console.error("❌ Retry failed:", retryError)
//       // No error email - just log the error
//     }
//   }

//   // Set up interval for API-based checks every 30 seconds
//   console.log(`⏱️ Setting up scheduled checks every 30 seconds...`)

//   // Use a named function for the interval callback for better debugging
//   const performScheduledCheck = async () => {
//     const startTime = new Date()
//     console.log(`⏳ Running scheduled API check at ${startTime.toISOString()}...`)

//     try {
//       await checkForNewReferrals()
//       const endTime = new Date()
//       const duration = (endTime.getTime() - startTime.getTime()) / 1000
//       console.log(`✅ Scheduled check completed successfully in ${duration.toFixed(2)} seconds`)
//     } catch (error) {
//       console.error(`❌ Error in scheduled API check:`, error)

//       // Retry on error
//       try {
//         console.log(`🔄 Retrying scheduled check after error...`)
//         await closeBrowser()
//         await delay(5000)
//         await checkForNewReferrals()
//         console.log(`✅ Retry successful`)
//       } catch (retryError) {
//         console.error(`❌ Scheduled check retry failed:`, retryError)
//         // No error email - just log the error
//       }
//     }

//     // Log next scheduled check time
//     const nextCheckTime = new Date(Date.now() + MONITORING_INTERVAL_MS)
//     console.log(`🔔 Next check scheduled for ${nextCheckTime.toISOString()}`)
//   }

//   // Use setInterval with the exact millisecond value (30000 ms = 30 seconds)
//   const intervalId = setInterval(performScheduledCheck, MONITORING_INTERVAL_MS)

//   console.log(`🔔 Monitoring setup complete - checking every 30 seconds`)
//   console.log(`⏰ Next check scheduled for ${new Date(Date.now() + MONITORING_INTERVAL_MS).toISOString()}`)

//   // Add a function to stop monitoring if needed
//   process.on("SIGINT", () => {
//     console.log("🛑 Stopping monitoring due to application shutdown...")
//     clearInterval(intervalId)
//     closeBrowser().then(() => {
//       console.log("✅ Monitoring stopped and browser closed successfully")
//       process.exit(0)
//     })
//   })
// }

// // Stop monitoring when needed
// export function stopReferralMonitoring(): void {
//   if (monitoringInterval) {
//     clearInterval(monitoringInterval)
//     monitoringInterval = null
//     console.log("Referral monitoring stopped")
//   }
//   isMonitoring = false
// }

// // Add a watchdog timer that restarts the browser if it detects issues
// export function setupWatchdog(): void {
//   const WATCHDOG_INTERVAL_MS = 300000 // 5 minutes
//   const MAX_INACTIVITY_MS = 600000 // 10 minutes

//   let watchdogInterval: NodeJS.Timeout | null = null
//   let lastSuccessfulOperation = new Date()
//   let consecutiveErrors = 0

//   // Clear any existing watchdog interval
//   if (watchdogInterval) {
//     clearInterval(watchdogInterval)
//   }

//   watchdogInterval = setInterval(async () => {
//     try {
//       console.log("Watchdog check running...")

//       // Check if there have been too many consecutive errors
//       if (consecutiveErrors >= 5) {
//         console.log(`Too many consecutive errors (${consecutiveErrors}), forcing restart...`)
//         await forceRestart()
//         return
//       }

//       // Check if the bot has been inactive for too long
//       const now = new Date()
//       const inactivityTime = now.getTime() - lastSuccessfulOperation.getTime()

//       if (inactivityTime > MAX_INACTIVITY_MS) {
//         console.log(`Bot has been inactive for ${inactivityTime / 1000} seconds, forcing restart...`)
//         await forceRestart()
//         return
//       }

//       // Check if browser is still responsive
//       if (browser && page) {
//         try {
//           // Try a simple operation to see if the browser is responsive
//           await page.evaluate(() => document.title)
//           console.log("Browser is responsive")
//           lastSuccessfulOperation = new Date()
//           consecutiveErrors = 0
//         } catch (error) {
//           console.log("Browser appears to be unresponsive, restarting...")
//           consecutiveErrors++
//           await forceRestart()
//           return
//         }
//       } else if (!browser || !page) {
//         console.log("Browser or page is null, restarting...")
//         consecutiveErrors++
//         await forceRestart()
//         return
//       }

//       // Check if the frame is still valid
//       if (currentFrame) {
//         try {
//           await currentFrame.evaluate(() => document.title)
//           console.log("Frame is responsive")
//           lastSuccessfulOperation = new Date()
//         } catch (error) {
//           console.log("Frame is no longer valid, restarting...")
//           consecutiveErrors++
//           await forceRestart()
//           return
//         }
//       }

//       // Check for too many "Request is already handled" errors
//       if (requestAlreadyHandledErrors > MAX_REQUEST_ALREADY_HANDLED_ERRORS) {
//         console.log(`Too many "Request is already handled" errors (${requestAlreadyHandledErrors}), forcing restart...`)
//         requestAlreadyHandledErrors = 0
//         await forceRestart()
//         return
//       }

//       console.log("Watchdog check completed successfully")
//     } catch (error) {
//       console.error("Error in watchdog:", error)
//       consecutiveErrors++
//       // If the watchdog itself errors, try to restart
//       try {
//         await forceRestart()
//       } catch (restartError) {
//         console.error("Failed to restart after watchdog error:", restartError)
//       }
//     }
//   }, WATCHDOG_INTERVAL_MS)

//   console.log(`Watchdog timer set up to check every ${WATCHDOG_INTERVAL_MS / 1000} seconds`)
// }

// export async function sendStillAliveNotification(): Promise<void> {
//   try {
//     const uptime = process.uptime()
//     const uptimeHours = Math.floor(uptime / 3600)
//     const uptimeMinutes = Math.floor((uptime % 3600) / 60)

//     // Get the current time to determine which status email this is
//     const now = new Date()
//     const hour = now.getHours()
//     let timeOfDay = "Status Update"

//     if (hour >= 0 && hour < 6) {
//       timeOfDay = "Midnight Status"
//     } else if (hour >= 6 && hour < 12) {
//       timeOfDay = "Morning Status"
//     } else if (hour >= 12 && hour < 18) {
//       timeOfDay = "Afternoon Status"
//     } else {
//       timeOfDay = "Evening Status"
//     }

//     const message =
//       `Hi, just wanted to let you know I'm still active, up and running!\n\n` +
//       `Current time: ${new Date().toLocaleString()}\n` +
//       `Bot version: ${BOT_VERSION}\n\n` +
//       `Current status:\n` +
//       `- Browser initialized: ${browser !== null}\n` +
//       `- Logged in: ${isLoggedIn}\n` +
//       `- Monitoring active: ${isMonitoring}\n` +
//       `- Members being monitored: ${currentMembers.length}\n\n` +
//       `This is an automated status update from your Availity monitoring bot.`

//     await sendEmail(`Availity Bot ${timeOfDay}`, message)
//     console.log(`Sent '${timeOfDay}' notification email`)
//   } catch (error) {
//     console.error("Failed to send 'still alive' notification:", error)
//   }
// }


import puppeteer, { type Browser, type Page, type Frame } from "puppeteer"
import axios, { type AxiosError } from "axios"
import { authenticator } from "otplib"
import { config } from "dotenv"
import { sendEmail } from "./email"
import { sendSMS } from "./sms"
import { Referral } from "../models/referrals"
import { Notification } from "../models/notification"
import { StatusLog } from "../models/status-log"
// Add the import for the database connection functions at the top of the file
import { connectToDatabase, safeDbOperation } from "./database"

export const BOT_VERSION = "1.0.0"

config()

// Global variables
let browser: Browser | null = null
let page: Page | null = null
let lastCheckTime = new Date()
let monitoringInterval: NodeJS.Timeout | null = null
let isMonitoring = false
let currentMembers: MemberData[] = []
let isLoggedIn = false
let currentFrame: Frame | null = null
const pendingRequests = new Set<string>() // Track pending requests to prevent duplicates
let lastRestartTime = new Date() // Track when we last restarted the browser
const requestQueue: Map<string, boolean> = new Map() // Queue to track operations
let requestAlreadyHandledErrors = 0 // Counter for "Request is already handled" errors
const MAX_REQUEST_ALREADY_HANDLED_ERRORS = 20 // Threshold for restart

// Constants
const AVAILITY_URL = "https://apps.availity.com"
const LOGIN_URL = "https://apps.availity.com/availity/web/public.elegant.login"
const REFERRALS_API_URL = "https://apps.availity.com/api/v1/proxy/anthem/provconn/v1/carecentral/ltss/referral/details"
const TOTP_SECRET = process.env.TOTP_SECRET || "RU4SZCAW4UESMUQNCG3MXTWKXA"
const MONITORING_INTERVAL_MS = 60000 // 10 seconds (changed from 30000)
const API_RETRY_DELAY_MS = 60000 // 60 seconds (based on Availity's retry header)
const MAX_RETRIES = 5 // Maximum number of retries for operations
const BROWSER_RESTART_INTERVAL_MS = 3600000 // 1 hour - restart browser periodically to prevent memory leaks

// Interfaces
interface ReferralResponse {
  effectiveDate: string
  referrals: Array<{
    memberName: string
    memberID: string
    serviceName: string
    regionName: string
    county: string
    plan: string
    preferredStartDate: string
    status: string
    requestOn: string
  }>
}

// Member interface for data extracted from the page
export interface MemberData {
  memberName: string
  memberID: string
  serviceName?: string
  status?: string
  county?: string
  requestDate?: string
  additionalInfo?: string
}

// Helper function for timeouts - reduced delay times
async function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// Retry operation helper - reduced delay time
async function retryOperation(operation: () => Promise<void>, retries = MAX_RETRIES, delayMs = 1000) {
  for (let i = 0; i < retries; i++) {
    try {
      await operation()
      return
    } catch (error) {
      console.log(`Attempt ${i + 1} failed:`, error)
      if (i < retries - 1) {
        console.log(`Retrying in ${delayMs}ms...`)
        await delay(delayMs)
      } else {
        throw error
      }
    }
  }
}

// Helper function to temporarily disable request interception
async function withoutInterception<T>(page: Page, fn: () => Promise<T>): Promise<T> {
  // Check if interception is enabled before trying to disable it
  let wasEnabled = false

  try {
    // Check if interception is enabled using a safe method
    wasEnabled = await page
      .evaluate(() => {
        // @ts-ignore - accessing internal property for checking
        return !!window["_puppeteer"]?.network?._requestInterceptionEnabled
      })
      .catch(() => false)
  } catch (error) {
    console.log("Error checking interception status:", error)
    wasEnabled = false
  }

  // Only disable if it was enabled
  if (wasEnabled) {
    try {
      await page.setRequestInterception(false)
      console.log("Request interception disabled temporarily")
    } catch (error) {
      console.error("Error disabling request interception:", error)
      // Continue anyway
    }
  }

  try {
    // Run the function
    return await fn()
  } finally {
    // Re-enable interception only if it was enabled before
    if (wasEnabled) {
      try {
        await page.setRequestInterception(true)
        console.log("Request interception re-enabled")
      } catch (error) {
        console.error("Error re-enabling request interception:", error)
      }
    }
  }
}

// Safe wrapper for any puppeteer operation to handle "Request is already handled" errors
async function safeOperation<T>(operation: () => Promise<T>, defaultValue: T): Promise<T> {
  const operationId = `op-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`

  // Check if we're already processing too many operations
  if (requestQueue.size > 50) {
    // Wait a bit if the queue is getting too large
    await delay(100)
  }

  // Add to queue
  requestQueue.set(operationId, true)

  try {
    return await operation()
  } catch (error) {
    if (error instanceof Error && error.message.includes("Request is already handled")) {
      console.log("Ignoring 'Request is already handled' error in operation")
      requestAlreadyHandledErrors++
      return defaultValue
    }
    throw error
  } finally {
    // Remove from queue
    requestQueue.delete(operationId)
  }
}

export async function getSessionCookies(): Promise<string> {
  if (!page) {
    throw new Error("Page not initialized")
  }

  try {
    const cookies = await page.cookies()
    return cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join("; ")
  } catch (error) {
    console.error("Error getting session cookies:", error)
    return ""
  }
}

export async function closeBrowser(): Promise<void> {
  if (browser) {
    try {
      await browser.close()
    } catch (error) {
      console.error("Error closing browser:", error)
    } finally {
      browser = null
      page = null
      currentFrame = null
      isLoggedIn = false
      console.log("Browser closed successfully")
    }
  }
}

// Check if browser needs to be restarted periodically to prevent memory leaks
async function checkBrowserHealth(): Promise<void> {
  const now = new Date()
  const timeSinceLastRestart = now.getTime() - lastRestartTime.getTime()

  if (timeSinceLastRestart > BROWSER_RESTART_INTERVAL_MS) {
    console.log("Performing scheduled browser restart to prevent memory leaks...")

    // Save current state
    const wasMonitoring = isMonitoring

    // Stop monitoring
    if (monitoringInterval) {
      clearInterval(monitoringInterval)
      monitoringInterval = null
    }

    isMonitoring = false
    isLoggedIn = false

    // Close and restart browser
    await closeBrowser()
    await setupBot()

    // Restore monitoring if it was active
    if (wasMonitoring) {
      await loginToAvaility()
    }

    // Update restart time
    lastRestartTime = new Date()
    console.log("Scheduled browser restart completed successfully")
  }

  // Check for too many "Request is already handled" errors
  if (requestAlreadyHandledErrors > MAX_REQUEST_ALREADY_HANDLED_ERRORS) {
    console.log(`Too many "Request is already handled" errors (${requestAlreadyHandledErrors}), forcing restart...`)
    requestAlreadyHandledErrors = 0
    await forceRestart()
  }
}

// Force restart of the browser and monitoring
async function forceRestart(): Promise<void> {
  console.log("Forcing restart of browser and monitoring...")

  try {
    // Save current monitoring state
    const wasMonitoring = isMonitoring

    // Stop monitoring
    if (monitoringInterval) {
      clearInterval(monitoringInterval)
      monitoringInterval = null
    }

    isMonitoring = false
    isLoggedIn = false
    currentFrame = null

    // Close browser
    await closeBrowser()

    // Reset error counter
    requestAlreadyHandledErrors = 0

    // Update restart time
    lastRestartTime = new Date()

    // Restart the bot
    await setupBot()

    // Try to log in again
    try {
      await loginToAvaility()
      console.log("Successfully restarted and logged in")

      // Monitoring will be resumed by loginToAvaility if wasMonitoring was true
    } catch (loginError) {
      console.error("Failed to log in after restart:", loginError)

      // No error email - just log the error

      // Try to resume monitoring after a delay if it was active before
      if (wasMonitoring) {
        setTimeout(async () => {
          try {
            await loginToAvaility()
          } catch (retryError) {
            console.error("Failed to login on retry after restart:", retryError)
          }
        }, 60000) // Wait 1 minute before retry
      }
    }
  } catch (error) {
    console.error("Error during forced restart:", error)
    // No error email - just log the error
  }
}

// Update the setupBot function to include database connection
export async function setupBot(): Promise<void> {
  try {
    // Connect to the database first
    await connectToDatabase()

    // If browser is already initialized, don't create a new one
    if (browser && page) {
      console.log("Browser already initialized, skipping setup")
      return
    }

    // Close any existing browser instance to prevent resource leaks
    await closeBrowser()

    browser = await puppeteer.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-accelerated-2d-canvas",
        "--no-first-run",
        "--no-zygote",
        "--single-process",
        "--disable-gpu",
        "--disable-extensions",
        "--disable-component-extensions-with-background-pages",
        "--disable-default-apps",
        "--mute-audio",
        "--disable-background-timer-throttling",
        "--disable-backgrounding-occluded-windows",
        "--disable-renderer-backgrounding",
        "--disable-background-networking",
        "--disable-breakpad",
        "--disable-sync",
        "--disable-translate",
        "--metrics-recording-only",
        "--disable-hang-monitor",
        "--disable-ipc-flooding-protection",
        // Add these new options for better stability
        "--disable-features=site-per-process",
        "--disable-threaded-animation",
        "--disable-threaded-scrolling",
        "--disable-web-security",
        "--memory-pressure-off",
        // Reduce memory usage
        "--js-flags=--max-old-space-size=512",
      ],
      defaultViewport: { width: 1024, height: 768 }, // Reduced from 1280x800
      timeout: 60000, // Increased timeout
    })

    console.log("✅ Browser launched successfully")

    // Create a new page
    page = await browser.newPage()

    // Set viewport size
    await page.setViewport({ width: 1280, height: 800 })

    // Add additional configurations
    await page.setDefaultNavigationTimeout(50000)
    await page.setDefaultTimeout(50000)

    // Enable request interception to optimize performance - with better error handling
    try {
      await page.setRequestInterception(true)
      console.log("Request interception enabled successfully")

      page.on("request", (request) => {
        // Use a more targeted approach to request interception
        try {
          if (request.isInterceptResolutionHandled()) {
            return // Skip if already handled
          }

          const url = request.url()
          const resourceType = request.resourceType()

          // Only abort specific resource types or URLs
          if (
            resourceType === "image" ||
            resourceType === "font" ||
            resourceType === "media" ||
            url.includes(".jpg") ||
            url.includes(".png") ||
            url.includes(".gif") ||
            url.includes(".woff")
          ) {
            // For resources we want to block
            request.abort()
          } else {
            // For resources we want to allow
            request.continue()
          }
        } catch (error) {
          // If request is already handled, just log and continue
          if (error instanceof Error && error.message.includes("Request is already handled")) {
            console.log("Request is already handled, ignoring")
            requestAlreadyHandledErrors++
          } else {
            console.error("Error handling request:", error)
            // Try to continue the request if possible
            try {
              if (!request.isInterceptResolutionHandled()) {
                request.continue()
              }
            } catch (continueError) {
              // Just log, don't crash
              console.error("Error continuing request:", continueError)
            }
          }
        }
      })
    } catch (interceptError) {
      console.error("Failed to enable request interception:", interceptError)
      // Continue without interception
    }

    // Set up error handler for the page
    page.on("error", (err) => {
      console.error("Page error:", err)
      // Don't crash the process, just log the error
    })

    // Update restart time
    lastRestartTime = new Date()

    console.log("✅ Bot setup completed")

    // Set up the watchdog
    setupWatchdog()
  } catch (error) {
    console.error("❌ Error setting up bot:", error)
    throw error
  }
}

async function handlePopups(page: Page): Promise<void> {
  console.log("Checking for popups to dismiss...")
  try {
    const closeButtonSelectors = [
      'button:has-text("×")',
      "button.close",
      'button[aria-label="Close"]',
      ".modal-close",
      ".dialog-close",
      ".modal-header button",
      'button:has-text("Close")',
      'button:has-text("Cancel")',
      'button:has-text("Dismiss")',
    ]

    for (const selector of closeButtonSelectors) {
      try {
        const closeButtons = await safeOperation(() => page.$$(selector), [])
        for (const button of closeButtons) {
          try {
            const isVisible = await safeOperation(
              () =>
                button.evaluate((el) => {
                  const style = window.getComputedStyle(el)
                  return style.display !== "none" && style.visibility !== "hidden" && style.opacity !== "0"
                }),
              false,
            )

            if (isVisible) {
              await safeOperation(() => button.click(), null)
              await delay(300)
            }
          } catch (buttonError) {
            // Continue to next button
          }
        }
      } catch (error) {
        // Continue to next selector
      }
    }

    const modalSelectors = [".modal.show", ".dialog.show", '[role="dialog"]', '[aria-modal="true"]']

    for (const selector of modalSelectors) {
      try {
        const modals = await safeOperation(() => page.$$(selector), [])
        for (const modal of modals) {
          try {
            const closeButton = await safeOperation(
              () => modal.$('button:has-text("×"), button.close, button[aria-label="Close"]'),
              null,
            )
            if (closeButton) {
              await safeOperation(() => closeButton.click(), null)
              await delay(300)
            }
          } catch (modalError) {
            // Continue to next modal
          }
        }
      } catch (error) {
        // Continue to next selector
      }
    }
  } catch (error) {
    console.error("❌ Error handling popups:", error)
  }
}

export async function loginToAvaility(): Promise<boolean> {
  // Create a unique request ID for this login attempt
  const requestId = `login-${Date.now()}`

  // Check if this request is already in progress
  if (pendingRequests.has(requestId)) {
    console.log(`Login request ${requestId} is already in progress, skipping`)
    return false
  }

  // Add this request to pending requests
  pendingRequests.add(requestId)

  // Save current monitoring state
  const wasMonitoring = isMonitoring

  // Pause monitoring during login
  if (monitoringInterval) {
    console.log("Pausing monitoring during login process...")
    clearInterval(monitoringInterval)
    monitoringInterval = null
    isMonitoring = false
  }

  console.log("Starting Availity login process...")

  try {
    // Check if browser needs to be restarted
    await checkBrowserHealth()

    // Check if we're already logged in and have a valid frame for monitoring
    if (isLoggedIn && currentFrame) {
      try {
        // Verify the frame is still valid by executing a simple operation
        await currentFrame.evaluate(() => document.title)
        console.log("Already logged in and on referrals page, skipping login process")

        // Resume monitoring if it was active before
        if (wasMonitoring && !isMonitoring) {
          console.log("Resuming monitoring after login check...")
          await startContinuousMonitoring(currentFrame)
        }

        pendingRequests.delete(requestId)
        return true
      } catch (frameError) {
        console.log("Current frame is no longer valid, will re-login")
        isLoggedIn = false
        currentFrame = null
      }
    }

    if (!browser || !page) {
      console.log("Browser or page not initialized. Setting up bot...")
      await setupBot()
    }

    if (!page) {
      throw new Error("Browser page not initialized")
    }

    console.log("Navigating to Availity login page...")
    await withoutInterception(page!, async () => {
      await page!.goto(LOGIN_URL, { waitUntil: "networkidle2" })
    })

    // Enter username and password
    console.log("Entering credentials...")
    await safeOperation(() => page!.type("#userId", process.env.AVAILITY_USERNAME || ""), null)
    await safeOperation(() => page!.type("#password", process.env.AVAILITY_PASSWORD || ""), null)

    // Click login button
    await safeOperation(() => page!.click('button[type="submit"]'), null)

    // Wait for either navigation to complete or for 2FA form to appear
    try {
      await Promise.race([
        withoutInterception(page!, async () => {
          await page!.waitForNavigation({ timeout: 50000 })
        }),
        safeOperation(() => page!.waitForSelector('form[name="backupCodeForm"]', { timeout: 50000 }), null),
        safeOperation(() => page!.waitForSelector('form[name="authenticatorCodeForm"]', { timeout: 50000 }), null),
        safeOperation(() => page!.waitForSelector(".top-applications", { timeout: 50000 }), null),
      ])
    } catch (navError) {
      console.log("Navigation timeout or selector not found. Checking login status...")
    }

    // Check if we're logged in by looking for dashboard elements
    const loginCheck = await safeOperation(
      () =>
        page!.evaluate(() => {
          const dashboardElements =
            document.querySelector(".top-applications") !== null ||
            document.querySelector(".av-dashboard") !== null ||
            document.querySelector(".dashboard-container") !== null

          const cookieConsent = Array.from(document.querySelectorAll("h1, h2, h3, h4, h5, h6")).some((h) =>
            h.textContent?.includes("Cookie Consent & Preferences"),
          )

          return dashboardElements || cookieConsent
        }),
      false,
    )

    // Check if we need to handle 2FA
    console.log("Checking if 2FA authentication is required...")
    const is2FARequired = await safeOperation(
      () =>
        page!.evaluate(() => {
          return (
            document.querySelector('form[name="backupCodeForm"]') !== null ||
            document.querySelector('form[name="authenticatorCodeForm"]') !== null ||
            document.querySelector('input[type="radio"][value*="authenticator"]') !== null ||
            document.querySelector('input[type="radio"][value*="backup"]') !== null
          )
        }),
      false,
    )

    if (is2FARequired) {
      console.log("2FA authentication is required. Handling 2FA...")
      await handle2FA(page!)
      isLoggedIn = true
    } else if (loginCheck) {
      console.log("Already logged in - no 2FA required")
      isLoggedIn = true
    } else {
      const currentUrl = page!.url()
      console.log(`Current URL: ${currentUrl}`)

      if (currentUrl.includes("login") || currentUrl.includes("authenticate")) {
        throw new Error("Login failed - still on login page")
      }
    }

    // Handle any cookie consent popup that might appear after login
    await handleCookieConsent(page!)

    // Handle any other popups that might appear
    await handlePopups(page!)

    // Navigate to Care Central
    console.log("Proceeding to navigate to Care Central...")
    await navigateToCareCentral(page!)

    console.log("Login process completed successfully")

    // Resume monitoring if it was active before
    if (wasMonitoring && !isMonitoring && currentFrame) {
      console.log("Resuming monitoring after successful login...")
      await startContinuousMonitoring(currentFrame)
    }

    pendingRequests.delete(requestId)
    return true
  } catch (error) {
    console.error("Error during login attempt:", error)
    isLoggedIn = false
    currentFrame = null

    // Try to resume monitoring if it was active before, even after error
    if (wasMonitoring && !isMonitoring) {
      console.log("Attempting to resume monitoring after login failure...")
      // Try again to login after a short delay
      setTimeout(async () => {
        try {
          await loginToAvaility()
        } catch (retryError) {
          console.error("Failed to login on retry:", retryError)
        }
      }, 60000) // Wait 1 minute before retry
    }

    pendingRequests.delete(requestId)
    throw error
  }
}

async function handle2FA(page: Page): Promise<void> {
  console.log("Starting 2FA authentication process...")
  try {
    // Wait for the 2FA options to be visible
    await safeOperation(() => page.waitForSelector('input[type="radio"]', { visible: true, timeout: 40000 }), null)

    let authenticatorOptionSelected = false

    // Approach 1: Try direct selector for the authenticator app radio button
    try {
      const authenticatorRadioSelector =
        'input[type="radio"][value*="authenticator"], input[type="radio"][id*="authenticator"], input[type="radio"][name*="authenticator"]'
      const authenticatorRadio = await safeOperation(() => page.$(authenticatorRadioSelector), null)

      if (authenticatorRadio) {
        await safeOperation(() => authenticatorRadio.click(), null)
        authenticatorOptionSelected = true
      }
    } catch (error) {
      // Try next approach
    }

    // Approach 2: Try finding by label text if approach 1 failed
    if (!authenticatorOptionSelected) {
      try {
        const labels = await safeOperation(() => page.$$("label"), [])
        for (const label of labels) {
          try {
            const text = await safeOperation(() => label.evaluate((el) => el.textContent), null)
            if (text && text.toLowerCase().includes("authenticator app")) {
              await safeOperation(() => label.click(), null)
              authenticatorOptionSelected = true
              break
            }
          } catch (labelError) {
            // Continue to next label
          }
        }
      } catch (error) {
        // Try next approach
      }
    }

    // Approach 3: Try selecting the first radio button (assuming it's the authenticator app option)
    if (!authenticatorOptionSelected) {
      try {
        const radioButtons = await safeOperation(() => page.$$('input[type="radio"]'), [])
        if (radioButtons.length >= 1) {
          await safeOperation(() => radioButtons[0].click(), null)
          authenticatorOptionSelected = true
        }
      } catch (error) {
        // Failed all approaches
      }
    }

    if (!authenticatorOptionSelected) {
      throw new Error("Could not select authenticator app option using any method")
    }

    // Click the Continue button
    const continueButton = await safeOperation(() => page.$('button[type="submit"]'), null)
    if (!continueButton) {
      throw new Error("Continue button not found")
    }
    await safeOperation(() => continueButton.click(), null)

    // Wait for the OTP input form to load
    await safeOperation(
      () =>
        page.waitForSelector('input[name="code"], input[name="authenticatorCode"], input[type="text"]', {
          visible: true,
          timeout: 40000,
        }),
      null,
    )

    // Generate the TOTP code
    const totpCode = authenticator.generate(TOTP_SECRET)
    console.log("Generated TOTP code")

    // Enter the TOTP code
    const codeInputSelectors = ['input[name="code"]', 'input[name="authenticatorCode"]', 'input[type="text"]']

    let codeEntered = false

    for (const selector of codeInputSelectors) {
      try {
        const codeInput = await safeOperation(() => page.$(selector), null)
        if (codeInput) {
          await safeOperation(() => codeInput.type(totpCode), null)
          codeEntered = true
          break
        }
      } catch (error) {
        // Try next selector
      }
    }

    if (!codeEntered) {
      throw new Error("Could not enter TOTP code")
    }

    // Click submit button
    const submitButtonSelectors = [
      'button[type="submit"]',
      'button:has-text("Continue")',
      'button:has-text("Submit")',
      'button:has-text("Verify")',
      "button.btn-primary",
    ]

    let submitButtonClicked = false

    for (const selector of submitButtonSelectors) {
      try {
        const submitButton = await safeOperation(() => page.$(selector), null)
        if (submitButton) {
          await Promise.all([
            safeOperation(() => submitButton.click(), null),
            page.waitForNavigation({ waitUntil: "networkidle2", timeout: 40000 }).catch((err) => {
              console.log("Navigation timeout after submitting code, but this might be expected")
            }),
          ])
          submitButtonClicked = true
          break
        }
      } catch (error) {
        // Try next selector
      }
    }

    if (!submitButtonClicked) {
      throw new Error("Could not find or click submit button")
    }

    // Wait for post-2FA page to load
    try {
      await Promise.race([
        safeOperation(
          () =>
            page.waitForSelector(".top-applications, .av-dashboard, .dashboard-container", {
              timeout: 50000,
              visible: true,
            }),
          null,
        ),
        safeOperation(
          () =>
            page.waitForFunction(
              () => {
                const headings = Array.from(document.querySelectorAll("h1, h2, h3, h4, h5, h6"))
                return headings.some((h) => h.textContent?.includes("Cookie Consent & Preferences"))
              },
              { timeout: 50000 },
            ),
          null,
        ),
        safeOperation(
          () =>
            page.waitForSelector(".alert-danger, .error-message", {
              timeout: 50000,
              visible: true,
            }),
          null,
        ),
      ])

      const errorMessage = await safeOperation(() => page.$(".alert-danger, .error-message"), null)
      if (errorMessage) {
        const text = await safeOperation(() => page.evaluate((el) => el.textContent, errorMessage), "")
        throw new Error(`2FA resulted in error: ${text}`)
      }

      await delay(3000)
    } catch (error) {
      // Navigation timeout after 2FA, but this might be expected
    }

    const isLoggedInCheck = await safeOperation(
      () =>
        page.evaluate(() => {
          const dashboardElements =
            document.querySelector(".top-applications") !== null ||
            document.querySelector(".av-dashboard") !== null ||
            document.querySelector(".dashboard-container") !== null

          const cookieConsent = Array.from(document.querySelectorAll("h1, h2, h3, h4, h5, h6")).some((h) =>
            h.textContent?.includes("Cookie Consent & Preferences"),
          )

          return dashboardElements || cookieConsent
        }),
      false,
    )

    if (!isLoggedInCheck) {
      throw new Error("2FA verification failed - no dashboard elements found")
    }

    console.log("2FA authentication successful")
  } catch (error) {
    console.error("Error handling 2FA:", error)
    throw error
  }
}

async function handleCookieConsent(page: Page): Promise<void> {
  console.log("Checking for cookie consent popup...")
  try {
    await safeOperation(
      () =>
        page
          .waitForFunction(
            () => {
              const heading = Array.from(document.querySelectorAll("h1, h2, h3, h4, h5, h6")).find((el) =>
                el.textContent?.includes("Cookie Consent & Preferences"),
              )
              const acceptButton = document.querySelector(
                'button.primary-button, button:has-text("Accept All Cookies")',
              )
              return heading && acceptButton
            },
            { timeout: 3000 },
          )
          .catch(() => {
            // No cookie consent popup found within timeout
          }),
      null,
    )

    let accepted = false

    try {
      const acceptButtonSelector = 'button.primary-button, button:has-text("Accept All Cookies")'
      const acceptButton = await safeOperation(() => page.$(acceptButtonSelector), null)
      if (acceptButton) {
        await safeOperation(() => acceptButton.click(), null)
        await delay(500)
        accepted = true
      }
    } catch (error) {
      // Try next approach
    }

    if (!accepted) {
      try {
        accepted = await safeOperation(
          () =>
            page.evaluate(() => {
              const buttons = Array.from(document.querySelectorAll("button"))
              const acceptButton = buttons.find((button) =>
                button.textContent?.toLowerCase().includes("accept all cookies"),
              )
              if (acceptButton) {
                acceptButton.click()
                return true
              }
              return false
            }),
          false,
        )
        if (accepted) {
          await delay(500)
        }
      } catch (error) {
        // Try next approach
      }
    }

    if (!accepted) {
      try {
        await safeOperation(() => page.mouse.click(636, 636), null)
        await delay(500)
      } catch (error) {
        // Failed all approaches
      }
    }

    console.log("Cookie consent handled")
  } catch (error) {
    // Ignore cookie consent errors
  }
}

async function navigateToCareCentral(page: Page): Promise<void> {
  console.log("Navigating to Care Central...")
  try {
    // Wait for the dashboard to load
    await safeOperation(() => page.waitForSelector("body", { timeout: 50000, visible: true }), null)

    // Wait for a bit to ensure the page is fully loaded  { timeout: 50000, visible: true }), null)

    // Wait for a bit to ensure the page is fully loaded
    await delay(1000)

    // Look for "My Top Applications" heading first
    const myTopAppsHeadingSelectors = [
      'h1:has-text("My Top Applications")',
      'h2:has-text("My Top Applications")',
      'h3:has-text("My Top Applications")',
      'h4:has-text("My Top Applications")',
      'div:has-text("My Top Applications")',
      'span:has-text("My Top Applications")',
    ]

    let myTopAppsHeading = null
    for (const selector of myTopAppsHeadingSelectors) {
      try {
        myTopAppsHeading = await safeOperation(() => page.$(selector), null)
        if (myTopAppsHeading) {
          break
        }
      } catch (error) {
        // Try next selector
      }
    }

    // Now try to find Care Central by searching for all elements containing that text
    const careCentralElements = await safeOperation(
      () =>
        page.evaluate(() => {
          const allElements = Array.from(document.querySelectorAll("*"))
          return allElements
            .filter((el) => {
              const text = el.textContent || ""
              return text.includes("Care Central") && !text.includes("Care Central.")
            })
            .map((el) => {
              const rect = el.getBoundingClientRect()
              return {
                x: rect.x + rect.width / 2,
                y: rect.y + rect.height / 2,
                width: rect.width,
                height: rect.height,
                text: el.textContent,
                tagName: el.tagName,
                id: el.id,
              }
            })
        }),
      [],
    )

    // Try to click the most likely element (filter for reasonable size and position)
    let clicked = false
    for (const element of careCentralElements) {
      // Look for elements that are likely to be clickable tiles (reasonable size)
      if (element.width > 50 && element.height > 50) {
        try {
          await safeOperation(() => page.mouse.click(element.x, element.y), null)
          clicked = true

          // Wait a bit to see if navigation happens
          await delay(4000)

          // Check if we've navigated away from the dashboard
          const currentUrl = page.url()

          if (currentUrl.includes("care-central") || !currentUrl.includes("dashboard")) {
            break
          } else {
            clicked = false
          }
        } catch (error) {
          // Try next element
        }
      }
    }

    // If we still haven't clicked successfully, try a different approach
    if (!clicked) {
      // Try to find the Wellpoint image
      const wellpointImages = await safeOperation(
        () =>
          page.evaluate(() => {
            const images = Array.from(document.querySelectorAll("img"))
            return images
              .filter((img) => {
                const src = img.src || ""
                const alt = img.alt || ""
                return (
                  src.includes("wellpoint") ||
                  alt.includes("Wellpoint") ||
                  src.includes("Wellpoint") ||
                  alt.includes("wellpoint")
                )
              })
              .map((img) => {
                const rect = img.getBoundingClientRect()
                return {
                  x: rect.x + rect.width / 2,
                  y: rect.y + rect.height / 2,
                  width: rect.width,
                  height: rect.height,
                  src: img.src,
                  alt: img.alt,
                }
              })
          }),
        [],
      )

      // Try clicking on a Wellpoint image
      for (const img of wellpointImages) {
        try {
          await safeOperation(() => page.mouse.click(img.x, img.y), null)
          clicked = true
          await delay(4000)
          break
        } catch (error) {
          // Try next image
        }
      }
    }

    // Last resort - try clicking at fixed coordinates where Care Central is likely to be
    if (!clicked) {
      // Try a few different positions where Care Central might be
      const potentialPositions = [
        { x: 240, y: 400 },
        { x: 240, y: 430 },
        { x: 270, y: 400 },
        { x: 200, y: 400 },
      ]

      for (const pos of potentialPositions) {
        try {
          await safeOperation(() => page.mouse.click(pos.x, pos.y), null)
          await delay(4000)

          // Check if we've navigated away
          const currentUrl = page.url()
          if (currentUrl.includes("care-central") || !currentUrl.includes("dashboard")) {
            clicked = true
            break
          }
        } catch (error) {
          // Try next position
        }
      }
    }

    if (!clicked) {
      throw new Error("Failed to click on Care Central after trying multiple approaches")
    }

    // Wait for the iframe to load
    await safeOperation(() => page.waitForSelector("#newBodyFrame", { timeout: 40000 }), null)

    // Get all frames and find the one with name="newBody"
    const frames = page.frames()
    const newBodyFrame = frames.find((frame) => frame.name() === "newBody")

    if (!newBodyFrame) {
      throw new Error("Could not find newBody iframe")
    }

    // Wait for the form to load in the iframe
    await safeOperation(() => newBodyFrame.waitForSelector("form", { timeout: 40000 }), null)

    // Wait for the organization dropdown to be present in the iframe
    await safeOperation(() => newBodyFrame.waitForSelector("#organizations", { timeout: 40000 }), null)

    // Click on the organization dropdown
    await safeOperation(() => newBodyFrame.click("#organizations"), null)
    await delay(500)

    // Type the organization name
    await safeOperation(() => newBodyFrame.click("#organizations"), null)
    await delay(500)

    // Wait for and click the option
    await safeOperation(() => newBodyFrame.waitForSelector(".av-select", { visible: true, timeout: 30000 }), null)
    await safeOperation(() => newBodyFrame.click(".av-select"), null)

    // Look specifically for Harmony Health LLC option
    const harmonyOption = await safeOperation(
      () =>
        newBodyFrame.evaluate(() => {
          const options = Array.from(document.querySelectorAll(".av__option"))
          const harmonyOption = options.find(
            (option) => option.textContent && option.textContent.includes("Harmony Health LLC"),
          )
          return harmonyOption ? true : false
        }),
      false,
    )

    if (harmonyOption) {
      // Click on the Harmony Health LLC option
      await safeOperation(
        () =>
          newBodyFrame.evaluate(() => {
            const options = Array.from(document.querySelectorAll(".av__option"))
            const harmonyOption = options.find(
              (option) => option.textContent && option.textContent.includes("Harmony Health LLC"),
            )
            if (harmonyOption) {
              ;(harmonyOption as HTMLElement).click()
            }
          }),
        null,
      )
    } else {
      // If Harmony Health LLC not found, click the first option
      await safeOperation(() => newBodyFrame.click(".av__option"), null)
    }

    // Wait for provider field to become enabled
    // Click and select provider
    await safeOperation(() => newBodyFrame.click("#providerName"), null)
    await delay(500)

    // Wait for dropdown options to appear
    await safeOperation(() => newBodyFrame.waitForSelector(".av__option", { visible: true, timeout: 30000 }), null)

    // Look specifically for Harmony Health provider option
    const harmonyProviderOption = await safeOperation(
      () =>
        newBodyFrame.evaluate(() => {
          const options = Array.from(document.querySelectorAll(".av__option"))
          const harmonyOption = options.find(
            (option) =>
              option.textContent &&
              (option.textContent.includes("Harmony Health") || option.textContent.includes("HARMONY HEALTH")),
          )
          return harmonyOption ? true : false
        }),
      false,
    )

    if (harmonyProviderOption) {
      // Click on the Harmony Health provider option
      await safeOperation(
        () =>
          newBodyFrame.evaluate(() => {
            const options = Array.from(document.querySelectorAll(".av__option"))
            const harmonyOption = options.find(
              (option) =>
                option.textContent &&
                (option.textContent.includes("Harmony Health") || option.textContent.includes("HARMONY HEALTH")),
            )
            if (harmonyOption) {
              ;(harmonyOption as HTMLElement).click()
            }
          }),
        null,
      )
    } else {
      // If Harmony Health not found, click the first option
      await safeOperation(() => newBodyFrame.click(".av__option"), null)
    }

    // Wait for selection to be processed
    await delay(500)

    // Click the Next button
    await safeOperation(() => newBodyFrame.click("button.btn.btn-primary"), null)

    // Wait for navigation
    try {
      await page.waitForNavigation({ waitUntil: "networkidle0", timeout: 30000 })
    } catch (navError) {
      // Navigation timeout after Next, but this might be expected
      console.log("Navigation timeout after clicking Next, continuing anyway")
    }

    // Now we need to click on the Referrals button inside the iframe
    // Get the updated frames after navigation
    const updatedFrames = page.frames()
    const updatedNewBodyFrame = updatedFrames.find((frame) => frame.name() === "newBody")

    if (!updatedNewBodyFrame) {
      throw new Error("Could not find newBody iframe after navigation")
    }

    // Store the current frame for future use
    currentFrame = updatedNewBodyFrame

    // Look for the Referrals button with data-id="referral"
    try {
      // Wait for the button to be visible
      await safeOperation(
        () => currentFrame!.waitForSelector('button[data-id="referral"]', { visible: true, timeout: 10000 }),
        null,
      )

      // Click the Referrals button
      await safeOperation(() => currentFrame!.click('button[data-id="referral"]'), null)

      // Wait for the page to update after clicking
      await delay(4000)
    } catch (error) {
      // Try alternative approach - evaluate and click directly in the frame
      const clicked = await safeOperation(
        () =>
          currentFrame!.evaluate(() => {
            const buttons = Array.from(document.querySelectorAll("button"))
            const referralButton = buttons.find(
              (button) => button.textContent && button.textContent.includes("Referrals"),
            )
            if (referralButton) {
              ;(referralButton as HTMLElement).click()
              return true
            }
            return false
          }),
        false,
      )

      if (!clicked) {
        throw new Error("Could not find Referrals button by text")
      }

      // Wait for the page to update
      await delay(4000)
    }

    // Now extract member information from the referrals page
    await extractMemberInformation(currentFrame)
  } catch (error) {
    console.error("Error navigating to Care Central:", error)
    currentFrame = null
    isLoggedIn = false
    throw error
  }
}

// Function to extract member information from the referrals page
async function extractMemberInformation(frame: Frame): Promise<MemberData[]> {
  console.log("Extracting member information from referrals page...")
  try {
    // Wait for the referrals content to load
    await safeOperation(
      () =>
        frame.waitForSelector(".incoming-referral-info", { timeout: 15000 }).catch(async () => {
          // If no referrals are found, send a notification and start monitoring
          console.log("No members found in referrals page.")

          // Send email notification that no members were found
          // await sendEmail(
          //   "Availity Referrals Monitoring Active",
          //   "No members were found in the referrals section at this time.\n\n" +
          //     "The monitoring system is active and will check for new members every 10 seconds.\n\n" +
          //     "You will receive an email notification as soon as a new member is detected.",
          // )

          // Start continuous monitoring
          await startContinuousMonitoring(frame)

          return []
        }),
      null,
    )

    // If referrals are found, extract member information
    const members = await extractMembersFromFrame(frame)

    // Save members to database
    await saveMembersToDatabase(members)

    // Start continuous monitoring for new referrals
    await startContinuousMonitoring(frame)

    return members
  } catch (error) {
    console.error("Error extracting member information:", error)
    return []
  }
}

// Helper function to extract members from the frame
async function extractMembersFromFrame(frame: Frame): Promise<MemberData[]> {
  try {
    return await safeOperation(
      () =>
        frame.evaluate(() => {
          const results: Array<{
            memberName: string
            memberID: string
            serviceName: string
            status: string
            county: string
            requestDate: string
            additionalInfo: string
          }> = []

          // Find all referral info containers
          const referralContainers = document.querySelectorAll(".incoming-referral-info")

          if (referralContainers.length === 0) {
            return results
          }

          // Process each referral container
          referralContainers.forEach((container) => {
            try {
              // Extract member name
              const memberNameElement = container.querySelector(".memName")
              const memberName =
                memberNameElement && memberNameElement.textContent ? memberNameElement.textContent.trim() : "Unknown"

              // Extract service
              const serviceElement = container.querySelector(".serviceCol")
              const serviceName = serviceElement && serviceElement.textContent ? serviceElement.textContent.trim() : ""

              // Extract region
              const regionElement = container.querySelector(".regionCol")
              const region = regionElement && regionElement.textContent ? regionElement.textContent.trim() : ""

              // Extract county
              const countyElement = container.querySelector(".countyCol")
              const county = countyElement && countyElement.textContent ? countyElement.textContent.trim() : ""

              // Extract program
              const programElement = container.querySelector(".programCol")
              const program = programElement && programElement.textContent ? programElement.textContent.trim() : ""

              // Extract status
              const statusElement = container.querySelector(".statusCol .badge")
              const status = statusElement && statusElement.textContent ? statusElement.textContent.trim() : ""

              // Extract referral number from more details section
              const moreDetailsSection = container.querySelector(".more-detail-section")
              let referralNumber = ""
              let requestDate = ""
              let yearOfBirth = ""
              let zipCode = ""

              if (moreDetailsSection) {
                // Find all detail rows
                const detailRows = moreDetailsSection.querySelectorAll(".d-flex")

                detailRows.forEach((row) => {
                  // Look for Referral # field
                  const headers = row.querySelectorAll(".moreDetailsHeader")
                  const data = row.querySelectorAll(".moreDetailsData")

                  for (let i = 0; i < headers.length; i++) {
                    const headerElement = headers[i]
                    const dataElement = i < data.length ? data[i] : null

                    const headerText =
                      headerElement && headerElement.textContent ? headerElement.textContent.trim() : ""
                    const dataText = dataElement && dataElement.textContent ? dataElement.textContent.trim() : ""

                    if (headerText.includes("Referral #")) {
                      referralNumber = dataText
                    }

                    if (headerText.includes("Requested On")) {
                      requestDate = dataText
                    }

                    if (headerText.includes("Year of Birth")) {
                      yearOfBirth = dataText
                    }

                    if (headerText.includes("Zip Code")) {
                      zipCode = dataText
                    }
                  }
                })
              }

              // Create member data object
              const memberData = {
                memberName,
                memberID: referralNumber || `unknown-${Date.now()}`, // Using referral number as member ID, with fallback
                serviceName,
                status,
                county,
                requestDate,
                additionalInfo: `Region: ${region}, County: ${county}, Program: ${program}, YOB: ${yearOfBirth}, Zip: ${zipCode}`,
              }

              results.push(memberData)
            } catch (err) {
              // Skip this container if there's an error
            }
          })

          return results
        }),
      [],
    )
  } catch (error) {
    console.error("Error extracting members from frame:", error)
    return []
  }
}

// Function to save members to database
async function saveMembersToDatabase(members: MemberData[]): Promise<void> {
  try {
    for (const member of members) {
      // Check if member already exists in database using safeDbOperation
      const existingMember = await safeDbOperation(
        () =>
          Referral.findOne({
            memberID: member.memberID,
            memberName: member.memberName,
          }),
        null,
      )

      if (!existingMember) {
        console.log(`Adding new member to database: ${member.memberName} (${member.memberID})`)

        // Create new referral record using safeDbOperation
        const newReferral = await safeDbOperation(
          () =>
            Referral.create({
              memberName: member.memberName,
              memberID: member.memberID,
              serviceName: member.serviceName || "",
              status: member.status || "",
              county: member.county || "",
              requestOn: member.requestDate || new Date().toISOString(),
              isNotified: true, // Mark as notified immediately when creating
            }),
          null,
        )

        if (newReferral) {
          // Create notification using safeDbOperation
          await safeDbOperation(
            () =>
              Notification.create({
                referralId: newReferral._id,
                memberName: member.memberName,
                memberID: member.memberID,
                message: `Member found in referrals: ${member.memberName} (${member.serviceName || "No service specified"})`,
              }),
            null,
          )

          // Send SMS notification for new member
          await sendSMS(
            `New member in referrals: ${member.memberName} (${member.memberID}). Check dashboard for details.`,
          )
        }
      } else if (existingMember && !existingMember.isNotified) {
        // If the member exists but hasn't been notified yet, mark as notified
        existingMember.isNotified = true
        await safeDbOperation(() => existingMember.save(), null)

        console.log(`Marked existing member as notified: ${member.memberName} (${member.memberID})`)
      }
    }
  } catch (error) {
    console.error("Error saving members to database:", error)
    // Continue even if database operations fail
  }
}

// Update the processNewMembers function to use safeDbOperation
async function processNewMembers(members: MemberData[]): Promise<void> {
  console.log("Processing new members...")
  try {
    // We'll use the database to check which members have already been notified about
    const unnotifiedMembers = []

    for (const member of members) {
      // Check if this referral has already been notified about using safeDbOperation
      const existingReferral = await safeDbOperation(
        () =>
          Referral.findOne({
            memberID: member.memberID,
            memberName: member.memberName,
            isNotified: true,
          }),
        null,
      )

      if (!existingReferral) {
        unnotifiedMembers.push(member)
      }
    }

    if (unnotifiedMembers.length === 0) {
      console.log("All new members have already been notified about, skipping notifications")
      return
    }

    // Rest of the function remains the same...

    // Save to database
    await saveMembersToDatabase(unnotifiedMembers)

    // Send email notification
    let emailContent = "New Referrals Detected:\n\n"

    unnotifiedMembers.forEach((member, index) => {
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

      if (member.requestDate) {
        emailContent += `Request Date: ${member.requestDate}\n`
      }

      emailContent += "\n"
    })

    await sendEmail("New Availity Referrals Detected", emailContent)
    console.log("Email notification sent for new members")

    // Send SMS for each new member
    for (const member of unnotifiedMembers) {
      await sendSMS(`New referral detected: ${member.memberName} (${member.memberID}). Check dashboard for details.`)
    }
    console.log("SMS notifications sent for new members")
  } catch (error) {
    console.error("Error processing new members:", error)
    // Continue even if notification fails
  }
}

async function startContinuousMonitoring(frame: Frame): Promise<void> {
  if (isMonitoring) {
    console.log("Monitoring already active, skipping setup")
    return // Already monitoring
  }

  console.log("Starting continuous monitoring for new referrals")
  isMonitoring = true

  // Store the current members for comparison
  currentMembers = await extractMembersFromFrame(frame)
  console.log(`Initial monitoring state: ${currentMembers.length} members`)

  // Set up the interval to check for new referrals every 30 seconds
  monitoringInterval = setInterval(async () => {
    try {
      console.log("Checking for new referrals...")

      // Check if browser needs to be restarted
      await checkBrowserHealth()

      // Create a unique request ID for this monitoring check
      const requestId = `monitor-${Date.now()}`

      // Check if this request is already in progress
      if (pendingRequests.has(requestId)) {
        console.log(`Monitoring request ${requestId} is already in progress, skipping`)
        return
      }

      // Add this request to pending requests
      pendingRequests.add(requestId)

      try {
        // Verify the frame is still valid
        try {
          await frame.evaluate(() => document.title)
        } catch (frameError) {
          console.log("Frame is no longer valid, attempting to recover...")
          throw new Error("detached Frame")
        }

        // Click on the "incoming" tab to refresh the data
        console.log("Clicking on 'incoming' tab to refresh data...")

        // Try multiple selectors to find the incoming tab
        const incomingTabSelectors = [
          'button:has-text("Incoming")',
          'a:has-text("Incoming")',
          'div:has-text("Incoming")',
          'span:has-text("Incoming")',
          'li:has-text("Incoming")',
          'tab:has-text("Incoming")',
          '.nav-item:has-text("Incoming")',
          '.nav-link:has-text("Incoming")',
        ]

        let tabClicked = false

        // Try each selector
        for (const selector of incomingTabSelectors) {
          try {
            const elements = await safeOperation(() => frame.$$(selector), [])
            for (const element of elements) {
              try {
                // Check if this element is visible and contains only the text "Incoming"
                const isRelevant = await safeOperation(
                  () =>
                    element.evaluate((el) => {
                      const text = el.textContent?.trim()
                      return text === "Incoming" || text === "INCOMING"
                    }),
                  false,
                )

                if (isRelevant) {
                  await safeOperation(() => element.click(), null)
                  tabClicked = true
                  console.log("Successfully clicked on 'incoming' tab")
                  break
                }
              } catch (elementError) {
                // Continue to next element
              }
            }
            if (tabClicked) break
          } catch (error) {
            // Try next selector and try again
          }
        }

        // If we couldn't find the tab by text, try finding it by position or other attributes
        if (!tabClicked) {
          // Try to find tabs/navigation elements and click the first one (assuming it's "Incoming"), yeah
          try {
            const navElements = await safeOperation(
              () => frame.$$(".nav-tabs .nav-item, .nav-tabs .nav-link, .nav .nav-item, .nav .nav-link"),
              [],
            )
            if (navElements.length > 0) {
              await safeOperation(() => navElements[0].click(), null)
              tabClicked = true
              console.log("Clicked on first tab (assuming it's 'incoming')")
            }
          } catch (error) {
            console.log("Could not find navigation elements")
          }
        }

        if (!tabClicked) {
          console.log("Could not find and click 'incoming' tab with any method")
        }

        // Wait a moment for the page to update after clicking
        await delay(2000)

        // Extract the current members from the frame
        const newMembers = await extractMembersFromFrame(frame)
        console.log(`Found ${newMembers.length} members, comparing with previous ${currentMembers.length} members`)

        // Compare with previous members to find new ones
        const addedMembers = findNewMembers(currentMembers, newMembers)

        // If new members are found, process them
        if (addedMembers.length > 0) {
          console.log(`Found ${addedMembers.length} new members!`)
          // Send notifications for new members
          await processNewMembers(addedMembers)
        } else {
          console.log("No new members found")
        }

        // Update the current members list
        currentMembers = newMembers
      } finally {
        // Always remove the request from pending requests
        pendingRequests.delete(requestId)
      }
    } catch (error) {
      console.error("Error during monitoring check:", error)

      // Check if the frame is detached
      if (error instanceof Error && error.message.includes("detached Frame")) {
        console.log("Frame is detached, attempting to recover...")

        // Stop the current monitoring
        if (monitoringInterval) {
          clearInterval(monitoringInterval)
          monitoringInterval = null
        }

        isMonitoring = false
        isLoggedIn = false
        currentFrame = null

        // Try to re-login and restart monitoring
        try {
          await loginToAvaility()
        } catch (loginError) {
          console.error("Failed to recover after frame detachment:", loginError)

          // Send notification about the error
          try {
            // await sendEmail(
            //   "Availity Bot Recovery",
            //   `The Availity monitoring bot needs to briefly restart ${new Date().toLocaleString()}.\n\n` +
            //     `You can just ignore: ${loginError}\n\n` +
            //     `The application will restart and continue monitoring.\n\n` +
            //     `This is an automated message from the monitoring system.`,
            // )
          } catch (emailError) {
            console.error("Failed to send error notification email:", emailError)
          }
        }
      } else if (error instanceof Error && error.message.includes("Request is already handled")) {
        // This is a common error that can be safely ignored
        console.log("Request is already handled error, continuing monitoring")
        requestAlreadyHandledErrors++
      }
    }
  }, MONITORING_INTERVAL_MS) // Check every 10 seconds

  console.log(`Monitoring interval set up for every ${MONITORING_INTERVAL_MS / 1000} seconds`)
}

// Helper function to find new members by comparing two arrays
function findNewMembers(oldMembers: MemberData[], newMembers: MemberData[]): MemberData[] {
  return newMembers.filter(
    (newMember) =>
      !oldMembers.some(
        (oldMember) => oldMember.memberID === newMember.memberID && oldMember.memberName === newMember.memberName,
      ),
  )
}

// Process new members that were found
// async function processNewMembers(members: MemberData[]): Promise<void> {
//   console.log("Processing new members...")
//   try {
//     // We'll use the database to check which members have already been notified about
//     const unnotifiedMembers = []

//     for (const member of members) {
//       // Check if this referral has already been notified about
//       const existingReferral = await Referral.findOne({
//         memberID: member.memberID,
//         memberName: member.memberName,
//         isNotified: true,
//       })

//       if (!existingReferral) {
//         unnotifiedMembers.push(member)
//       }
//     }

//     if (unnotifiedMembers.length === 0) {
//       console.log("All new members have already been notified about, skipping notifications")
//       return
//     }

//     // Save to database
//     await saveMembersToDatabase(unnotifiedMembers)

//     // Send email notification
//     let emailContent = "New Referrals Detected:\n\n"

//     unnotifiedMembers.forEach((member, index) => {
//       emailContent += `Member ${index + 1}:\n`
//       emailContent += `Name: ${member.memberName}\n`
//       emailContent += `ID: ${member.memberID}\n`

//       if (member.serviceName) {
//         emailContent += `Service: ${member.serviceName}\n`
//       }

//       if (member.status) {
//         emailContent += `Status: ${member.status}\n`
//       }

//       if (member.county) {
//         emailContent += `County: ${member.county}\n`
//       }

//       if (member.requestDate) {
//         emailContent += `Request Date: ${member.requestDate}\n`
//       }

//       emailContent += "\n"
//     })

//     await sendEmail("New Availity Referrals Detected", emailContent)
//     console.log("Email notification sent for new members")

//     // Send SMS for each new member
//     for (const member of unnotifiedMembers) {
//       await sendSMS(`New referral detected: ${member.memberName} (${member.memberID}). Check dashboard for details.`)
//     }
//     console.log("SMS notifications sent for new members")
//   } catch (error) {
//     console.error("Error processing new members:", error)
//     // Continue even if notification fails
//   }
// }

// Update the checkForNewReferrals function to use safeDbOperation
export async function checkForNewReferrals(): Promise<void> {
  // Create a unique request ID for this API check
  const requestId = `api-check-${Date.now()}`

  // Check if this request is already in progress
  if (pendingRequests.has(requestId)) {
    console.log(`API check request ${requestId} is already in progress, skipping`)
    return
  }

  // Add this request to pending requests
  pendingRequests.add(requestId)

  console.log("Starting API-based check for new referrals...")
  try {
    // Check if browser needs to be restarted
    await checkBrowserHealth()

    // Only login if we're not already logged in
    if (!isLoggedIn || !currentFrame) {
      console.log("Not logged in, initiating login process...")
      const loginSuccess = await loginToAvaility()
      if (!loginSuccess) {
        throw new Error("Failed to login to Availity")
      }
    } else {
      console.log("Already logged in, skipping login process")
    }

    // Get session cookies
    const cookies = await getSessionCookies()

    // Extract XSRF token
    const xsrfToken = extractXsrfToken(cookies)

    // Make API request to fetch referrals
    console.log("Making API request to fetch referrals...")
    try {
      const response = await axios.post<ReferralResponse>(
        REFERRALS_API_URL,
        {
          brand: "WLP",
          npi: "1184328189",
          papi: "",
          state: "TN",
          tabStatus: "INCOMING",
          taxId: "922753606",
        },
        {
          headers: {
            Cookie: cookies,
            "Content-Type": "application/json",
            "X-XSRF-TOKEN": xsrfToken,
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36",
            Referer: "https://apps.availity.com/public/apps/care-central/",
          },
        },
      )

      const currentTime = new Date()
      console.log(`Retrieved ${response.data.referrals.length} referrals from API`)

      // Process each referral from the API
      for (const referral of response.data.referrals) {
        // Check if referral already exists in database using safeDbOperation
        const existingReferral = await safeDbOperation(
          () =>
            Referral.findOne({
              memberID: referral.memberID,
              requestOn: referral.requestOn,
            }),
          null,
        )

        if (!existingReferral) {
          // Save the new referral using safeDbOperation
          const savedReferral = await safeDbOperation(
            () =>
              Referral.create({
                ...referral,
                isNotified: true, // Mark as notified immediately when creating
              }),
            null,
          )

          if (savedReferral) {
            // Create notification using safeDbOperation
            await safeDbOperation(
              () =>
                Notification.create({
                  referralId: savedReferral._id,
                  memberName: referral.memberName,
                  memberID: referral.memberID,
                  message: `New referral for ${referral.memberName} (${referral.serviceName}) received on ${referral.requestOn}`,
                }),
              null,
            )

            // Send email notification
            await sendEmail(
              "New Referral Notification",
              `New referral received for ${referral.memberName} (ID: ${referral.memberID}).\n\n` +
                `Service: ${referral.serviceName}\n` +
                `Region: ${referral.regionName}\n` +
                `County: ${referral.county}\n` +
                `Plan: ${referral.plan}\n` +
                `Preferred Start Date: ${referral.preferredStartDate}\n` +
                `Status: ${referral.status}`,
            )

            // Send SMS notification
            await sendSMS(
              `New referral: ${referral.memberName} (${referral.memberID}) for ${referral.serviceName}. Check dashboard for details.`,
            )
          }
        }
      }

      // Update last check time
      lastCheckTime = currentTime
    } catch (axiosError) {
      if (axios.isAxiosError(axiosError)) {
        const error = axiosError as AxiosError

        // Check for rate limiting (503 Service Unavailable)
        if (error.response && error.response.status === 503) {
          console.log("API rate limit exceeded. Will retry after delay.")

          // Get retry delay from header if available
          const retryDelay = error.response?.headers?.["x-availity-api-retry-delay-sec"]
          const delayMs = retryDelay ? Number.parseInt(retryDelay as string) * 1000 : API_RETRY_DELAY_MS

          console.log(`Waiting ${delayMs / 1000} seconds before retrying...`)

          // Don't throw, just log and continue
          return
        }

        // Check for authentication errors
        if (error.response && (error.response.status === 401 || error.response.status === 403)) {
          console.log("Authentication error. Clearing session and will re-login on next check.")

          // Clear browser session
          await closeBrowser()
          browser = null
          page = null
          isLoggedIn = false
          currentFrame = null
        }

        throw error
      }
      throw axiosError
    }
  } catch (error) {
    console.error("Error checking for new referrals:", error)
    // No error email - just log the error
  } finally {
    // Always remove the request from pending requests
    pendingRequests.delete(requestId)
  }
}

function extractXsrfToken(cookies: string): string {
  const match = cookies.match(/XSRF-TOKEN=([^;]+)/)
  return match ? match[1] : ""
}

// Function to start the monitoring process
export async function startReferralMonitoring(): Promise<void> {
  console.log("🚀 Starting referral monitoring process with 30-second interval...")
  console.log(`⏰ Current time: ${new Date().toISOString()}`)

  // Initial check
  try {
    console.log("📊 Performing initial referral check (#0)...")
    await checkForNewReferrals()
    console.log(`✅ Initial check completed successfully at ${new Date().toISOString()}`)
  } catch (error) {
    console.error("❌ Error in initial referral check:", error)
    // Retry on error
    try {
      console.log("🔄 Retrying initial check after error...")
      await closeBrowser()
      await delay(5000)
      await checkForNewReferrals()
      console.log("✅ Retry successful")
    } catch (retryError) {
      console.error("❌ Retry failed:", retryError)
      // No error email - just log the error
    }
  }

  // Set up interval for API-based checks every 30 seconds
  console.log(`⏱️ Setting up scheduled checks every 30 seconds...`)

  // Use a named function for the interval callback for better debugging
  const performScheduledCheck = async () => {
    const startTime = new Date()
    console.log(`⏳ Running scheduled API check at ${startTime.toISOString()}...`)

    try {
      await checkForNewReferrals()
      const endTime = new Date()
      const duration = (endTime.getTime() - startTime.getTime()) / 1000
      console.log(`✅ Scheduled check completed successfully in ${duration.toFixed(2)} seconds`)
    } catch (error) {
      console.error(`❌ Error in scheduled API check:`, error)

      // Retry on error
      try {
        console.log(`🔄 Retrying scheduled check after error...`)
        await closeBrowser()
        await delay(5000)
        await checkForNewReferrals()
        console.log(`✅ Retry successful`)
      } catch (retryError) {
        console.error(`❌ Scheduled check retry failed:`, retryError)
        // No error email - just log the error
      }
    }

    // Log next scheduled check time
    const nextCheckTime = new Date(Date.now() + MONITORING_INTERVAL_MS)
    console.log(`🔔 Next check scheduled for ${nextCheckTime.toISOString()}`)
  }

  // Use setInterval with the exact millisecond value (30000 ms = 30 seconds)
  const intervalId = setInterval(performScheduledCheck, MONITORING_INTERVAL_MS)

  console.log(`🔔 Monitoring setup complete - checking every 30 seconds`)
  console.log(`⏰ Next check scheduled for ${new Date(Date.now() + MONITORING_INTERVAL_MS).toISOString()}`)

  // Add a function to stop monitoring if needed
  process.on("SIGINT", () => {
    console.log("🛑 Stopping monitoring due to application shutdown...")
    clearInterval(intervalId)
    closeBrowser().then(() => {
      console.log("✅ Monitoring stopped and browser closed successfully")
      process.exit(0)
    })
  })
}

// Stop monitoring when needed
export function stopReferralMonitoring(): void {
  if (monitoringInterval) {
    clearInterval(monitoringInterval)
    monitoringInterval = null
    console.log("Referral monitoring stopped")
  }
  isMonitoring = false
}

// Add a watchdog timer that restarts the browser if it detects issues
export function setupWatchdog(): void {
  const WATCHDOG_INTERVAL_MS = 300000 // 5 minutes
  const MAX_INACTIVITY_MS = 600000 // 10 minutes

  let watchdogInterval: NodeJS.Timeout | null = null
  let lastSuccessfulOperation = new Date()
  let consecutiveErrors = 0

  // Clear any existing watchdog interval
  if (watchdogInterval) {
    clearInterval(watchdogInterval)
  }

  watchdogInterval = setInterval(async () => {
    try {
      console.log("Watchdog check running...")

      // Check if there have been too many consecutive errors
      if (consecutiveErrors >= 5) {
        console.log(`Too many consecutive errors (${consecutiveErrors}), forcing restart...`)
        await forceRestart()
        return
      }

      // Check if the bot has been inactive for too long
      const now = new Date()
      const inactivityTime = now.getTime() - lastSuccessfulOperation.getTime()

      if (inactivityTime > MAX_INACTIVITY_MS) {
        console.log(`Bot has been inactive for ${inactivityTime / 1000} seconds, forcing restart...`)
        await forceRestart()
        return
      }

      // Check if browser is still responsive
      if (browser && page) {
        try {
          // Try a simple operation to see if the browser is responsive
          await page.evaluate(() => document.title)
          console.log("Browser is responsive")
          lastSuccessfulOperation = new Date()
          consecutiveErrors = 0
        } catch (error) {
          console.log("Browser appears to be unresponsive, restarting...")
          consecutiveErrors++
          await forceRestart()
          return
        }
      } else if (!browser || !page) {
        console.log("Browser or page is null, restarting...")
        consecutiveErrors++
        await forceRestart()
        return
      }

      // Check if the frame is still valid
      if (currentFrame) {
        try {
          await currentFrame.evaluate(() => document.title)
          console.log("Frame is responsive")
          lastSuccessfulOperation = new Date()
        } catch (error) {
          console.log("Frame is no longer valid, restarting...")
          consecutiveErrors++
          await forceRestart()
          return
        }
      }

      // Check for too many "Request is already handled" errors
      if (requestAlreadyHandledErrors > MAX_REQUEST_ALREADY_HANDLED_ERRORS) {
        console.log(`Too many "Request is already handled" errors (${requestAlreadyHandledErrors}), forcing restart...`)
        requestAlreadyHandledErrors = 0
        await forceRestart()
        return
      }

      console.log("Watchdog check completed successfully")
    } catch (error) {
      console.error("Error in watchdog:", error)
      consecutiveErrors++
      // If the watchdog itself errors, try to restart
      try {
        await forceRestart()
      } catch (restartError) {
        console.error("Failed to restart after watchdog error:", restartError)
      }
    }
  }, WATCHDOG_INTERVAL_MS)

  console.log(`Watchdog timer set up to check every ${WATCHDOG_INTERVAL_MS / 1000} seconds`)
}

export async function sendStillAliveNotification(): Promise<void> {
  try {
    const uptime = process.uptime()
    const uptimeHours = Math.floor(uptime / 3600)
    const uptimeMinutes = Math.floor((uptime % 3600) / 60)

    // Get the current time to determine which status email this is
    const now = new Date()
    const hour = now.getHours()
    let timeOfDay = "Status Update"

    if (hour >= 0 && hour < 6) {
      timeOfDay = "Midnight Status"
    } else if (hour >= 6 && hour < 12) {
      timeOfDay = "Morning Status"
    } else if (hour >= 12 && hour < 18) {
      timeOfDay = "Afternoon Status"
    } else {
      timeOfDay = "Evening Status"
    }

    // Check if we've already sent this type of status today
    const statusType = timeOfDay.toLowerCase().split(" ")[0] // "morning", "afternoon", etc.
    const today = now.toISOString().split("T")[0] // YYYY-MM-DD format

    const existingStatus = await StatusLog.findOne({ type: statusType, date: today })

    if (existingStatus) {
      console.log(`Already sent ${statusType} status today at ${existingStatus.sentAt.toLocaleString()}, skipping`)
      return
    }

    const message =
      `Hi, just wanted to let you know I'm still active, up and running!\n\n` +
      `Current time: ${new Date().toLocaleString()}\n` +
      `Bot version: ${BOT_VERSION}\n\n` +
      `Current status:\n` +
      `- Browser initialized: ${browser !== null}\n` +
      `- Logged in: ${isLoggedIn}\n` +
      `- Monitoring active: ${isMonitoring}\n` +
      `- Members being monitored: ${currentMembers.length}\n\n` +
      `This is an automated status update from your Availity monitoring bot.`

    await sendEmail(`Availity Bot ${timeOfDay}`, message)
    console.log(`Sent '${timeOfDay}' notification email`)

    // Log this status in the database
    await StatusLog.create({
      type: statusType,
      sentAt: now,
      date: today,
    })
  } catch (error) {
    console.error("Failed to send 'still alive' notification:", error)
  }
}

