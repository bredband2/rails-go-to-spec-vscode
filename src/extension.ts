import * as vscode from "vscode";
import * as resolver from "./resolver";
import * as fs from "fs";
import * as path from "path";
import * as mkdirp from "mkdirp";

async function openFile(fileName: string) {
	return vscode.workspace.openTextDocument(fileName)
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

function openPrompt(related: string): void {
	const dirname: string = path.dirname(related);
	const relative = vscode.workspace.asRelativePath(related);
	prompt(relative, function () {
		mkdirp.sync(dirname);
		fs.closeSync(fs.openSync(related, "w"));
		openFile(related);
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
				let position: vscode.Position | undefined = undefined;

				if (fromSpec) {
					const srcUri = vscode.Uri.parse(relatedFile)

					const currentLine = editor.selection.start.line;
					const line = editor.document.getText()
						.split("\n")
						.slice(0, currentLine + 1)
						.map((line, lineNo) => {
							const m = line.match(/\s*describe\s+"([#.])(\w+[\?\!]?)"\s+do\s*/)
							if (m) {
								const name = m[1] == "." ? "self." + m[2] : m[2];
								return { name, lineNo }
							}
							return undefined
						})
						.reverse()
						.find(b => !!b);

					if (line) {
						const symbolName = line.name
						const symbols: (vscode.SymbolInformation | vscode.DocumentSymbol)[] = await vscode.commands.executeCommand('vscode.executeDocumentSymbolProvider', srcUri);

						function findSymbolByName(nodes: (vscode.SymbolInformation | vscode.DocumentSymbol)[], name: string): vscode.SymbolInformation | vscode.DocumentSymbol | undefined {
							for (let node of nodes) {
								if (node.name === name) {
									return node;
								}

								if ((node as vscode.DocumentSymbol).children) {
									const symbol = findSymbolByName((node as vscode.DocumentSymbol).children, name);
									if (symbol) {
										return symbol;
									}
								}
							}
							return undefined;
						};

						const symbol = findSymbolByName(symbols, symbolName);
						if (symbol instanceof vscode.SymbolInformation) {
							position = symbol.location.range.start;
						} else if (symbol) {
							position = symbol.range.start;
						}
					}
				} else {
					function getRange(symbol: vscode.SymbolInformation | vscode.DocumentSymbol) {
						if (symbol instanceof vscode.SymbolInformation) {
							return symbol.location.range;
						} else if (symbol) {
							return symbol.range;
						}
						const p = new vscode.Position(-1, -1);
						return new vscode.Range(p, p)
					}

					function getChildren(symbol: vscode.SymbolInformation | vscode.DocumentSymbol) {
						return (symbol as vscode.DocumentSymbol).children || [];
					}

					const srcUri = editor.document.uri
					const symbols: (vscode.SymbolInformation | vscode.DocumentSymbol)[] = await vscode.commands.executeCommand('vscode.executeDocumentSymbolProvider', srcUri);

					function findSymbolByPosition(nodes: (vscode.SymbolInformation | vscode.DocumentSymbol)[], position: vscode.Position): vscode.SymbolInformation | vscode.DocumentSymbol | undefined {
						for (let node of nodes) {
							if (getRange(node).contains(position)) {
								if (getChildren(node).length <= 0) {
									return node;
								} else {
									return findSymbolByPosition(getChildren(node), position);
								}
							}
						}
						return undefined;
					};

					const symbol = findSymbolByPosition(symbols, editor.selection.start);
					if (symbol) {
						const specName = symbol.name.startsWith("self.") ? ("." + symbol.name.substring(5)) : ("#" + symbol.name);
						const index = relatedDocument.getText()
							.split("\n")
							.findIndex(line => line.includes("\"" + specName + "\""));

						if (index >= 0) {
							position = new vscode.Position(index, 0);
						}
					}
				}

				showDocument(relatedDocument, position);
				break;
			}
		};

		let first = related[0];
		if (first != null) {
			openPrompt(first);
		}
	});

	context.subscriptions.push(disposable);
}

// This method is called when your extension is deactivated
export function deactivate() { }
