// import puppeteer, { type Browser, type Page, type Frame } from "puppeteer"
// import axios, { type AxiosError } from "axios"
// import { authenticator } from "otplib"
// import { config } from "dotenv"
// import { sendEmail } from "./email"
// import { sendSMS } from "./sms"
// import { Referral } from "../models/referrals"
// import { Notification } from "../models/notification"

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
// let pendingRequests = new Set<string>() // Track pending requests to prevent duplicates

// // Constants
// const AVAILITY_URL = "https://apps.availity.com"
// const LOGIN_URL = "https://apps.availity.com/availity/web/public.elegant.login"
// const REFERRALS_API_URL = "https://apps.availity.com/api/v1/proxy/anthem/provconn/v1/carecentral/ltss/referral/details"
// const TOTP_SECRET = process.env.TOTP_SECRET || "RU4SZCAW4UESMUQNCG3MXTWKXA"
// const MONITORING_INTERVAL_MS = 30000 // 30 seconds
// const API_RETRY_DELAY_MS = 60000 // 60 seconds (based on Availity's retry header)

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
// interface MemberData {
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
// async function retryOperation(operation: () => Promise<void>, retries = 3, delayMs = 1000) {
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

// export async function getSessionCookies(): Promise<string> {
//   if (!page) {
//     throw new Error("Page not initialized")
//   }

//   const cookies = await page.cookies()
//   return cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join("; ")
// }

// export async function closeBrowser(): Promise<void> {
//   if (browser) {
//     await browser.close()
//     browser = null
//     page = null
//     currentFrame = null
//     isLoggedIn = false
//     console.log("Browser closed successfully")
//   }
// }

// export async function setupBot(): Promise<void> {
//   try {
//     // If browser is already initialized, don't create a new one
//     if (browser && page) {
//       console.log("Browser already initialized, skipping setup")
//       return
//     }
    
//     browser = await puppeteer.launch({
//       headless: true,
//       // headless: "new" as any,
//       args: [
//         "--no-sandbox",
//         "--disable-setuid-sandbox",
//         "--disable-dev-shm-usage",
//         "--disable-accelerated-2d-canvas",
//         "--no-first-run",
//         "--no-zygote",
//         "--single-process",
//         "--disable-gpu",
//       ],

//       defaultViewport: { width: 1280, height: 800 },
//       timeout: 50000,
//     })

//     console.log("✅ Browser launched successfully")

//     // Create a new page
//     page = await browser.newPage()

//     // Set viewport size
//     await page.setViewport({ width: 1280, height: 800 })

//     // Add additional configurations
//     await page.setDefaultNavigationTimeout(50000)
//     await page.setDefaultTimeout(50000)

//     // Enable request interception to optimize performance
//     await page.setRequestInterception(true)
//     page.on("request", (request) => {
//       // Block unnecessary resources to speed up page loading
//       const resourceType = request.resourceType()
//       if (resourceType === "image" || resourceType === "font" || resourceType === "media") {
//         request.abort()
//       } else {
//         request.continue()
//       }
//     })

//     console.log("✅ Bot setup completed")
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
//         const closeButtons = await page.$$(selector)
//         for (const button of closeButtons) {
//           const isVisible = await button.evaluate((el) => {
//             const style = window.getComputedStyle(el)
//             return style.display !== "none" && style.visibility !== "hidden" && style.opacity !== "0"
//           })

//           if (isVisible) {
//             await button.click()
//             await delay(300)
//           }
//         }
//       } catch (error) {
//         // Continue to next selector
//       }
//     }

//     const modalSelectors = [".modal.show", ".dialog.show", '[role="dialog"]', '[aria-modal="true"]']

//     for (const selector of modalSelectors) {
//       try {
//         const modals = await page.$$(selector)
//         for (const modal of modals) {
//           const closeButton = await modal.$('button:has-text("×"), button.close, button[aria-label="Close"]')
//           if (closeButton) {
//             await closeButton.click()
//             await delay(300)
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
  
//   console.log("Starting Availity login process...")

//   try {
//     // Check if we're already logged in and have a valid frame for monitoring
//     if (isLoggedIn && currentFrame) {
//       console.log("Already logged in and on referrals page, skipping login process")
//       pendingRequests.delete(requestId)
//       return true
//     }

//     if (!browser || !page) {
//       console.log("Browser or page not initialized. Setting up bot...")
//       await setupBot()
//     }

//     if (!page) {
//       throw new Error("Browser page not initialized")
//     }

//     console.log("Navigating to Availity login page...")
//     await page.goto(LOGIN_URL, { waitUntil: "networkidle2" })

//     // Enter username and password
//     console.log("Entering credentials...")
//     await page.type("#userId", process.env.AVAILITY_USERNAME || "")
//     await page.type("#password", process.env.AVAILITY_PASSWORD || "")

//     // Click login button
//     await page.click('button[type="submit"]')

//     // Wait for either navigation to complete or for 2FA form to appear
//     try {
//       await Promise.race([
//         page.waitForNavigation({ timeout: 50000 }),
//         page.waitForSelector('form[name="backupCodeForm"]', { timeout: 50000 }),
//         page.waitForSelector('form[name="authenticatorCodeForm"]', { timeout: 50000 }),
//         page.waitForSelector(".top-applications", { timeout: 50000 }),
//       ])
//     } catch (navError) {
//       console.log("Navigation timeout or selector not found. Checking login status...")
//     }

//     // Check if we're logged in by looking for dashboard elements
//     const loginCheck = await page.evaluate(() => {
//       const dashboardElements =
//         document.querySelector(".top-applications") !== null ||
//         document.querySelector(".av-dashboard") !== null ||
//         document.querySelector(".dashboard-container") !== null

//       const cookieConsent = Array.from(document.querySelectorAll("h1, h2, h3, h4, h5, h6")).some((h) =>
//         h.textContent?.includes("Cookie Consent & Preferences"),
//       )

//       return dashboardElements || cookieConsent
//     })

//     // Check if we need to handle 2FA
//     console.log("Checking if 2FA authentication is required...")
//     const is2FARequired = await page.evaluate(() => {
//       return (
//         document.querySelector('form[name="backupCodeForm"]') !== null ||
//         document.querySelector('form[name="authenticatorCodeForm"]') !== null ||
//         document.querySelector('input[type="radio"][value*="authenticator"]') !== null ||
//         document.querySelector('input[type="radio"][value*="backup"]') !== null
//       )
//     })

//     if (is2FARequired) {
//       console.log("2FA authentication is required. Handling 2FA...")
//       await handle2FA(page)
//       isLoggedIn = true
//     } else if (loginCheck) {
//       console.log("Already logged in - no 2FA required")
//       isLoggedIn = true
//     } else {
//       const currentUrl = page.url()
//       console.log(`Current URL: ${currentUrl}`)

//       if (currentUrl.includes("login") || currentUrl.includes("authenticate")) {
//         throw new Error("Login failed - still on login page")
//       }
//     }

//     // Handle any cookie consent popup that might appear after login
//     await handleCookieConsent(page)

//     // Handle any other popups that might appear
//     await handlePopups(page)

//     // Navigate to Care Central
//     console.log("Proceeding to navigate to Care Central...")
//     await navigateToCareCentral(page)

//     console.log("Login process completed successfully")
//     pendingRequests.delete(requestId)
//     return true
//   } catch (error) {
//     console.error("Error during login attempt:", error)
//     isLoggedIn = false
//     currentFrame = null
//     pendingRequests.delete(requestId)
//     throw error
//   }
// }

// async function handle2FA(page: Page): Promise<void> {
//   console.log("Starting 2FA authentication process...")
//   try {
//     // Wait for the 2FA options to be visible
//     await page.waitForSelector('input[type="radio"]', { visible: true, timeout: 40000 })

