# Install from source
Download this git repository, and make a symlink to it in the ~/.vscode/extensions folder
```
ln -s /ABSOLUTE/PATH/TO/rails-go-to-spec-vscode ~/.vscode/extensions
```
# Modifications
The go-to-spec command now also does the following:
* moves the cursor to the related spec or method when switching file
* generate a stubbed spec for methods when no spec can be found, when going from a source file to a spec file
* generate a stubbed spec suite for a class when no spec file could be found, when going from a source file to a spec file

# Rails Go to Spec extension for VSCODE

Jump between code and spec in Rails projects.

To install search for

```
rails-go-to-spec-2
```

## Default keybinding:

- Ctrl + Shift + y
- Cmd + Shift + y (Mac)

## Redine shortcuts:

In keybindings.json

```
  ...
	{
		"key": "shift-cmd-y",
		"command": "rails-go-to-spec-2.railsGoToSpec",
		"when": "editorFocus"
	}
	...
```
