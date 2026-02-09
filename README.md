# 🧠 VS Code Extension – JSON Path Autocomplete for Pylance

> Automatically adds paths from a selected `config*.json` file to Python IntelliSense (Pylance) in VS Code.  
> No more broken imports because your paths weren’t wired correctly.

---

## ✨ What This Does

This extension helps Python projects that rely on dynamic or external paths (e.g., hardware SDKs, vendor APIs, internal tools).

It lets you:

- 📂 Select a `config*.json` file from the workspace  
- 🔍 Read path entries from the JSON  
- ➕ Inject those paths into VS Code / Pylance so imports autocomplete correctly  
- 🔁 Re-run when config changes  
- 🧩 Avoid manually editing `PYTHONPATH` or VS Code settings every time  

Typical use case:

```json
{
  "paths": [
    "./sdk",
    "./vendor_api",
    "./generated"
  ]
}
