import * as vscode from "vscode";
import * as resolver from "./resolver";
import * as fs from "fs";
import * as path from "path";
import * as mkdirp from "mkdirp";
import { snakeCase } from "change-case-all";

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

function isSpecableSymbol(symbol: vscode.SymbolInformation | vscode.DocumentSymbol) {
	return symbol.kind == vscode.SymbolKind.Method || symbol.kind == vscode.SymbolKind.Function;
}

function getSpecName(symbol: vscode.SymbolInformation | vscode.DocumentSymbol) {
	return symbol.name.startsWith("self.") ? ("." + symbol.name.substring(5)) : ("#" + symbol.name);
}

function getSpecWhen(symbol: vscode.SymbolInformation | vscode.DocumentSymbol) {
	return "When(:result){" + (symbol.name.startsWith("self.") ? ("described_class." + symbol.name.substring(5)) : ("subject." + symbol.name)) + "}";
}

function getSpecDefinition(symbol: vscode.SymbolInformation | vscode.DocumentSymbol) {
	const name = getSpecName(symbol);
	const when = getSpecWhen(symbol);
	return `  describe "${name}" do\n    ${when}\n    Then{expect(result).to eq :TODO}\n  end`
}

function getChildren(symbol: vscode.SymbolInformation | vscode.DocumentSymbol) {
	return (symbol as vscode.DocumentSymbol).children;
}

function getRange(symbol: vscode.SymbolInformation | vscode.DocumentSymbol) {
	if (symbol instanceof vscode.SymbolInformation) {
		return symbol.location.range;
	} else if (symbol) {
		return symbol.range;
	}
	const p = new vscode.Position(-1, -1);
	return new vscode.Range(p, p);
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
				let inject: string | undefined = undefined;

				if (fromSpec) {
					const srcUri = vscode.Uri.parse(relatedFile);

					const currentLine = editor.selection.start.line;
					const lines = editor.document.getText()
						.split("\n")
						.slice(0, currentLine + 1);

					const line = lines
						.map((line, lineNo) => {
							const m = line.match(/\s*describe\s+"([#.])(\w+[\?\!]?)"\s+do\s*/);
							if (m) {
								const name = m[1] == "." ? "self." + m[2] : m[2];
								return { name, lineNo };
							}
							return undefined;
						})
						.reverse()
						.find(b => !!b);

					if (line) {
						const symbolName = line.name;
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

					const srcUri = editor.document.uri;
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
					console.log("symbol", symbol, !!(symbol && isSpecableSymbol(symbol)))
					if (symbol && isSpecableSymbol(symbol)) {
						const specName = getSpecName(symbol)
						const index = relatedDocument.getText()
							.split("\n")
							.findIndex(line => line.includes("\"" + specName + "\""));

						if (index >= 0) {
							position = new vscode.Position(index, 0);
						} else {

							position = new vscode.Position(relatedDocument.lineCount - 2, 0);
							inject = "\n" + getSpecDefinition(symbol) + "\n";
						}
					}


				}

				const e = await showDocument(relatedDocument, position);
				if (inject) {
					e.edit(e => {
						if (!position || !inject) {
							return;
						}
						e.insert(position, inject)
						position = new vscode.Position(position?.line - 2, 4)
					})
				}

				return;
			}
		};
		type Symbol = vscode.SymbolInformation | vscode.DocumentSymbol;
		let newFileData: string | undefined = undefined;
		//No file found
		if (!fromSpec) {
			const srcUri = editor.document.uri;
			const symbols: Symbol[] = await vscode.commands.executeCommand('vscode.executeDocumentSymbolProvider', srcUri);
			console.log("symbols", symbols)
			const methods = symbols.reduce(function flatten(p, c) {
				console.log(vscode.SymbolKind[c.kind], c.name)
				if (c.kind == vscode.SymbolKind.Method || c.kind == vscode.SymbolKind.Function) {
					p.push(c);
				} else {
					getChildren(c).reduce(flatten, p);
				}
				return p;
			}, [] as Symbol[]);

			const text = editor.document.getText();
			const lines = text.split("\n");

			const accesses = lines.map(l => {
				const w = l.trim();
				if (["public", "protected", "private"].includes(w)) {
					return w;
				}
				return undefined;
			});

			console.log("accesses", accesses)
			const publicMethods = methods.filter(m => {
				const line = getRange(m).start.line;
				const access = accesses.slice(0, line).reverse().find(v => !!v) || "public";
				return access == "public";
			});

			console.log("publicMethods", publicMethods)


			const expectedClassName = srcUri.path.slice(srcUri.path.lastIndexOf("/") + 1, srcUri.path.indexOf(".", srcUri.path.lastIndexOf("/"))).replace(/_/g, "")
			const classPath = symbols.reduce(function findClassPath(p, c) {
				if (p.length > 0) {
					return p;
				}

				if ((c.kind == vscode.SymbolKind.Class && c.name.split("::").reverse()[0].toLowerCase() == expectedClassName) || getChildren(c).reduce(findClassPath, p).length > 0) {
					p.push(c);
				}

				return p;
			}, [] as Symbol[]).reverse();

			if (classPath.length > 0) {
				const className = classPath.map(m => m.name).join("::");
				console.log("classPath", classPath)
				console.log("className", className)

				const line = getRange(classPath[classPath.length - 1]).start.line;
				const isInteractor = lines[line].includes("< Interaction");
				// console.log("line", line, lines[line])
				// console.log("isInteractor: " + lines[line].includes("< Interaction"));


				let inject = "";
				if (isInteractor) {
					const classNameSnakeCase = snakeCase(classPath[classPath.length - 1].name);
					inject =
						`require "spec_helper"
describe ${className} do
  include InteractorHelpers

  Given(:listener){InteractorHelpers::ResponseSpy.new}
  subject{described_class.new(params, user)}

  Given(:user){create :user}
  Given(:params){{}}

  describe "#perform" do
    When{subject.add_listener(listener).perform}

    context "with valid parameters" do
      Then{expect(listener.interaction).to eq :${classNameSnakeCase}}
      And{expect(listener.state).to eq :success}
    end

    context "with invalid parameters" do
      Then{expect(listener.interaction).to eq :${classNameSnakeCase}}
      And{expect(listener.state).to eq :failure}
    end
  end

${publicMethods.filter((m => m.name != "perform")).map((m) => getSpecDefinition(m)).join("\n")}
end
`
				}
				else {


					inject = `require "spec_helper"\n\n` +
						`describe ${className} do\n` +
						`  subject{described_class.new}\n\n`;
					inject += publicMethods.map((m) => getSpecDefinition(m)).join("\n")
					inject += "end\n"
				}
				newFileData = inject;

				console.log("className", className)
				console.log("methods", methods)
				console.log("publicMethods", publicMethods)
				console.log("accesses", accesses)
				console.log("inject", inject)
			}
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
