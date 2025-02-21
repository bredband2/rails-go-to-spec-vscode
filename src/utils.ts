import * as vscode from "vscode";

export type Symbol = vscode.SymbolInformation | vscode.DocumentSymbol;

export enum RSpecSymbolKind {
    InstanceMethodSpec = 0, // eslint-disable-line @typescript-eslint/naming-convention
    ClassMethodSpec = 1, // eslint-disable-line @typescript-eslint/naming-convention
}

export class RSpecSymbol {
    /**
     * Creates a new document symbol.
     *
     * @param name The name of the symbol.
     * @param kind The kind of the symbol.
     * @param range The full range of the symbol.
     */
    constructor(public name: string, public kind: RSpecSymbolKind, public range: vscode.Range) { }
}

export interface ClassContext {
    symbols: Symbol[];
    methods: Symbol[];
    publicMethods: Symbol[];
    superType: string | undefined;
    typeName: string | undefined;
    fullTypeName: string | undefined
    expectedTypeName: string;
}

export interface RSpecContext {
    symbols: RSpecSymbol[];
}


export function getChildren(symbol: Symbol): Symbol[] {
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

export function findSymbolByPosition(nodes: Symbol[], position: vscode.Position): Symbol | undefined;
export function findSymbolByPosition(nodes: RSpecSymbol[], position: vscode.Position): RSpecSymbol | undefined;
export function findSymbolByPosition(nodes: (Symbol | RSpecSymbol)[], position: vscode.Position): Symbol | RSpecSymbol | undefined {
    return nodes.find(n => getRange(n).contains(position));
}

export function findSpecBySymbol(nodes: RSpecSymbol[], symbol: Symbol): RSpecSymbol | undefined {
    return nodes.find(n => n.name == symbol.name);
}

export function isSpecableSymbol(symbol?: vscode.SymbolInformation | vscode.DocumentSymbol): boolean {
    return !!symbol && (symbol.kind == vscode.SymbolKind.Method || symbol.kind == vscode.SymbolKind.Function);
}
