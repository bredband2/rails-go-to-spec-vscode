import * as vscode from "vscode";

export type Symbol = vscode.SymbolInformation | vscode.DocumentSymbol;

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

export interface ClassContext {
    symbols: Symbol[];
    methods: Symbol[];
    publicMethods: Symbol[];
    superType: string | undefined;
    typeName: string | undefined;
    fullTypeName: string | undefined
    expectedTypeName: string;
};

export interface RSpecContext {
    symbols: RSpecSymbol[];
};


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