//     let authenticatorOptionSelected = false

//     // Approach 1: Try direct selector for the authenticator app radio button
//     try {
//       const authenticatorRadioSelector =
//         'input[type="radio"][value*="authenticator"], input[type="radio"][id*="authenticator"], input[type="radio"][name*="authenticator"]'
//       const authenticatorRadio = await page.$(authenticatorRadioSelector)

//       if (authenticatorRadio) {
//         await authenticatorRadio.click()
//         authenticatorOptionSelected = true
//       }
//     } catch (error) {
//       // Try next approach
//     }

//     // Approach 2: Try finding by label text if approach 1 failed
//     if (!authenticatorOptionSelected) {
//       try {
//         const labels = await page.$$("label")
//         for (const label of labels) {
//           const text = await label.evaluate((el) => el.textContent)
//           if (text && text.toLowerCase().includes("authenticator app")) {
//             await label.click()
//             authenticatorOptionSelected = true
//             break
//           }
//         }
//       } catch (error) {
//         // Try next approach
//       }
//     }

//     // Approach 3: Try selecting the first radio button (assuming it's the authenticator app option)
//     if (!authenticatorOptionSelected) {
//       try {
//         const radioButtons = await page.$$('input[type="radio"]')
//         if (radioButtons.length >= 1) {
//           await radioButtons[0].click()
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
//     const continueButton = await page.$('button[type="submit"]')
//     if (!continueButton) {
//       throw new Error("Continue button not found")
//     }
//     await continueButton.click()

//     // Wait for the OTP input form to load
//     await page.waitForSelector('input[name="code"], input[name="authenticatorCode"], input[type="text"]', {
//       visible: true,
//       timeout: 40000,
//     })

//     // Generate the TOTP code
//     const totpCode = authenticator.generate(TOTP_SECRET)
//     console.log("Generated TOTP code")

//     // Enter the TOTP code
//     const codeInputSelectors = ['input[name="code"]', 'input[name="authenticatorCode"]', 'input[type="text"]']

//     let codeEntered = false

//     for (const selector of codeInputSelectors) {
//       try {
//         const codeInput = await page.$(selector)
//         if (codeInput) {
//           await codeInput.type(totpCode)
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
//         const submitButton = await page.$(selector)
//         if (submitButton) {
//           await Promise.all([
//             submitButton.click(),
//             page.waitForNavigation({ waitUntil: "networkidle2", timeout: 40000 }).catch(() => {
//               // Navigation timeout after submitting code, but this might be expected
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
//         page.waitForSelector(".top-applications, .av-dashboard, .dashboard-container", {
//           timeout: 50000,
//           visible: true,
//         }),
//         page.waitForFunction(
//           () => {
//             const headings = Array.from(document.querySelectorAll("h1, h2, h3, h4, h5, h6"))
//             return headings.some((h) => h.textContent?.includes("Cookie Consent & Preferences"))
//           },
//           { timeout: 50000 },
//         ),
//         page.waitForSelector(".alert-danger, .error-message", {
//           timeout: 50000,
//           visible: true,
//         }),
//       ])

//       const errorMessage = await page.$(".alert-danger, .error-message")
//       if (errorMessage) {
//         const text = await page.evaluate((el) => el.textContent, errorMessage)
//         throw new Error(`2FA resulted in error: ${text}`)
//       }

//       await delay(3000)
//     } catch (error) {
//       // Navigation timeout after 2FA, but this might be expected
//     }

//     const isLoggedInCheck = await page.evaluate(() => {
//       const dashboardElements =
//         document.querySelector(".top-applications") !== null ||
//         document.querySelector(".av-dashboard") !== null ||
//         document.querySelector(".dashboard-container") !== null

//       const cookieConsent = Array.from(document.querySelectorAll("h1, h2, h3, h4, h5, h6")).some((h) =>
//         h.textContent?.includes("Cookie Consent & Preferences"),
//       )

//       return dashboardElements || cookieConsent
//     })

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
//     await page
//       .waitForFunction(
//         () => {
//           const heading = Array.from(document.querySelectorAll("h1, h2, h3, h4, h5, h6")).find((el) =>
//             el.textContent?.includes("Cookie Consent & Preferences"),
//           )
//           const acceptButton = document.querySelector('button.primary-button, button:has-text("Accept All Cookies")')
//           return heading && acceptButton
//         },
//         { timeout: 3000 },
//       )
//       .catch(() => {
//         // No cookie consent popup found within timeout
//       })

//     let accepted = false

//     try {
//       const acceptButtonSelector = 'button.primary-button, button:has-text("Accept All Cookies")'
//       const acceptButton = await page.$(acceptButtonSelector)
//       if (acceptButton) {
//         await acceptButton.click()
//         await delay(500)
//         accepted = true
//       }
//     } catch (error) {
//       // Try next approach
//     }

//     if (!accepted) {
//       try {
//         accepted = await page.evaluate(() => {
//           const buttons = Array.from(document.querySelectorAll("button"))
//           const acceptButton = buttons.find((button) =>
//             button.textContent?.toLowerCase().includes("accept all cookies"),
//           )
//           if (acceptButton) {
//             acceptButton.click()
//             return true
//           }
//           return false
//         })
//         if (accepted) {
//           await delay(500)
//         }
//       } catch (error) {
//         // Try next approach
//       }
//     }

//     if (!accepted) {
//       try {
//         await page.mouse.click(636, 636)
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
//     await page.waitForSelector("body", { timeout: 50000, visible: true })

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
//         myTopAppsHeading = await page.$(selector)
//         if (myTopAppsHeading) {
//           break
//         }
//       } catch (error) {
//         // Try next selector
//       }
//     }

//     // Now try to find Care Central by searching for all elements containing that text
//     const careCentralElements = await page.evaluate(() => {
//       const allElements = Array.from(document.querySelectorAll("*"))
//       return allElements
//         .filter((el) => {
//           const text = el.textContent || ""
//           return text.includes("Care Central") && !text.includes("Care Central.")
//         })
//         .map((el) => {
//           const rect = el.getBoundingClientRect()
//           return {
//             x: rect.x + rect.width / 2,
//             y: rect.y + rect.height / 2,
//             width: rect.width,
//             height: rect.height,
//             text: el.textContent,
//             tagName: el.tagName,
//             className: el.className,
//             id: el.id,
//           }
//         })
//     })

//     // Try to click the most likely element (filter for reasonable size and position)
//     let clicked = false
//     for (const element of careCentralElements) {
//       // Look for elements that are likely to be clickable tiles (reasonable size)
//       if (element.width > 50 && element.height > 50) {
//         try {
//           await page.mouse.click(element.x, element.y)
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
//       const wellpointImages = await page.evaluate(() => {
//         const images = Array.from(document.querySelectorAll("img"))
//         return images
//           .filter((img) => {
//             const src = img.src || ""
//             const alt = img.alt || ""
//             return (
//               src.includes("wellpoint") ||
//               alt.includes("Wellpoint") ||
//               src.includes("Wellpoint") ||
//               alt.includes("wellpoint")
//             )
//           })
//           .map((img) => {
//             const rect = img.getBoundingClientRect()
//             return {
//               x: rect.x + rect.width / 2,
//               y: rect.y + rect.height / 2,
//               width: rect.width,
//               height: rect.height,
//               src: img.src,
//               alt: img.alt,
//             }
//           })
//       })

//       // Try clicking on a Wellpoint image
//       for (const img of wellpointImages) {
//         try {
//           await page.mouse.click(img.x, img.y)
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
//           await page.mouse.click(pos.x, pos.y)
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
//     await page.waitForSelector("#newBodyFrame", { timeout: 40000 })

//     // Get all frames and find the one with name="newBody"
//     const frames = page.frames()
//     const newBodyFrame = frames.find((frame) => frame.name() === "newBody")

