# Dr. Aarogya - Acupressure AI Voice Calling Assistant

WhatsApp-style real-time voice assistant powered by Google Gemini 3.5 Flash-Lite and Native Web Speech Recognition.

## 🔒 Security Architecture
- **Zero API Key Leakage:** API key is never committed to GitHub. Users input their key securely in the browser, stored locally in `localStorage`.
- **PIN Lock Protection:** Protected by an access PIN (Default: `1234`) to prevent unauthorized usage.
- **Microphone Privacy:** Audio tracks are completely stopped and terminated on call hangup.

## 🚀 Deployment to Vercel
1. Push this repository to GitHub.
2. Go to [Vercel](https://vercel.com) and click **"Add New Project"**.
3. Import your GitHub repository and click **Deploy**.
4. Open the deployed HTTPS URL, enter PIN `1234`, set your Gemini API key in Settings, and enjoy unlimited natural calling!
