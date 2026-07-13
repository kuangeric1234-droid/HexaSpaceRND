# iOS via Codemagic (no Mac needed)

Codemagic builds, signs and uploads the iOS app to TestFlight in the cloud on a
real Mac. You only touch web UIs. The pipeline is in [`codemagic.yaml`](../codemagic.yaml).
App identity: bundle id **au.com.hexaspace.member**, name **Hexa Space**.

Do these once, in order. Steps 1–4 are Apple; 5–7 are Codemagic.

## 1. Verify your Apple Developer membership
- Go to https://developer.apple.com/account → it should show **Membership: Apple Developer Program** (active, not expired). If expired, renew ($99/yr) before anything else.

## 2. Register the App ID
- developer.apple.com → **Certificates, Identifiers & Profiles → Identifiers → +**
- Type: **App IDs → App**. Description: `Hexa Space`. Bundle ID: **Explicit** → `au.com.hexaspace.member`.
- Capabilities: leave defaults for now (add Push Notifications later if we build them). Register.

## 3. Create the app in App Store Connect
- https://appstoreconnect.apple.com → **Apps → + → New App**
- Platform: iOS. Name: **Hexa Space**. Primary language. Bundle ID: pick `au.com.hexaspace.member`. SKU: `hexaspace-member` (any unique string).
- Open the app → note its **Apple ID** (a 10-digit number under App Information) — you'll paste it into `codemagic.yaml` as `APP_STORE_APPLE_ID`.

## 4. Create an App Store Connect API key
- App Store Connect → **Users and Access → Integrations (Keys) → App Store Connect API → Generate API Key**
- Access: **App Manager** (or Admin). Name: `Codemagic`.
- Download the **.p8** file (⚠️ one time only — save it). Note the **Issuer ID** (top of the page) and the **Key ID** (next to the key).

## 5. Add the API key to Codemagic
- https://codemagic.io → sign up with GitHub → **Teams → (your team) → Integrations → App Store Connect → Add key**.
- Name it **exactly** `HexaSpace ASC Key` (this string is referenced in `codemagic.yaml`). Upload the .p8, paste Issuer ID + Key ID.

## 6. Connect the repo + fill the app id
- Codemagic → **Add application** → connect GitHub → pick `HexaSpaceRND`. It will detect `codemagic.yaml`.
- Edit `codemagic.yaml` (one line): set `APP_STORE_APPLE_ID` to the 10-digit number from step 3, commit + push.

## 7. Run the build
- Codemagic → **Start new build** → workflow **ios-testflight**.
- First build takes ~15–25 min (installs pods, builds, signs). Codemagic auto-creates the distribution certificate + provisioning profile from your API key — nothing to do by hand.
- On success it uploads to **TestFlight**. In App Store Connect → TestFlight, add yourself as an internal tester, install **TestFlight** on your iPhone, and you'll get the app to try.

## Going to the public App Store
Once TestFlight looks good:
1. App Store Connect → your app → fill **metadata** (description, keywords, support URL, **privacy policy URL**, category), upload **screenshots** (Codemagic build logs / TestFlight can help; or use the Simulator screenshots), complete the **App Privacy** questionnaire (the app handles account + booking data).
2. Attach the TestFlight build to a new **App Store version** and **Submit for Review**. (Or set `submit_to_app_store: true` in `codemagic.yaml` to automate.)

## Rebuilds
Any code change → merge to `main` → start the `ios-testflight` workflow again (or set up automatic triggers on push). The build number auto-increments.

## Watch-out — Apple Guideline 4.2
Apple rejects thin website wrappers. The Hexa app has real app features (bookings,
digital key/door unlock, invoices, mail, printing), so it should pass. If a reviewer
pushes back, adding **push notifications** and/or **Face ID login** makes the case
much stronger — tell me and I'll build them.