//     if (!newBodyFrame) {
//       throw new Error("Could not find newBody iframe")
//     }

//     // Wait for the form to load in the iframe
//     await newBodyFrame.waitForSelector("form", { timeout: 40000 })

//     // Wait for the organization dropdown to be present in the iframe
//     await newBodyFrame.waitForSelector("#organizations", { timeout: 40000 })

//     // Click on the organization dropdown
//     await newBodyFrame.click("#organizations")
//     await delay(500)

//     // Type the organization name
//     await newBodyFrame.click("#organizations")
//     await delay(500)

//     // Wait for and click the option
//     await newBodyFrame.waitForSelector(".av-select", { visible: true, timeout: 30000 })
//     await newBodyFrame.click(".av-select")

//     // Look specifically for Harmony Health LLC option
//     const harmonyOption = await newBodyFrame.evaluate(() => {
//       const options = Array.from(document.querySelectorAll(".av__option"))
//       const harmonyOption = options.find(
//         (option) => option.textContent && option.textContent.includes("Harmony Health LLC"),
//       )
//       return harmonyOption ? true : false
//     })

//     if (harmonyOption) {
//       // Click on the Harmony Health LLC option
//       await newBodyFrame.evaluate(() => {
//         const options = Array.from(document.querySelectorAll(".av__option"))
//         const harmonyOption = options.find(
//           (option) => option.textContent && option.textContent.includes("Harmony Health LLC"),
//         )
//         if (harmonyOption) {
//           ;(harmonyOption as HTMLElement).click()
//         }
//       })
//     } else {
//       // If Harmony Health LLC not found, click the first option
//       await newBodyFrame.click(".av__option")
//     }

//     // Wait for provider field to become enabled
//     // Click and select provider
//     await newBodyFrame.click("#providerName")
//     await delay(500)

//     // Wait for dropdown options to appear
//     await newBodyFrame.waitForSelector(".av__option", { visible: true, timeout: 30000 })

//     // Look specifically for Harmony Health provider option
//     const harmonyProviderOption = await newBodyFrame.evaluate(() => {
//       const options = Array.from(document.querySelectorAll(".av__option"))
//       const harmonyOption = options.find(
//         (option) =>
//           option.textContent &&
//           (option.textContent.includes("Harmony Health") || option.textContent.includes("HARMONY HEALTH")),
//       )
//       return harmonyOption ? true : false
//     })

//     if (harmonyProviderOption) {
//       // Click on the Harmony Health provider option
//       await newBodyFrame.evaluate(() => {
//         const options = Array.from(document.querySelectorAll(".av__option"))
//         const harmonyOption = options.find(
//           (option) =>
//             option.textContent &&
//             (option.textContent.includes("Harmony Health") || option.textContent.includes("HARMONY HEALTH")),
//         )
//         if (harmonyOption) {
//           ;(harmonyOption as HTMLElement).click()
//         }
//       })
//     } else {
//       // If Harmony Health not found, click the first option
//       await newBodyFrame.click(".av__option")
//     }

//     // Wait for selection to be processed
//     await delay(500)

//     // Click the Next button
//     await newBodyFrame.click("button.btn.btn-primary")

//     // Wait for navigation
//     await page.waitForNavigation({ waitUntil: "networkidle0", timeout: 30000 }).catch(() => {
//       // Navigation timeout after Next, but this might be expected
//     })

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
//       await currentFrame.waitForSelector('button[data-id="referral"]', { visible: true, timeout: 10000 })

//       // Click the Referrals button
//       await currentFrame.click('button[data-id="referral"]')

//       // Wait for the page to update after clicking
//       await delay(4000)
//     } catch (error) {
//       // Try alternative approach - evaluate and click directly in the frame
//       const clicked = await currentFrame.evaluate(() => {
//         const buttons = Array.from(document.querySelectorAll("button"))
//         const referralButton = buttons.find((button) => button.textContent && button.textContent.includes("Referrals"))
//         if (referralButton) {
//           ;(referralButton as HTMLElement).click()
//           return true
//         }
//         return false
//       })

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
//   console.log("Extracting member information from referrals page...");
//   try {
//     // Wait for the referrals content to load
//     await frame.waitForSelector(".incoming-referral-info", { timeout: 15000 }).catch(async () => {
//       // If no referrals are found, send a notification and start monitoring
//       console.log("No members found in referrals page.");

//       // Send email notification that no members were found
//       await sendEmail(
//         "Availity Referrals Monitoring Active",
//         "No members were found in the referrals section at this time.\n\n" +
//           "The monitoring system is active and will check for new members every 30 seconds.\n\n" +
//           "You will receive an email notification as soon as a new member is detected.",
//       );

//       // Start continuous monitoring
//       await startContinuousMonitoring(frame);

//       return [];
//     });

//     // If referrals are found, extract member information
//     const members = await extractMembersFromFrame(frame);

//     // Send email with the extracted member information
//     if (members.length > 0) {
//       await sendMemberInformationEmail(members);
//     } else {
//       // Send email notification that no members were found
//       await sendEmail(
//         "Availity Referrals Monitoring Active",
//         "No members were found in the referrals section at this time.\n\n" +
//           "The monitoring system is active and will check for new members every 30 seconds.\n\n" +
//           "You will receive an email notification as soon as a new member is detected.",
//       );
//     }

//     // Save members to database
//     await saveMembersToDatabase(members);

//     // Start continuous monitoring for new referrals
//     await startContinuousMonitoring(frame);

//     return members;
//   } catch (error) {
//     console.error("Error extracting member information:", error);
//     return [];
//   }
// }

// // Helper function to extract members from the frame
// async function extractMembersFromFrame(frame: Frame): Promise<MemberData[]> {
//   try {
//     return await frame.evaluate(() => {
//       const results: Array<{
//         memberName: string
//         memberID: string
//         serviceName: string
//         status: string
//         requestDate: string
//         additionalInfo: string
//       }> = []

//       // Find all referral info containers
//       const referralContainers = document.querySelectorAll(".incoming-referral-info")

//       if (referralContainers.length === 0) {
//         return results
//       }

//       // Process each referral container
//       referralContainers.forEach((container) => {
//         try {
//           // Extract member name
//           const memberNameElement = container.querySelector(".memName")
//           const memberName =
//             memberNameElement && memberNameElement.textContent ? memberNameElement.textContent.trim() : "Unknown"

//           // Extract service
//           const serviceElement = container.querySelector(".serviceCol")
//           const serviceName = serviceElement && serviceElement.textContent ? serviceElement.textContent.trim() : ""

//           // Extract region
//           const regionElement = container.querySelector(".regionCol")
//           const region = regionElement && regionElement.textContent ? regionElement.textContent.trim() : ""

//           // Extract county
//           const countyElement = container.querySelector(".countyCol")
//           const county = countyElement && countyElement.textContent ? countyElement.textContent.trim() : ""

//           // Extract program
//           const programElement = container.querySelector(".programCol")
//           const program = programElement && programElement.textContent ? programElement.textContent.trim() : ""

//           // Extract status
//           const statusElement = container.querySelector(".statusCol .badge")
//           const status = statusElement && statusElement.textContent ? statusElement.textContent.trim() : ""

//           // Extract referral number from more details section
//           const moreDetailsSection = container.querySelector(".more-detail-section")
//           let referralNumber = ""
//           let requestDate = ""
//           let yearOfBirth = ""
//           let zipCode = ""

//           if (moreDetailsSection) {
//             // Find all detail rows
//             const detailRows = moreDetailsSection.querySelectorAll(".d-flex")

//             detailRows.forEach((row) => {
//               // Look for Referral # field
//               const headers = row.querySelectorAll(".moreDetailsHeader")
//               const data = row.querySelectorAll(".moreDetailsData")

