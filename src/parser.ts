import * as vscode from "vscode";
import { ClassContext, getChildren, getRange, RSpecContext, RSpecSymbol, RSpecSymbolKind, Symbol } from "./utils";

function filePathToTypeName(path: string) {
    return path.slice(path.lastIndexOf("/") + 1, path.indexOf(".", path.lastIndexOf("/"))).replace(/_/g, "")
}

export async function parseClassFile(src: vscode.TextDocument): Promise<ClassContext> {
    const symbols: Symbol[] = await vscode.commands.executeCommand('vscode.executeDocumentSymbolProvider', src.uri);

    const text = src.getText();
    const lines = text.split("\n");

    const accesses = lines.map(l => {
        const w = l.trim();
        if (["public", "protected", "private"].includes(w)) {
            return w;
        }
        return undefined;
    });

    const methods = symbols.reduce(function flatten(p, c) {
        if (c.kind == vscode.SymbolKind.Method || c.kind == vscode.SymbolKind.Function) {
            p.push(c);
        } else {
            getChildren(c).reduce(flatten, p);
        }
        return p;
    }, [] as Symbol[]);

    const publicMethods = methods.filter(m => {
        const line = getRange(m).start.line;
        const access = accesses.slice(0, line).reverse().find(v => !!v) || "public";
        return access == "public";
    });

    const expectedTypeName = filePathToTypeName(src.uri.path);
    const typePath = symbols.reduce(function findTypePath(p, c) {
        if (p.length > 0) {
            return p;
        }

        // TODO: add support for module
        if ((c.kind == vscode.SymbolKind.Class && c.name.split("::").reverse()[0].toLowerCase() == expectedTypeName) || getChildren(c).reduce(findTypePath, p).length > 0) {
            p.push(c);
        }

        return p;
    }, [] as Symbol[]).reverse();

    let superType = undefined;
    let typeName = undefined;
    let fullTypeName = undefined;
    if (typePath.length > 0) {
        typeName = typePath[typePath.length - 1].name;
        fullTypeName = typePath.map(m => m.name).join("::");
        const typeDefinitionLine = getRange(typePath[typePath.length - 1]).start.line;
        const typeDefinition = lines[typeDefinitionLine].trim();
        if (typeDefinition.includes("<")) {
            superType = typeDefinition.substring(typeDefinition.indexOf("<") + 1).trim();
        } else if (typeDefinition.startsWith("module ")) {
            superType = "module";
        } else if (typeDefinition.startsWith("class ")) {
            superType = "class";
        }
    }

    return { symbols, methods, publicMethods, superType, typeName, fullTypeName, expectedTypeName };
}

export async function parseSpecFile(src: vscode.TextDocument): Promise<RSpecContext> {
    const lines = src.getText().split("\n");

    interface Block {
        line: string;
        range: vscode.Range;
        parent: Block | undefined;
        children: Block[];
    }

    const blocks = [] as Block[];
    const stack = [] as Block[];
    lines.forEach((line, lineNo) => {
        const parts = line.match(/(\s*)\bdo\b(\s*\|\w+.*\|)?\s*$/);
        if (parts) {
            const parent = stack[stack.length];
            const range = new vscode.Range(new vscode.Position(lineNo, 0), new vscode.Position(lineNo, line.length));
            const block = { line, range, parent, children: [] };
            blocks.push(block);
            stack.push(block);
            if (parent) {
                parent.children.push(block);
            }
        } else if (line.trim() == "end") {
            const block = stack.pop();
            if (block) {
                block.range = new vscode.Range(block.range.start, new vscode.Position(lineNo, line.length));
            }
        }
    });

    const symbols = blocks.map(block => {
        const m = block.line.match(/(\s*)describe\s+"([#.])(\w+[\?\!]?)"\s+do(\s*)/);

        if (m) {
            const name = m[3];
            const kind = m[2] == "." ? RSpecSymbolKind.ClassMethodSpec : RSpecSymbolKind.InstanceMethodSpec;
            return new RSpecSymbol(name, kind, block.range);
        }
        return undefined;
    }).filter(s => !!s) as RSpecSymbol[];
    return { symbols };
}
