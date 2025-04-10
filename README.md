# Genshin Mod Manager (GMM)

![image](https://github.com/user-attachments/assets/b70e9905-e7b4-404e-b117-dc0ab9df3fe5)

**A modern, cross-platform manager for your Genshin Impact mods, built with Tauri and React.**

[![Latest Release](https://img.shields.io/github/v/release/Eidenz/gmm-updates?label=Latest%20Release&style=for-the-badge)](https://github.com/Eidenz/gmm/releases/latest)
[![Downloads](https://img.shields.io/github/downloads/Eidenz/gmm-updates/total?style=for-the-badge)](https://github.com/Eidenz/gmm/releases)

GMM aims to simplify the process of installing, organizing, and switching between Genshin Impact mods. It provides a clean user interface and useful tools like presets and keybind viewing.

---

## ✨ Key Features

*   **🗂️ Mod Library & Categorization:** Automatically scans your mods folder and organizes mods by category (Characters, Weapons, UI, etc.) and entity.
*   **🖱️ Simple Enable/Disable:** Easily toggle mods on or off with a switch. GMM handles the `DISABLED_` prefix renaming for you.
*   **📦 Archive Import (.zip, .7z, .rar):** Import mods directly from archive files. GMM analyzes the contents and helps you select the correct mod root folder.
*   **🤖 Automatic Mod Info Deduction:** Attempts to deduce mod name, author, and target entity from folder structure and INI files during scan/import.
*   **✨ Presets System:** Save your current mod setup as a preset and quickly switch between different mod combinations. Mark favorites for quick access.
*   **📊 Dashboard Overview:** Get a quick glance at your library stats, including total mods, enabled/disabled counts, and category breakdowns.
*   **🚀 Quick Launch Integration:** Configure a path to your game executable or a mod launcher for one-click launching (supports standard and elevated launch on Windows).
*   **⌨️ Keybind Viewer:** Quickly view keybinds defined within a mod's INI files (specifically looks for `[Key.*]` sections after a `; Constants` marker).
*   **🖼️ Image Previews:** Automatically detects and displays common preview images (like `preview.png`) within mod folders. Allows changing previews via file selection or pasting.
*   **🖱️ Drag & Drop Import:** Drag archive files (.zip, .7z, .rar) onto the application window to initiate the import process.
*   **🔄 Built-in Updater:** Stay up-to-date with the latest features and fixes via the integrated updater (powered by Tauri).
*   **🦀 Tauri Powered:** Built with Rust (backend) and React (frontend) via Tauri for a fast and efficient experience.

---

## 📸 Screenshots

![image](https://github.com/user-attachments/assets/8f378729-6029-48ed-a609-ac52f68bf961)

![image](https://github.com/user-attachments/assets/3c695fec-b311-4940-8948-e198b5db0f48)

---

## 💾 Installation

1.  **Download:** Go to the [**Latest Release**](https://github.com/Eidenz/gmm-updates/releases/latest) page.
2.  **Installer:** Download the `.msi` installer file (e.g., `GenshinModManager_X.Y.Z_x64_en-US.msi`).
3.  **Run:** Execute the downloaded `.msi` file and follow the installation prompts.
4.  **Updates:** The application has a built-in updater and will notify you when a new version is available.

---

## 🚀 Usage Guide

1.  **Initial Setup:** On first launch, you *must* select the main folder where you store your Genshin mods (e.g., `...\GIMI\Mods`). Optionally, select the XXMI launcher executable for Quick Launch.
2.  **Scanning:** After setting the mods folder, go to **Settings -> Scan Mods Folder -> Scan Now**. This will populate the manager with your existing mods. Run this again whenever you manually add or delete mods outside the manager.
3.  **Importing:**
    *   Click the **Import Mod** button in the sidebar.
    *   Select a `.zip`, `.7z`, or `.rar` archive.
    *   **Alternatively:** Drag and drop a supported archive file directly onto the GMM window.
    *   Review the detected archive contents and select the correct **Mod Root Folder** (the folder containing the actual mod files/INI).
    *   Fill in/correct the Mod Name, Target Entity, and other details.
    *   Click **Confirm Import**.
4.  **Browsing:** Use the sidebar to navigate between categories (Characters, Weapons, etc.). Click on an entity card (e.g., Raiden Shogun) to view its mods.
5.  **Managing Mods:**
    *   Click the toggle switch on a mod card (Grid view) or list item (List view) to enable or disable it.
    *   Use the pencil icon to edit mod details (name, description, author, tags, preview image, target entity).
    *   Use the trash icon to delete a mod (removes from disk and database).
    *   Use the keyboard icon to view detected keybinds from the mod's INI files.
6.  **Bulk Actions (List View):**
    *   Check the boxes next to mods in the list view.
    *   Use the "Enable Selected" / "Disable Selected" buttons that appear in the header.
7.  **Presets:**
    *   Go to the **Presets** page.
    *   Enter a name and click **Create Preset** to save your current enabled/disabled mod configuration.
    *   Click the play icon next to a preset to apply it.
    *   Use other icons to overwrite, favorite, or delete presets.
8.  **Quick Launch:** Click the **Quick Launch** button in the sidebar to start the executable configured in Settings.

---

## 🛠️ Development

**Prerequisites:**

*   [Node.js](https://nodejs.org/) (LTS recommended) and npm/yarn
*   [Rust Language Toolchain](https://www.rust-lang.org/tools/install)
*   Tauri Prerequisites (See the [Tauri Guide](https://tauri.app/v1/guides/getting-started/prerequisites))

**Setup:**

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/Eidenz/gmm.git
    cd gmm
    ```
2.  **Install frontend dependencies:**
    ```bash
    npm install
    # or
    yarn install
    ```
3.  **Run in development mode:**
    ```bash
    npm run tauri dev
    ```
    This will start the Vite frontend dev server and the Tauri backend.

**Build:**

```bash
npm run tauri build
```

This will build the frontend and bundle the final application according to your tauri.conf.json settings.

## 💻 Technology Stack

- **Framework:** Tauri
- **Backend:** Rust
- **Frontend:** React, Vite
- **Database:** SQLite (via rusqlite)
- **Icons:** Font Awesome