//               for (let i = 0; i < headers.length; i++) {
//                 const headerElement = headers[i]
//                 const dataElement = i < data.length ? data[i] : null

//                 const headerText = headerElement && headerElement.textContent ? headerElement.textContent.trim() : ""
//                 const dataText = dataElement && dataElement.textContent ? dataElement.textContent.trim() : ""

//                 if (headerText.includes("Referral #")) {
//                   referralNumber = dataText
//                 }

//                 if (headerText.includes("Requested On")) {
//                   requestDate = dataText
//                 }

//                 if (headerText.includes("Year of Birth")) {
//                   yearOfBirth = dataText
//                 }

//                 if (headerText.includes("Zip Code")) {
//                   zipCode = dataText
//                 }
//               }
//             })
//           }

//           // Create member data object
//           const memberData = {
//             memberName,
//             memberID: referralNumber || `unknown-${Date.now()}`, // Using referral number as member ID, with fallback
//             serviceName,
//             status,
//             requestDate,
//             additionalInfo: `Region: ${region}, County: ${county}, Program: ${program}, YOB: ${yearOfBirth}, Zip: ${zipCode}`,
//           }

//           results.push(memberData)
//         } catch (err) {
//           // Skip this container if there's an error
//         }
//       })

//       return results
//     })
//   } catch (error) {
//     console.error("Error extracting members from frame:", error)
//     return []
//   }
// }

// // Function to send email with member information
// async function sendMemberInformationEmail(members: MemberData[]): Promise<void> {
//   try {
//     // Create email content
//     let emailContent = "Current Members in Referrals:\n\n"

//     members.forEach((member, index) => {
//       emailContent += `Member ${index + 1}:\n`
//       emailContent += `Name: ${member.memberName}\n`
//       emailContent += `ID: ${member.memberID}\n`

//       if (member.serviceName) {
//         emailContent += `Service: ${member.serviceName}\n`
//       }

//       if (member.status) {
//         emailContent += `Status: ${member.status}\n`
//       }

//       if (member.requestDate) {
//         emailContent += `Request Date: ${member.requestDate}\n`
//       }

//       emailContent += "\n"
//     })

//     // Send the email
//     await sendEmail("Availity Referrals - Current Members", emailContent)
//     console.log("Email with member information sent successfully")
//   } catch (error) {
//     console.error("Error sending member information email:", error)
//     // Continue even if email fails
//   }
// }

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
//     console.log("Monitoring already active, skipping setup");
//     return; // Already monitoring
//   }

//   console.log("Starting continuous monitoring for new referrals");
//   isMonitoring = true;

//   // Store the current members for comparison
//   currentMembers = await extractMembersFromFrame(frame);
//   console.log(`Initial monitoring state: ${currentMembers.length} members`);

//   // Set up the interval to check for new referrals every 30 seconds
//   monitoringInterval = setInterval(async () => {
//     try {
//       console.log("Checking for new referrals...");
      
//       // Create a unique request ID for this monitoring check
//       const requestId = `monitor-${Date.now()}`;
      
//       // Check if this request is already in progress
//       if (pendingRequests.has(requestId)) {
//         console.log(`Monitoring request ${requestId} is already in progress, skipping`);
//         return;
//       }
      
//       // Add this request to pending requests
//       pendingRequests.add(requestId);
      
//       try {
//         // Click on the "incoming" tab to refresh the data
//         console.log("Clicking on 'incoming' tab to refresh data...");
        
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
//         ];
        
//         let tabClicked = false;
        
//         // Try each selector
//         for (const selector of incomingTabSelectors) {
//           try {
//             const elements = await frame.$$(selector);
//             for (const element of elements) {
//               // Check if this element is visible and contains only the text "Incoming"
//               const isRelevant = await element.evaluate((el) => {
//                 const text = el.textContent?.trim();
//                 return text === "Incoming" || text === "INCOMING";
//               });
              
//               if (isRelevant) {
//                 await element.click();
//                 tabClicked = true;
//                 console.log("Successfully clicked on 'incoming' tab");
//                 break;
//               }
//             }
//             if (tabClicked) break;
//           } catch (error) {
//             // Try next selector
//           }
//         }
        
//         // If we couldn't find the tab by text, try finding it by position or other attributes
//         if (!tabClicked) {
//           // Try to find tabs/navigation elements and click the first one (assuming it's "Incoming")
//           try {
//             const navElements = await frame.$$('.nav-tabs .nav-item, .nav-tabs .nav-link, .nav .nav-item, .nav .nav-link');
//             if (navElements.length > 0) {
//               await navElements[0].click();
//               tabClicked = true;
//               console.log("Clicked on first tab (assuming it's 'incoming')");
//             }
//           } catch (error) {
//             console.log("Could not find navigation elements");
//           }
//         }
        
//         if (!tabClicked) {
//           console.log("Could not find and click 'incoming' tab with any method");
//         }
        
//         // Wait a moment for the page to update after clicking
//         await delay(2000);
        
//         // Extract the current members from the frame
//         const newMembers = await extractMembersFromFrame(frame);
//         console.log(`Found ${newMembers.length} members, comparing with previous ${currentMembers.length} members`);

//         // Compare with previous members to find new ones
//         const addedMembers = findNewMembers(currentMembers, newMembers);

//         // If new members are found, process them
//         if (addedMembers.length > 0) {
//           console.log(`Found ${addedMembers.length} new members!`);
//           // Send notifications for new members
//           await processNewMembers(addedMembers);
//         } else {
//           console.log("No new members found");
//         }

//         // Update the current members list
//         currentMembers = newMembers;
//       } finally {
//         // Always remove the request from pending requests
//         pendingRequests.delete(requestId);
//       }
//     } catch (error) {
//       console.error("Error during monitoring check:", error);
      
//       // Check if the frame is detached
//       if ((error as any).message && (error as any).message.includes("detached Frame")) {
//         console.log("Frame is detached, attempting to recover...");
        
//         // Stop the current monitoring
//         if (monitoringInterval) {
//           clearInterval(monitoringInterval);
//           monitoringInterval = null;
//         }
        
//         isMonitoring = false;
//         isLoggedIn = false;
//         currentFrame = null;
        
//         // Try to re-login and restart monitoring
//         try {
//           await loginToAvaility();
//         } catch (loginError) {
//           console.error("Failed to recover after frame detachment:", loginError);
//         }
//       }
//     }
//   }, MONITORING_INTERVAL_MS); // Check every 30 seconds

//   console.log(`Monitoring interval set up for every ${MONITORING_INTERVAL_MS / 1000} seconds`);
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
//     // Save to database
//     await saveMembersToDatabase(members)

//     // Send email notification
//     let emailContent = "New Referrals Detected:\n\n"

//     members.forEach((member, index) => {
//       emailContent += `Member ${index + 1}:\n`
//       emailContent += `Name: ${member.memberName}\n`
//       emailContent += `ID: ${member.memberID}\n`

//       if (member.serviceName) {
//         emailContent += `Service: ${member.serviceName}\n`
//       }

//       if (member.status) {
//         emailContent += `Status: ${member.status}\n`
//       }

//       if (member.requestDate) {
//         emailContent += `Request Date: ${member.requestDate}\n`
//       }

//       emailContent += "\n"
//     })

//     await sendEmail("New Availity Referrals Detected", emailContent)
//     console.log("Email notification sent for new members")

//     // Send SMS for each new member
//     for (const member of members) {
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
//   const requestId = `api-check-${Date.now()}`;
  
//   // Check if this request is already in progress
//   if (pendingRequests.has(requestId)) {
//     console.log(`API check request ${requestId} is already in progress, skipping`);
//     return;
//   }
  
//   // Add this request to pending requests
//   pendingRequests.add(requestId);
  
//   console.log("Starting API-based check for new referrals...")
//   try {
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
//         }
//       )

