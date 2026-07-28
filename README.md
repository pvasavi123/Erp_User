# FinAccrual ERP
A full-stack ERP synchronization platform for accounting firms, integrating with **QuickBooks Online** and **Xero** to automate accrual schedules, journal entries, client management, and financial reporting.
---
## Project Structure
```
D:\ERP\
├── Admin/       — React + TypeScript Admin Dashboard (Vite)
├── Backend/     — Node.js / Express API (SQLite, QuickBooks & Xero OAuth2)
└── Frontend/    — Microsoft Excel Add-in (Office JS / Webpack)
```
---
## Sub-Projects
### Admin (`/Admin`)
A modern React dashboard for accounting firm staff to manage clients, accrual schedules, journal entries, master data, exports, and workpapers.
- **Tech Stack**: React 18 + TypeScript, Vite, React Router v7, Context API + useReducer, Vanilla CSS, Lucide React, Sonner
- **Getting Started**:
  ```bash
  cd Admin
  npm install
  npm run dev
  ```
- Runs on: `http://localhost:5173`
---
### Backend (`/Backend`)
A Node.js REST API that handles OAuth2 flows with QuickBooks and Xero, stores session state, and exposes data endpoints consumed by both the Admin dashboard and the Excel Add-in.
- **Tech Stack**: Node.js, Express, SQLite, express-session
- **Getting Started**:
  ```bash
  cd Backend
  cp .env.example .env        # Fill in your real credentials
  npm install
  node index.js
  ```
- Runs on: `http://localhost:8000`
> **Security Note**: Never commit your `.env` file. Use `.env.example` as the template.
---
### Frontend (`/Frontend`)
A Microsoft Excel Add-in built with Office JS that allows accountants to pull live data directly into Excel spreadsheets, manage accrual schedules, and post journal entries without leaving Excel.
- **Tech Stack**: Office JS, Webpack, Babel
- **Getting Started**:
  ```bash
  cd Frontend
  npm install
  npm run start           # Starts the dev server and sideloads the add-in
  ```
- Requires Microsoft Excel (Desktop or Online) with the `manifest.xml` sideloaded.
---
## Prerequisites
- Node.js >= 18.x
- npm >= 9.x
- Microsoft Excel (for the Excel Add-in)
- QuickBooks Online developer account ([developer.intuit.com](https://developer.intuit.com))
- Xero developer account ([developer.xero.com](https://developer.xero.com))
---
## Security
- **Do NOT commit** `.env` files with real credentials.
- Rotate any exposed API keys immediately via the respective developer portals.
- Review `Backend/.env.example` for all required environment variables.
---
## License
MIT © 2024 FinAccrual ERP. See [LICENSE](./LICENSE) for details.
