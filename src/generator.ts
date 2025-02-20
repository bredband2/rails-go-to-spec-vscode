import { snakeCase } from "change-case-all";
import * as vscode from "vscode";
import { ClassContext, Symbol } from "./utils";


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


export function generateSpecForSymbol(symbol: Symbol, context: ClassContext): string {
    return "\n" + getSpecDefinition(symbol) + "\n";
}

function generateInteractorSpec(context: ClassContext): string | undefined {
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

export function generateSpecForClass(context: ClassContext): string | undefined {
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