//       const currentTime = new Date()
//       console.log(`Retrieved ${response.data.referrals.length} referrals from API`)

//       const newReferrals = response.data.referrals.filter((referral) => {
//         const requestDate = new Date(referral.requestOn)
//         return requestDate > lastCheckTime
//       })

//       console.log(`Found ${newReferrals.length} new referrals since last check`)

//       if (newReferrals.length > 0) {
//         // Process each new referral
//         for (const referral of newReferrals) {
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
//           const retryDelay = error.response.headers['x-availity-api-retry-delay-sec']
//           const delayMs = retryDelay ? parseInt(retryDelay as string) * 1000 : API_RETRY_DELAY_MS
          
//           console.log(`Waiting ${delayMs/1000} seconds before retrying...`)
          
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
//     throw error
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
//     await sendEmail(
//       "Availity Monitoring Bot Started",
//       `The Availity monitoring bot has been started at ${new Date().toISOString()}.\n\n` +
//       "The bot will check for new referrals every 30 seconds and notify you when new members are detected."
//     )
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
//       // Continue even if retry fails
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
//         // Continue even if retry fails
//       }
//     }

//     // Log next scheduled check time
//     const nextCheckTime = new Date(Date.now() + 30000)
//     console.log(`🔔 Next check scheduled for ${nextCheckTime.toISOString()}`)
//   }

//   // Use setInterval with the exact millisecond value (30000 ms = 30 seconds)
//   const intervalId = setInterval(performScheduledCheck, 30000)

//   console.log(`🔔 Monitoring setup complete - checking every 30 seconds`)
//   console.log(`⏰ Next check scheduled for ${new Date(Date.now() + 30000).toISOString()}`)

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



import puppeteer, { type Browser, type Page, type Frame } from "puppeteer"
import axios, { type AxiosError } from "axios"
import { authenticator } from "otplib"
import { config } from "dotenv"
import { sendEmail } from "./email"
import { sendSMS } from "./sms"
import { Referral } from "../models/referrals"
import { Notification } from "../models/notification"

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
let pendingRequests = new Set<string>() // Track pending requests to prevent duplicates
let notifiedMemberIds = new Set<string>() // Track which members we've already notified about

// Constants
const AVAILITY_URL = "https://apps.availity.com"
const LOGIN_URL = "https://apps.availity.com/availity/web/public.elegant.login"
const REFERRALS_API_URL = "https://apps.availity.com/api/v1/proxy/anthem/provconn/v1/carecentral/ltss/referral/details"
const TOTP_SECRET = process.env.TOTP_SECRET || "RU4SZCAW4UESMUQNCG3MXTWKXA"
const MONITORING_INTERVAL_MS = 30000 // 30 seconds
const API_RETRY_DELAY_MS = 60000 // 60 seconds (based on Availity's retry header)
const MAX_RETRIES = 5 // Maximum number of retries for operations

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
interface MemberData {
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

export async function getSessionCookies(): Promise<string> {
  if (!page) {
    throw new Error("Page not initialized")
  }

  const cookies = await page.cookies()
  return cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join("; ")
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

export async function setupBot(): Promise<void> {
  try {
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
      ],
      defaultViewport: { width: 1280, height: 800 },
      timeout: 50000,
    })

    console.log("✅ Browser launched successfully")

    // Create a new page
    page = await browser.newPage()

    // Set viewport size
    await page.setViewport({ width: 1280, height: 800 })

    // Add additional configurations
    await page.setDefaultNavigationTimeout(50000)
    await page.setDefaultTimeout(50000)

    // Enable request interception to optimize performance
    await page.setRequestInterception(true)
    page.on("request", (request) => {
      try {
        // Block unnecessary resources to speed up page loading
        const resourceType = request.resourceType()
        if (resourceType === "image" || resourceType === "font" || resourceType === "media") {
          request.abort()
        } else {
          request.continue()
        }
      } catch (error) {
        // If request is already handled, just log and continue
        if ((error as Error).message.includes("Request is already handled")) {
          console.log("Request is already handled, ignoring")
        } else {
          console.error("Error handling request:", error)
        }
      }
    })

