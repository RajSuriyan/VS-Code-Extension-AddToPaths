// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
const vscode = require('vscode');
const fs = require("fs");
const os = require("os");
const path = require("path");

let extensionContext;

const STATE_ADDED_PATHS_KEY = "taf-lance.addedExtraPaths";

function normalizeToArray(value) {
	if (!value) return [];
	if (Array.isArray(value)) return value;
	if (typeof value === "string") {
		// Support newline/comma/semicolon separated strings
		return value
			.split(/\r?\n|,|;/g)
			.map(s => s.trim())
			.filter(Boolean);
	}
	return [];
}

function expandTilde(inputPath) {
	if (typeof inputPath !== "string") return inputPath;
	if (inputPath === "~") return os.homedir();
	if (inputPath.startsWith("~\\") || inputPath.startsWith("~/")) {
		return path.join(os.homedir(), inputPath.slice(2));
	}
	return inputPath;
}

function expandEnvVars(inputPath) {
	if (typeof inputPath !== "string") return inputPath;
	// %VAR% (Windows)
	let output = inputPath.replace(/%([^%]+)%/g, (match, name) => process.env[name] ?? match);
	// ${VAR} (cross-platform)
	output = output.replace(/\$\{([^}]+)\}/g, (match, name) => process.env[name] ?? match);
	return output;
}

function normalizeForCompare(p) {
	try {
		return path.resolve(p).replace(/[\\/]+$/, "").toLowerCase();
	} catch {
		return String(p).toLowerCase();
	}
}

function uniquePaths(paths) {
	const seen = new Set();
	const result = [];
	for (const p of paths) {
		const key = normalizeForCompare(p);
		if (seen.has(key)) continue;
		seen.add(key);
		result.push(p);
	}
	return result;
}

function resolveImportPath(configFilePath, rawPath) {
	if (typeof rawPath !== "string") return undefined;
	let candidate = rawPath.trim();
	if (!candidate) return undefined;
	candidate = expandEnvVars(expandTilde(candidate));
	const baseDir = path.dirname(configFilePath);
	const absPath = path.isAbsolute(candidate) ? candidate : path.resolve(baseDir, candidate);
	return path.normalize(absPath);
}

async function removePreviouslyAddedExtraPaths(context) {
	const added = context.workspaceState.get(STATE_ADDED_PATHS_KEY, []);
	if (!Array.isArray(added) || added.length === 0) return;

	const addedKeys = new Set(added.map(normalizeForCompare));
	const target = vscode.ConfigurationTarget.Workspace;

	const analysisCfg = vscode.workspace.getConfiguration("python.analysis");
	const currentAnalysis = analysisCfg.get("extraPaths", []);
	if (Array.isArray(currentAnalysis)) {
		const filtered = currentAnalysis.filter(p => !addedKeys.has(normalizeForCompare(p)));
		await analysisCfg.update("extraPaths", filtered, target);
	}

	const autoCfg = vscode.workspace.getConfiguration("python.autoComplete");
	const currentAuto = autoCfg.get("extraPaths", []);
	if (Array.isArray(currentAuto)) {
		const filtered = currentAuto.filter(p => !addedKeys.has(normalizeForCompare(p)));
		await autoCfg.update("extraPaths", filtered, target);
	}

	await context.workspaceState.update(STATE_ADDED_PATHS_KEY, []);
}

async function addExtraPaths(context, extraPathsToAdd) {
	const target = vscode.ConfigurationTarget.Workspace;

	const analysisCfg = vscode.workspace.getConfiguration("python.analysis");
	const currentAnalysis = analysisCfg.get("extraPaths", []);
	const nextAnalysis = uniquePaths([...(Array.isArray(currentAnalysis) ? currentAnalysis : []), ...extraPathsToAdd]);
	await analysisCfg.update("extraPaths", nextAnalysis, target);

	const autoCfg = vscode.workspace.getConfiguration("python.autoComplete");
	const currentAuto = autoCfg.get("extraPaths", []);
	const nextAuto = uniquePaths([...(Array.isArray(currentAuto) ? currentAuto : []), ...extraPathsToAdd]);
	await autoCfg.update("extraPaths", nextAuto, target);

	await context.workspaceState.update(STATE_ADDED_PATHS_KEY, extraPathsToAdd);
}

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed

/**
 * @param {vscode.ExtensionContext} context
 */
async function activate(context) {
	extensionContext = context;

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Congratulations, your extension "taf-lance" is now active!');

	// The command has been defined in the package.json file
	// Now provide the implementation of the command with  registerCommand
	// The commandId parameter must match the command field in package.json
	const disposable = vscode.commands.registerCommand('taf-lance.addToPaths', async function () {
		// Remove anything we added previously before applying new paths
		await removePreviouslyAddedExtraPaths(context);

		// The code you place here will be executed every time your command is executed
		const result = await vscode.window.showOpenDialog({
		canSelectMany: false,
		openLabel: "Select config*.json",
		filters: {
			JSON: ["json"]
		}
		});
		if(!result || result.length === 0) {
			vscode.window.showErrorMessage("No file selected");
			return;
		}
		const configFilePath = result[0].fsPath;
		const content = fs.readFileSync(configFilePath, "utf-8");
		const config = JSON.parse(content);

		const rawImports = config?.paths;
		const importPaths = normalizeToArray(rawImports);
		if (importPaths.length === 0) {
			vscode.window.showWarningMessage("No paths found in config.");
			return;
		}

		const resolved = importPaths
			.map(p => resolveImportPath(configFilePath, p))
			.filter(Boolean);

		const existingDirs = [];
		const missing = [];
		for (const p of resolved) {
			try {
				if (fs.existsSync(p)) {
					existingDirs.push(p);
				} else {
					missing.push(p);
				}
			} catch {
				missing.push(p);
			}
		}

		const toAdd = uniquePaths(existingDirs);
		if (toAdd.length === 0) {
			vscode.window.showWarningMessage("Resolved extraPaths, but none exist on disk.");
			if (missing.length) console.log("taf-lance missing paths:", missing);
			return;
		}

		await addExtraPaths(context, toAdd);

		console.log("taf-lance added extraPaths:", toAdd);
		if (missing.length) console.log("taf-lance missing paths:", missing);
		vscode.window.showInformationMessage(`Added ${toAdd.length} path(s) to Python IntelliSense extraPaths.`);

		
	});



	context.subscriptions.push(disposable);
}

// This method is called when your extension is deactivated
function deactivate() {
	if (!extensionContext) return undefined;
	return removePreviouslyAddedExtraPaths(extensionContext).catch(err => {
		console.error("taf-lance cleanup failed:", err);
	});
}

module.exports = {
	activate,
	deactivate
}
