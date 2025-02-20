import { snakeCase } from "change-case-all";
import * as vscode from "vscode";

type Symbol = vscode.SymbolInformation | vscode.DocumentSymbol;

export enum RSpecSymbolKind {
    InstanceMethodSpec = 0,
    ClassMethodSpec = 1,
}

export class RSpecSymbol {
    /**
     * Creates a new document symbol.
     *
     * @param name The name of the symbol.
     * @param kind The kind of the symbol.
     * @param range The full range of the symbol.
     */
    constructor(public name: string, public kind: RSpecSymbolKind, public range: vscode.Range) { };
}

interface ClassParseResult {
    symbols: Symbol[];
    methods: Symbol[];
    publicMethods: Symbol[];
    superType: string | undefined;
    typeName: string | undefined;
    fullTypeName: string | undefined
    expectedTypeName: string;
};

interface RSpecParseResult {
    symbols: RSpecSymbol[];
};


function getChildren(symbol: Symbol): Symbol[] {
    return (symbol as vscode.DocumentSymbol).children || [];
}

export function getRange(symbol: Symbol | RSpecSymbol): vscode.Range {
    if (symbol instanceof vscode.SymbolInformation) {
        return symbol.location.range;
    } else if (symbol) {
        return symbol.range;
    }
    const p = new vscode.Position(-1, -1);
    return new vscode.Range(p, p);
}

export function findSymbolByName(nodes: Symbol[], name: string): Symbol | undefined {
    for (let node of nodes) {
        if (node.name == name) {
            return node;
        }
        const symbol = findSymbolByName(getChildren(node), name);
        if (symbol) {
            return symbol;
        }
    }
    return undefined;
}


export function findSymbolByPosition(nodes: Symbol[], position: vscode.Position): Symbol | undefined {
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

export function findSpecSymbolByPosition(nodes: RSpecSymbol[], position: vscode.Position): RSpecSymbol | undefined {
    // TODO: fix better range for RSpecSymbol when parsing...
    return nodes.sort((a, b) => getRange(b).start.compareTo(getRange(a).start)).find(n => getRange(n).start.line <= position.line);

    // for (let node of nodes) {
    //     if (getRange(node).contains(position)) {
    //         return node;
    //     }
    // }
    // return undefined;
};

export function findSpecBySymbol(nodes: RSpecSymbol[], symbol: Symbol): RSpecSymbol | undefined {
    return nodes.find(n => n.name == symbol.name);
}

function filePathToTypeName(path: string) {
    return path.slice(path.lastIndexOf("/") + 1, path.indexOf(".", path.lastIndexOf("/"))).replace(/_/g, "")
}

export async function parseClassFile(src: vscode.TextDocument): Promise<ClassParseResult> {
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
            superType = "module"
        } else if (typeDefinition.startsWith("class ")) {
            superType = "class"
        }
    }

    //const expectedClassName = srcUri.path.slice(srcUri.path.lastIndexOf("/") + 1, srcUri.path.indexOf(".", srcUri.path.lastIndexOf("/"))).replace(/_/g, "")


    return { symbols, methods, publicMethods, superType, typeName, fullTypeName, expectedTypeName };
}

export async function parseSpecFile(src: vscode.TextDocument): Promise<RSpecParseResult> {
    const lines = src.getText()
        .split("\n");

    const symbols = lines
        .map((line, lineNo) => {
            const m = line.match(/(\s*)describe\s+"([#.])(\w+[\?\!]?)"\s+do(\s*)/);
            if (m) {
                const name = m[3];
                const kind = m[2] == "." ? RSpecSymbolKind.ClassMethodSpec : RSpecSymbolKind.InstanceMethodSpec;
                const range = new vscode.Range(new vscode.Position(lineNo, m[1].length), new vscode.Position(lineNo, line.length - m[4].length));
                return new RSpecSymbol(name, kind, range);
            }
            return undefined;
        })
        .filter(s => !!s);
    return { symbols };
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


export function generateSpecForSymbol(symbol: Symbol, context: ClassParseResult): string {
    return "\n" + getSpecDefinition(symbol) + "\n";
}

function generateInteractorSpec(context: ClassParseResult): string | undefined {
    if (!context.typeName) {
        console.error("No typeName for Interactor found in context", context);
        return undefined;
    }
    const className = snakeCase(context.typeName);
    const classNameSnakeCase = snakeCase(context.typeName);
    const publicMethods = context.publicMethods;
    return `require "spec_helper"
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
`;
}

export function generateSpecForClass(context: ClassParseResult): string | undefined {
    if (context.superType == "Interaction") {
        return generateInteractorSpec(context);
    } else {
        if (!context.typeName) {
            console.error("No typeName for class found in context", context);
            return undefined;
        }

        const className = snakeCase(context.typeName);
        const classNameSnakeCase = snakeCase(context.typeName);
        const publicMethods = context.publicMethods;

        return `require "spec_helper"

describe ${className} do
  subject{described_class.new}

${publicMethods.map((m) => getSpecDefinition(m)).join("\n\n")}
end
`;
    }
};
