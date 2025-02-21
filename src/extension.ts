import * as vscode from "vscode";
import * as resolver from "./resolver";
import * as fs from "fs";
import * as path from "path";
import * as mkdirp from "mkdirp";
import { parseClassFile, parseSpecFile } from "./parser";
import { generateSpecForSymbol, generateSpecForClass } from "./generator";
import { findSymbolByPosition, findSymbolByName, findSpecBySymbol, getRange } from "./utils";

async function openFile(fileName: string) {
	return vscode.workspace.openTextDocument(fileName);
}

async function showDocument(document: vscode.TextDocument, position?: vscode.Position) {
	const selection = position ? new vscode.Range(position, position) : undefined;
	return vscode.window.showTextDocument(document, { selection });
}

function prompt(fileName: string, cb: any) {
	let options = {
		placeHolder: `Create ${fileName}?`
	};

	vscode.window.showQuickPick(["Yes", "No"], options)
		.then(function (answer) {
			if (answer === "Yes") {
				cb();
			}
		});
}

async function openPrompt(related: string, data?: string) {
	const dirname: string = path.dirname(related);
	const relative = vscode.workspace.asRelativePath(related);
	prompt(relative, function () {
		mkdirp.sync(dirname);
		const f = fs.openSync(related, "w")
		if (data) { fs.writeFileSync(f, data); }
		fs.closeSync(f);
		openFile(related)
			.then(doc => showDocument(doc));
	});
}



// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log("Congratulations, your extension 'rails-go-to-spec-2' is now active!");

	// The command has been defined in the package.json file
	// Now provide the implementation of the command with registerCommand
	// The commandId parameter must match the command field in package.json
	let disposable = vscode.commands.registerCommand("rails-go-to-spec-2.railsGoToSpec", async () => {
		// Display a message box to the user
		var editor = vscode.window.activeTextEditor;
		if (!editor) {
			return; // No open text editor
		}

		let document: vscode.TextDocument = editor.document;
		let fileName: string = document.fileName;
		// Get a list of related files
		// if any of those exists, open it
		// Otherwise prompt to create the first one
		const fromSpec = resolver.isSpec(fileName);
		let related: Array<string> = resolver.getRelated(fileName);

		for (let relatedFile of related) {
			let fileExists: boolean = fs.existsSync(relatedFile);
			if (fileExists) {
				const relatedDocument = await openFile(relatedFile);
				const specDocument = fromSpec ? document : relatedDocument;
				const classDocument = fromSpec ? relatedDocument : document;

				let newRange: vscode.Range | undefined = undefined;
				let inject: string | undefined = undefined;

				const specContext = await parseSpecFile(specDocument);
				const classContext = await parseClassFile(classDocument);

				console.log("specContext", specContext);
				console.log("classContext", classContext);

				if (fromSpec) {
					const currentSpec = findSymbolByPosition(specContext.symbols, editor.selection.start);
					if (currentSpec) {
						const symbol = findSymbolByName(classContext.symbols, currentSpec.name);
						if (symbol) {
							const range = getRange(symbol);
							newRange = range;
						}
					}
				} else {
					const currentSymbol = findSymbolByPosition(classContext.publicMethods, editor.selection.start);
					if (currentSymbol) {
						const currentSpec = findSpecBySymbol(specContext.symbols, currentSymbol);
						if (currentSpec) {
							newRange = currentSpec.range;
						} else {
							inject = generateSpecForSymbol(currentSymbol, classContext);
							const start = new vscode.Position(relatedDocument.lineCount - 2, 0);
							newRange = new vscode.Range(start, start);
						}
					}
				}

				const e = await showDocument(relatedDocument);
				if (inject) {
					await e.edit(e => {
						if (!newRange || !inject) {
							return;
						}
						e.insert(newRange.start, inject);
					});
				}
				if (newRange && !newRange.contains(e.selection)) {
					e.selections = [new vscode.Selection(newRange.start, newRange.start)];
				}
				return;
			}
		};

		let newFileData: string | undefined = undefined;
		//No file found
		if (!fromSpec) {
			const classContext = await parseClassFile(document);
			newFileData = generateSpecForClass(classContext);
		}

		let first = related[0];
		if (first != null) {
			openPrompt(first, newFileData);
		}
	});

	context.subscriptions.push(disposable);
}

// This method is called when your extension is deactivated
export function deactivate() { }