    console.log("✅ Bot setup completed")
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
        const closeButtons = await page.$$(selector)
        for (const button of closeButtons) {
          const isVisible = await button.evaluate((el) => {
            const style = window.getComputedStyle(el)
            return style.display !== "none" && style.visibility !== "hidden" && style.opacity !== "0"
          })

          if (isVisible) {
            await button.click()
            await delay(300)
          }
        }
      } catch (error) {
        // Continue to next selector
      }
    }

    const modalSelectors = [".modal.show", ".dialog.show", '[role="dialog"]', '[aria-modal="true"]']

    for (const selector of modalSelectors) {
      try {
        const modals = await page.$$(selector)
        for (const modal of modals) {
          const closeButton = await modal.$('button:has-text("×"), button.close, button[aria-label="Close"]')
          if (closeButton) {
            await closeButton.click()
            await delay(300)
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
  
  console.log("Starting Availity login process...")

  try {
    // Check if we're already logged in and have a valid frame for monitoring
    if (isLoggedIn && currentFrame) {
      console.log("Already logged in and on referrals page, skipping login process")
      pendingRequests.delete(requestId)
      return true
    }

    if (!browser || !page) {
      console.log("Browser or page not initialized. Setting up bot...")
      await setupBot()
    }

    if (!page) {
      throw new Error("Browser page not initialized")
    }

    console.log("Navigating to Availity login page...")
    await page.goto(LOGIN_URL, { waitUntil: "networkidle2" })

    // Enter username and password
    console.log("Entering credentials...")
    await page.type("#userId", process.env.AVAILITY_USERNAME || "")
    await page.type("#password", process.env.AVAILITY_PASSWORD || "")

    // Click login button
    await page.click('button[type="submit"]')

    // Wait for either navigation to complete or for 2FA form to appear
    try {
      await Promise.race([
        page.waitForNavigation({ timeout: 50000 }),
        page.waitForSelector('form[name="backupCodeForm"]', { timeout: 50000 }),
        page.waitForSelector('form[name="authenticatorCodeForm"]', { timeout: 50000 }),
        page.waitForSelector(".top-applications", { timeout: 50000 }),
      ])
    } catch (navError) {
      console.log("Navigation timeout or selector not found. Checking login status...")
    }

    // Check if we're logged in by looking for dashboard elements
    const loginCheck = await page.evaluate(() => {
      const dashboardElements =
        document.querySelector(".top-applications") !== null ||
        document.querySelector(".av-dashboard") !== null ||
        document.querySelector(".dashboard-container") !== null

      const cookieConsent = Array.from(document.querySelectorAll("h1, h2, h3, h4, h5, h6")).some((h) =>
        h.textContent?.includes("Cookie Consent & Preferences"),
      )

      return dashboardElements || cookieConsent
    })

    // Check if we need to handle 2FA
    console.log("Checking if 2FA authentication is required...")
    const is2FARequired = await page.evaluate(() => {
      return (
        document.querySelector('form[name="backupCodeForm"]') !== null ||
        document.querySelector('form[name="authenticatorCodeForm"]') !== null ||
        document.querySelector('input[type="radio"][value*="authenticator"]') !== null ||
        document.querySelector('input[type="radio"][value*="backup"]') !== null
      )
    })

    if (is2FARequired) {
      console.log("2FA authentication is required. Handling 2FA...")
      await handle2FA(page)
      isLoggedIn = true
    } else if (loginCheck) {
      console.log("Already logged in - no 2FA required")
      isLoggedIn = true
    } else {
      const currentUrl = page.url()
      console.log(`Current URL: ${currentUrl}`)

      if (currentUrl.includes("login") || currentUrl.includes("authenticate")) {
        throw new Error("Login failed - still on login page")
      }
    }

    // Handle any cookie consent popup that might appear after login
    await handleCookieConsent(page)

    // Handle any other popups that might appear
    await handlePopups(page)

    // Navigate to Care Central
    console.log("Proceeding to navigate to Care Central...")
    await navigateToCareCentral(page)

    console.log("Login process completed successfully")
    pendingRequests.delete(requestId)
    return true
  } catch (error) {
    console.error("Error during login attempt:", error)
    isLoggedIn = false
    currentFrame = null
    pendingRequests.delete(requestId)
    throw error
  }
}

async function handle2FA(page: Page): Promise<void> {
  console.log("Starting 2FA authentication process...")
  try {
    // Wait for the 2FA options to be visible
    await page.waitForSelector('input[type="radio"]', { visible: true, timeout: 40000 })

    let authenticatorOptionSelected = false

    // Approach 1: Try direct selector for the authenticator app radio button
    try {
      const authenticatorRadioSelector =
        'input[type="radio"][value*="authenticator"], input[type="radio"][id*="authenticator"], input[type="radio"][name*="authenticator"]'
      const authenticatorRadio = await page.$(authenticatorRadioSelector)

      if (authenticatorRadio) {
        await authenticatorRadio.click()
        authenticatorOptionSelected = true
      }
    } catch (error) {
      // Try next approach
    }

    // Approach 2: Try finding by label text if approach 1 failed
    if (!authenticatorOptionSelected) {
      try {
        const labels = await page.$$("label")
        for (const label of labels) {
          const text = await label.evaluate((el) => el.textContent)
          if (text && text.toLowerCase().includes("authenticator app")) {
            await label.click()
            authenticatorOptionSelected = true
            break
          }
        }
      } catch (error) {
        // Try next approach
      }
    }

    // Approach 3: Try selecting the first radio button (assuming it's the authenticator app option)
    if (!authenticatorOptionSelected) {
      try {
        const radioButtons = await page.$$('input[type="radio"]')
        if (radioButtons.length >= 1) {
          await radioButtons[0].click()
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
    const continueButton = await page.$('button[type="submit"]')
    if (!continueButton) {
      throw new Error("Continue button not found")
    }
    await continueButton.click()

    // Wait for the OTP input form to load
    await page.waitForSelector('input[name="code"], input[name="authenticatorCode"], input[type="text"]', {
      visible: true,
      timeout: 40000,
    })

    // Generate the TOTP code
    const totpCode = authenticator.generate(TOTP_SECRET)
    console.log("Generated TOTP code")

    // Enter the TOTP code
    const codeInputSelectors = ['input[name="code"]', 'input[name="authenticatorCode"]', 'input[type="text"]']

    let codeEntered = false

    for (const selector of codeInputSelectors) {
      try {
        const codeInput = await page.$(selector)
        if (codeInput) {
          await codeInput.type(totpCode)
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
        const submitButton = await page.$(selector)
        if (submitButton) {
          await Promise.all([
            submitButton.click(),
            page.waitForNavigation({ waitUntil: "networkidle2", timeout: 40000 }).catch(() => {
              // Navigation timeout after submitting code, but this might be expected
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
        page.waitForSelector(".top-applications, .av-dashboard, .dashboard-container", {
          timeout: 50000,
          visible: true,
        }),
        page.waitForFunction(
          () => {
            const headings = Array.from(document.querySelectorAll("h1, h2, h3, h4, h5, h6"))
            return headings.some((h) => h.textContent?.includes("Cookie Consent & Preferences"))
          },
          { timeout: 50000 },
        ),
        page.waitForSelector(".alert-danger, .error-message", {
          timeout: 50000,
          visible: true,
        }),
      ])

      const errorMessage = await page.$(".alert-danger, .error-message")
      if (errorMessage) {
        const text = await page.evaluate((el) => el.textContent, errorMessage)
        throw new Error(`2FA resulted in error: ${text}`)
      }

      await delay(3000)
    } catch (error) {
      // Navigation timeout after 2FA, but this might be expected
    }

    const isLoggedInCheck = await page.evaluate(() => {
      const dashboardElements =
        document.querySelector(".top-applications") !== null ||
        document.querySelector(".av-dashboard") !== null ||
        document.querySelector(".dashboard-container") !== null

      const cookieConsent = Array.from(document.querySelectorAll("h1, h2, h3, h4, h5, h6")).some((h) =>
        h.textContent?.includes("Cookie Consent & Preferences"),
      )

      return dashboardElements || cookieConsent
    })

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
    await page
      .waitForFunction(
        () => {
          const heading = Array.from(document.querySelectorAll("h1, h2, h3, h4, h5, h6")).find((el) =>
            el.textContent?.includes("Cookie Consent & Preferences"),
          )
          const acceptButton = document.querySelector('button.primary-button, button:has-text("Accept All Cookies")')
          return heading && acceptButton
        },
        { timeout: 3000 },
      )
      .catch(() => {
        // No cookie consent popup found within timeout
      })

    let accepted = false

    try {
      const acceptButtonSelector = 'button.primary-button, button:has-text("Accept All Cookies")'
      const acceptButton = await page.$(acceptButtonSelector)
      if (acceptButton) {
        await acceptButton.click()
        await delay(500)
        accepted = true
      }
    } catch (error) {
      // Try next approach
    }

    if (!accepted) {
      try {
        accepted = await page.evaluate(() => {
          const buttons = Array.from(document.querySelectorAll("button"))
          const acceptButton = buttons.find((button) =>
            button.textContent?.toLowerCase().includes("accept all cookies"),
          )
          if (acceptButton) {
            acceptButton.click()
            return true
          }
          return false
        })
        if (accepted) {
          await delay(500)
        }
      } catch (error) {
        // Try next approach
      }
    }

    if (!accepted) {
      try {
        await page.mouse.click(636, 636)
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
    await page.waitForSelector("body", { timeout: 50000, visible: true })

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
        myTopAppsHeading = await page.$(selector)
        if (myTopAppsHeading) {
          break
        }
      } catch (error) {
        // Try next selector
      }
    }

    // Now try to find Care Central by searching for all elements containing that text
    const careCentralElements = await page.evaluate(() => {
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
            className: el.className,
            id: el.id,
          }
        })
    })

    // Try to click the most likely element (filter for reasonable size and position)
    let clicked = false
    for (const element of careCentralElements) {
      // Look for elements that are likely to be clickable tiles (reasonable size)
      if (element.width > 50 && element.height > 50) {
        try {
          await page.mouse.click(element.x, element.y)
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
      const wellpointImages = await page.evaluate(() => {
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
      })

      // Try clicking on a Wellpoint image
      for (const img of wellpointImages) {
        try {
          await page.mouse.click(img.x, img.y)
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
          await page.mouse.click(pos.x, pos.y)
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
    await page.waitForSelector("#newBodyFrame", { timeout: 40000 })

    // Get all frames and find the one with name="newBody"
    const frames = page.frames()
    const newBodyFrame = frames.find((frame) => frame.name() === "newBody")

    if (!newBodyFrame) {
      throw new Error("Could not find newBody iframe")
    }

    // Wait for the form to load in the iframe
    await newBodyFrame.waitForSelector("form", { timeout: 40000 })

    // Wait for the organization dropdown to be present in the iframe
    await newBodyFrame.waitForSelector("#organizations", { timeout: 40000 })

    // Click on the organization dropdown
    await newBodyFrame.click("#organizations")
    await delay(500)

    // Type the organization name
    await newBodyFrame.click("#organizations")
    await delay(500)

    // Wait for and click the option
    await newBodyFrame.waitForSelector(".av-select", { visible: true, timeout: 30000 })
    await newBodyFrame.click(".av-select")

    // Look specifically for Harmony Health LLC option
    const harmonyOption = await newBodyFrame.evaluate(() => {
      const options = Array.from(document.querySelectorAll(".av__option"))
      const harmonyOption = options.find(
        (option) => option.textContent && option.textContent.includes("Harmony Health LLC"),
      )
      return harmonyOption ? true : false
    })

    if (harmonyOption) {
      // Click on the Harmony Health LLC option
      await newBodyFrame.evaluate(() => {
        const options = Array.from(document.querySelectorAll(".av__option"))
        const harmonyOption = options.find(
          (option) => option.textContent && option.textContent.includes("Harmony Health LLC"),
        )
        if (harmonyOption) {
          ;(harmonyOption as HTMLElement).click()
        }
      })
    } else {
      // If Harmony Health LLC not found, click the first option
      await newBodyFrame.click(".av__option")
    }

    // Wait for provider field to become enabled
    // Click and select provider
    await newBodyFrame.click("#providerName")
    await delay(500)

    // Wait for dropdown options to appear
    await newBodyFrame.waitForSelector(".av__option", { visible: true, timeout: 30000 })

    // Look specifically for Harmony Health provider option
    const harmonyProviderOption = await newBodyFrame.evaluate(() => {
      const options = Array.from(document.querySelectorAll(".av__option"))
      const harmonyOption = options.find(
        (option) =>
          option.textContent &&
          (option.textContent.includes("Harmony Health") || option.textContent.includes("HARMONY HEALTH")),
      )
      return harmonyOption ? true : false
    })

    if (harmonyProviderOption) {
      // Click on the Harmony Health provider option
      await newBodyFrame.evaluate(() => {
        const options = Array.from(document.querySelectorAll(".av__option"))
        const harmonyOption = options.find(
          (option) =>
            option.textContent &&
            (option.textContent.includes("Harmony Health") || option.textContent.includes("HARMONY HEALTH")),
        )
        if (harmonyOption) {
          ;(harmonyOption as HTMLElement).click()
        }
      })
    } else {
      // If Harmony Health not found, click the first option
      await newBodyFrame.click(".av__option")
    }

    // Wait for selection to be processed
    await delay(500)

    // Click the Next button
    await newBodyFrame.click("button.btn.btn-primary")

    // Wait for navigation
    await page.waitForNavigation({ waitUntil: "networkidle0", timeout: 30000 }).catch(() => {
      // Navigation timeout after Next, but this might be expected
    })

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
      await currentFrame.waitForSelector('button[data-id="referral"]', { visible: true, timeout: 10000 })

      // Click the Referrals button
      await currentFrame.click('button[data-id="referral"]')

      // Wait for the page to update after clicking
      await delay(4000)
    } catch (error) {
      // Try alternative approach - evaluate and click directly in the frame
      const clicked = await currentFrame.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll("button"))
        const referralButton = buttons.find((button) => button.textContent && button.textContent.includes("Referrals"))
        if (referralButton) {
          ;(referralButton as HTMLElement).click()
          return true
        }
        return false
      })

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
  console.log("Extracting member information from referrals page...");
  try {
    // Wait for the referrals content to load
    await frame.waitForSelector(".incoming-referral-info", { timeout: 15000 }).catch(async () => {
      // If no referrals are found, send a notification and start monitoring
      console.log("No members found in referrals page.");

      // Send email notification that no members were found
      await sendEmail(
        "Availity Referrals Monitoring Active",
        "No members were found in the referrals section at this time.\n\n" +
          "The monitoring system is active and will check for new members every 30 seconds.\n\n" +
          "You will receive an email notification as soon as a new member is detected.",
      );

      // Start continuous monitoring
      await startContinuousMonitoring(frame);

      return [];
    });

    // If referrals are found, extract member information
    const members = await extractMembersFromFrame(frame);

    // Send email with the extracted member information only on initial check
    // We don't want to send emails for the same members repeatedly
    if (members.length > 0 && currentMembers.length === 0) {
      await sendMemberInformationEmail(members);
    } else if (members.length === 0) {
      // Send email notification that no members were found (only on initial check)
      await sendEmail(
        "Availity Referrals Monitoring Active",
        "No members were found in the referrals section at this time.\n\n" +
          "The monitoring system is active and will check for new members every 30 seconds.\n\n" +
          "You will receive an email notification as soon as a new member is detected.",
      );
    }

    // Save members to database
    await saveMembersToDatabase(members);

    // Start continuous monitoring for new referrals
    await startContinuousMonitoring(frame);

    return members;
  } catch (error) {
    console.error("Error extracting member information:", error);
    return [];
  }
}

// Helper function to extract members from the frame
async function extractMembersFromFrame(frame: Frame): Promise<MemberData[]> {
  try {
    return await frame.evaluate(() => {
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

                const headerText = headerElement && headerElement.textContent ? headerElement.textContent.trim() : ""
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
    })
  } catch (error) {
    console.error("Error extracting members from frame:", error)
    return []
  }
}

// Function to send email with member information
async function sendMemberInformationEmail(members: MemberData[]): Promise<void> {
  try {
    // Create email content
    let emailContent = "Current Members in Referrals:\n\n"

    members.forEach((member, index) => {
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

    // Send the email
    await sendEmail("Availity Referrals - Current Members", emailContent)
    console.log("Email with member information sent successfully")
  } catch (error) {
    console.error("Error sending member information email:", error)
    // Continue even if email fails
  }
}

// Function to save members to database
async function saveMembersToDatabase(members: MemberData[]): Promise<void> {
  try {
    for (const member of members) {
      // Check if member already exists in database
      const existingMember = await Referral.findOne({
        memberID: member.memberID,
        memberName: member.memberName,
      })

      if (!existingMember) {
        console.log(`Adding new member to database: ${member.memberName} (${member.memberID})`)

        // Create new referral record
        const newReferral = await Referral.create({
          memberName: member.memberName,
          memberID: member.memberID,
          serviceName: member.serviceName || "",
          status: member.status || "",
          county: member.county || "",
          requestOn: member.requestDate || new Date().toISOString(),
          isNotified: true, // Already notified since we're extracting it now
        })

        // Create notification
        const notification = await Notification.create({
          referralId: newReferral._id,
          memberName: member.memberName,
          memberID: member.memberID,
          message: `Member found in referrals: ${member.memberName} (${member.serviceName || "No service specified"})`,
        })

        // Send SMS notification for new member
        await sendSMS(
          `New member in referrals: ${member.memberName} (${member.memberID}). Check dashboard for details.`,
        )
      }
    }
  } catch (error) {
    console.error("Error saving members to database:", error)
    // Continue even if database operations fail
  }
}

async function startContinuousMonitoring(frame: Frame): Promise<void> {
  if (isMonitoring) {
    console.log("Monitoring already active, skipping setup");
    return; // Already monitoring
  }

  console.log("Starting continuous monitoring for new referrals");
  isMonitoring = true;

  // Store the current members for comparison
  currentMembers = await extractMembersFromFrame(frame);
  console.log(`Initial monitoring state: ${currentMembers.length} members`);

  // Set up the interval to check for new referrals every 30 seconds
  monitoringInterval = setInterval(async () => {
    try {
      console.log("Checking for new referrals...");
      
      // Create a unique request ID for this monitoring check
      const requestId = `monitor-${Date.now()}`;
      
      // Check if this request is already in progress
      if (pendingRequests.has(requestId)) {
        console.log(`Monitoring request ${requestId} is already in progress, skipping`);
        return;
      }
      
      // Add this request to pending requests
      pendingRequests.add(requestId);
      
      try {
        // Click on the "incoming" tab to refresh the data
        console.log("Clicking on 'incoming' tab to refresh data...");
        
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
        ];
        
        let tabClicked = false;
        
        // Try each selector
        for (const selector of incomingTabSelectors) {
          try {
            const elements = await frame.$$(selector);
            for (const element of elements) {
              // Check if this element is visible and contains only the text "Incoming"
              const isRelevant = await element.evaluate((el) => {
                const text = el.textContent?.trim();
                return text === "Incoming" || text === "INCOMING";
              });
              
              if (isRelevant) {
                await element.click();
                tabClicked = true;
                console.log("Successfully clicked on 'incoming' tab");
                break;
              }
            }
            if (tabClicked) break;
          } catch (error) {
            // Try next selector
          }
        }
        
        // If we couldn't find the tab by text, try finding it by position or other attributes
        if (!tabClicked) {
          // Try to find tabs/navigation elements and click the first one (assuming it's "Incoming")
          try {
            const navElements = await frame.$$('.nav-tabs .nav-item, .nav-tabs .nav-link, .nav .nav-item, .nav .nav-link');
            if (navElements.length > 0) {
              await navElements[0].click();
              tabClicked = true;
              console.log("Clicked on first tab (assuming it's 'incoming')");
            }
          } catch (error) {
            console.log("Could not find navigation elements");
          }
        }
        
        if (!tabClicked) {
          console.log("Could not find and click 'incoming' tab with any method");
        }
        
        // Wait a moment for the page to update after clicking
        await delay(2000);
        
        // Extract the current members from the frame
        const newMembers = await extractMembersFromFrame(frame);
        console.log(`Found ${newMembers.length} members, comparing with previous ${currentMembers.length} members`);

        // Compare with previous members to find new ones
        const addedMembers = findNewMembers(currentMembers, newMembers);

        // If new members are found, process them
        if (addedMembers.length > 0) {
          console.log(`Found ${addedMembers.length} new members!`);
          // Send notifications for new members
          await processNewMembers(addedMembers);
        } else {
          console.log("No new members found");
        }

        // Update the current members list
        currentMembers = newMembers;
      } finally {
        // Always remove the request from pending requests
        pendingRequests.delete(requestId);
      }
    } catch (error) {
      console.error("Error during monitoring check:", error);
      
      // Check if the frame is detached
      if ((error as any).message && (error as any).message.includes("detached Frame")) {
        console.log("Frame is detached, attempting to recover...");
        
        // Stop the current monitoring
        if (monitoringInterval) {
          clearInterval(monitoringInterval);
          monitoringInterval = null;
        }
        
        isMonitoring = false;
        isLoggedIn = false;
        currentFrame = null;
        
        // Try to re-login and restart monitoring
        try {
          await loginToAvaility();
        } catch (loginError) {
          console.error("Failed to recover after frame detachment:", loginError);
          
          // Send notification about the error
          try {
            await sendEmail(
              "⚠️ Availity Bot Recovery Failed",
              `The Availity monitoring bot encountered a detached frame and failed to recover at ${new Date().toLocaleString()}.\n\n` +
                `Error: ${loginError}\n\n` +
                `The application will attempt to continue running, but you may need to restart it if monitoring stops.\n\n` +
                `This is an automated message from the monitoring system.`,
            );
          } catch (emailError) {
            console.error("Failed to send error notification email:", emailError);
          }
        }
      } else if ((error as any).message && (error as any).message.includes("Request is already handled")) {
        // This is a common error that can be safely ignored
        console.log("Request is already handled error, continuing monitoring");
      }
    }
  }, MONITORING_INTERVAL_MS); // Check every 30 seconds

  console.log(`Monitoring interval set up for every ${MONITORING_INTERVAL_MS / 1000} seconds`);
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
async function processNewMembers(members: MemberData[]): Promise<void> {
  console.log("Processing new members...")
  try {
    // Filter out members we've already notified about
    const unnotifiedMembers = members.filter(member => !notifiedMemberIds.has(member.memberID));
    
    if (unnotifiedMembers.length === 0) {
      console.log("All new members have already been notified about, skipping notifications");
      return;
    }
    
    // Save to database
    await saveMembersToDatabase(unnotifiedMembers);

    // Send email notification
    let emailContent = "New Referrals Detected:\n\n";

    unnotifiedMembers.forEach((member, index) => {
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

      if (member.requestDate) {
        emailContent += `Request Date: ${member.requestDate}\n`;
      }

      emailContent += "\n";
      
      // Add this member to our notified set
      notifiedMemberIds.add(member.memberID);
    });

    await sendEmail("New Availity Referrals Detected", emailContent);
    console.log("Email notification sent for new members");

    // Send SMS for each new member
    for (const member of unnotifiedMembers) {
      await sendSMS(`New referral detected: ${member.memberName} (${member.memberID}). Check dashboard for details.`);
    }
    console.log("SMS notifications sent for new members");
  } catch (error) {
    console.error("Error processing new members:", error);
    // Continue even if notification fails
  }
}

// Function to check for new referrals using API
export async function checkForNewReferrals(): Promise<void> {
  // Create a unique request ID for this API check
  const requestId = `api-check-${Date.now()}`;
  
  // Check if this request is already in progress
  if (pendingRequests.has(requestId)) {
    console.log(`API check request ${requestId} is already in progress, skipping`);
    return;
  }
  
  // Add this request to pending requests
  pendingRequests.add(requestId);
  
  console.log("Starting API-based check for new referrals...")
  try {
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
        }
      )

      const currentTime = new Date()
      console.log(`Retrieved ${response.data.referrals.length} referrals from API`)

      const newReferrals = response.data.referrals.filter((referral) => {
        const requestDate = new Date(referral.requestOn)
        return requestDate > lastCheckTime
      })

      console.log(`Found ${newReferrals.length} new referrals since last check`)

      if (newReferrals.length > 0) {
        // Filter out referrals we've already notified about
        const unnotifiedReferrals = newReferrals.filter(referral => !notifiedMemberIds.has(referral.memberID));
        
        // Process each new referral
        for (const referral of unnotifiedReferrals) {
          // Check if referral already exists in database
          const existingReferral = await Referral.findOne({
            memberID: referral.memberID,
            requestOn: referral.requestOn,
          })

          if (!existingReferral) {
            // Save the new referral
            const savedReferral = await Referral.create({
              ...referral,
              isNotified: false,
            })

            // Create notification
            const notification = await Notification.create({
              referralId: savedReferral._id,
              memberName: referral.memberName,
              memberID: referral.memberID,
              message: `New referral for ${referral.memberName} (${referral.serviceName}) received on ${referral.requestOn}`,
            })

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

            // Mark as notified
            savedReferral.isNotified = true
            await savedReferral.save()
            
            // Add to our notified set
            notifiedMemberIds.add(referral.memberID);
          }
        }
      } else {
        console.log("No new referrals found in this check")
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
          const retryDelay = error.response?.headers?.['x-availity-api-retry-delay-sec']
          const delayMs = retryDelay ? parseInt(retryDelay as string) * 1000 : API_RETRY_DELAY_MS
          
          console.log(`Waiting ${delayMs/1000} seconds before retrying...`)
          
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
    throw error
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

  // Send startup notification
  try {
    await sendEmail(
      "Availity Monitoring Bot Started",
      `The Availity monitoring bot has been started at ${new Date().toISOString()}.\n\n` +
      "The bot will check for new referrals every 30 seconds and notify you when new members are detected."
    )
  } catch (error) {
    console.error("Failed to send startup notification:", error)
  }

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
      // Continue even if retry fails
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
        
        // Send notification about the error
        try {
          await sendEmail(
            "⚠️ Availity Bot Check Failed",
            `The Availity monitoring bot failed to complete a scheduled check at ${new Date().toLocaleString()}.\n\n` +
              `Error: ${retryError}\n\n` +
              `The application will attempt to continue running, but you may need to restart it if monitoring stops.\n\n` +
              `This is an automated message from the monitoring system.`,
          );
        } catch (emailError) {
          console.error("Failed to send error notification email:", emailError);
        }
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