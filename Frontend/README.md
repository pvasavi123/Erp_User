# 📊 FinAccrual Excel Add-in (Frontend)

This directory contains the Microsoft Excel Taskpane Add-in built using Office JS. It allows users to authenticate with QuickBooks or Xero, create worksheets for accrual tracking inside Excel, and pull metadata directly into spreadsheet cells.

## 🚀 Key Features

- **Multi-provider Support**: Dropdown configuration selectors for QuickBooks and Xero.
- **Accrual sheet setup**: Automation script that sets up standard columns (Client ID, Account ID, Account Type, Currency, Balances, etc.) with custom headers and freeze panes.
- **Data Synchronization**: REST client that calls the backend and writes imported accounts and customer lists directly into sheet rows.
- **Mutual Exclusion**: Ensures that connecting to one provider automatically cleans up and disconnects the other.

## 🛠️ Folder Structure

```
Frontend/
├── assets/             # Icons and images for manifest
├── src/
│   ├── commands/       # Custom ribbon commands
│   └── taskpane/
│       ├── taskpane.css   # Taskpane styling
│       ├── taskpane.html  # Taskpane UI layout
│       └── taskpane.js    # Taskpane React/Vanilla controller logic
├── manifest.xml        # Excel Office Add-in Manifest
└── webpack.config.js   # Webpack bundler configuration
```

## ⚙️ Getting Started & Sideloading

### Prerequisites
- Node.js (v18.x+)
- Desktop Excel (Windows/macOS) or Excel Online subscription

### Installation

1. Navigate to this directory:
   ```bash
   cd Frontend
   ```
2. Install npm packages:
   ```bash
   npm install
   ```

### Running Locally

1. Start the dev server and sideload the add-in inside desktop Excel:
   ```bash
   npm start
   ```
   *This starts the server on `https://localhost:3000` and automatically opens a new Excel workbook containing the FinAccrual add-in.*

2. To stop the add-in and clear sideloading state:
   ```bash
   npm run stop
   ```

3. To validate the manifest file:
   ```bash
   npm run validate
   ```
